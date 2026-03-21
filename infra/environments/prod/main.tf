terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "ssb-terraform-state"
    key            = "ssb/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ssb-terraform-lock"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# --- Memory Layer ---

module "dynamodb" {
  source     = "../../modules/dynamodb"
  table_name = "${var.project_name}-${var.environment}-knowledge-graph"
}

module "s3_content" {
  source      = "../../modules/s3"
  bucket_name = "${var.project_name}-${var.environment}-content"
}

# --- IAM Policies ---

module "iam" {
  source             = "../../modules/iam"
  project_name       = var.project_name
  environment        = var.environment
  dynamodb_table_arn = module.dynamodb.table_arn
  s3_bucket_arn      = module.s3_content.bucket_arn
}

# --- Compute Layer ---

locals {
  capture_env = {
    TABLE_NAME       = module.dynamodb.table_name
    BUCKET_NAME      = module.s3_content.bucket_name
    BEDROCK_MODEL_ID = var.bedrock_model_id
    ENVIRONMENT      = var.environment
  }
  capture_policies = [
    module.iam.dynamodb_write_policy_arn,
    module.iam.s3_write_policy_arn,
    module.iam.bedrock_invoke_policy_arn,
  ]
}

module "capture_lambda" {
  source                = "../../modules/lambda"
  function_name         = "${var.project_name}-${var.environment}-capture"
  handler               = "functions/capture/index.handler"
  memory_size           = 512
  timeout               = 30
  environment_variables = local.capture_env
  policy_arns           = local.capture_policies
}

module "capture_validate" {
  source                = "../../modules/lambda"
  function_name         = "${var.project_name}-${var.environment}-capture-validate"
  handler               = "functions/capture/index.validate"
  memory_size           = 256
  timeout               = 10
  environment_variables = local.capture_env
  policy_arns           = [module.iam.dynamodb_read_policy_arn]
}

module "capture_classify" {
  source                = "../../modules/lambda"
  function_name         = "${var.project_name}-${var.environment}-capture-classify"
  handler               = "functions/capture/index.classify"
  memory_size           = 512
  timeout               = 30
  environment_variables = local.capture_env
  policy_arns = [
    module.iam.dynamodb_read_policy_arn,
    module.iam.bedrock_invoke_policy_arn,
  ]
}

module "capture_persist" {
  source                = "../../modules/lambda"
  function_name         = "${var.project_name}-${var.environment}-capture-persist"
  handler               = "functions/capture/index.persist"
  memory_size           = 256
  timeout               = 10
  environment_variables = local.capture_env
  policy_arns = [
    module.iam.dynamodb_write_policy_arn,
    module.iam.s3_write_policy_arn,
  ]
}

module "capture_create_edges" {
  source                = "../../modules/lambda"
  function_name         = "${var.project_name}-${var.environment}-capture-edges"
  handler               = "functions/capture/index.createEdges"
  memory_size           = 256
  timeout               = 10
  environment_variables = local.capture_env
  policy_arns           = [module.iam.dynamodb_write_policy_arn]
}


module "search_lambda" {
  source        = "../../modules/lambda"
  function_name = "${var.project_name}-${var.environment}-search"
  handler       = "functions/search/handler.handler"
  memory_size   = 512
  timeout       = 30

  environment_variables = {
    TABLE_NAME                 = module.dynamodb.table_name
    BEDROCK_EMBEDDING_MODEL_ID = var.bedrock_embedding_model_id
    CORS_ALLOW_ORIGIN          = var.cors_allow_origin
    ENVIRONMENT                = var.environment
  }

  policy_arns = [
    module.iam.dynamodb_read_policy_arn,
    module.iam.bedrock_invoke_policy_arn,
  ]
}

module "graph_lambda" {
  source        = "../../modules/lambda"
  function_name = "${var.project_name}-${var.environment}-graph"
  handler       = "functions/graph/handler.handler"
  memory_size   = 256
  timeout       = 10

  environment_variables = {
    TABLE_NAME        = module.dynamodb.table_name
    BUCKET_NAME       = module.s3_content.bucket_name
    CORS_ALLOW_ORIGIN = var.cors_allow_origin
    ENVIRONMENT       = var.environment
  }

  policy_arns = [
    module.iam.dynamodb_read_policy_arn,
    module.iam.s3_read_policy_arn,
  ]
}
# --- SNS ---

module "capture_complete_topic" {
  source     = "../../modules/sns"
  topic_name = "${var.project_name}-${var.environment}-capture-complete"
}

# --- Step Functions ---

module "capture_pipeline" {
  source = "../../modules/step-functions"
  name   = "${var.project_name}-${var.environment}-capture-pipeline"
  type   = "EXPRESS"

  definition = jsonencode({
    Comment = "Capture pipeline: validate → classify → persist → edges → notify"
    StartAt = "ValidateInput"
    States = {
      ValidateInput = {
        Type     = "Task"
        Resource = module.capture_validate.function_arn
        Next     = "GenerateMetadata"
        Catch = [{
          ErrorEquals = ["ValidationError"]
          Next        = "FailValidation"
          ResultPath  = "$.error"
        }]
      }
      GenerateMetadata = {
        Type     = "Task"
        Resource = module.capture_classify.function_arn
        Next     = "PersistNode"
        Retry = [{
          ErrorEquals     = ["BedrockError", "States.TaskFailed"]
          IntervalSeconds = 2
          MaxAttempts     = 3
          BackoffRate     = 2.0
        }]
        Catch = [{
          ErrorEquals = ["DuplicateError"]
          Next        = "FailDuplicate"
          ResultPath  = "$.error"
          }, {
          ErrorEquals = ["States.ALL"]
          Next        = "FailBedrock"
          ResultPath  = "$.error"
        }]
      }
      PersistNode = {
        Type     = "Task"
        Resource = module.capture_persist.function_arn
        Next     = "CreateEdges"
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 1
          MaxAttempts     = 2
          BackoffRate     = 2.0
        }]
      }
      CreateEdges = {
        Type     = "Task"
        Resource = module.capture_create_edges.function_arn
        Next     = "NotifySuccess"
      }
      NotifySuccess = {
        Type     = "Task"
        Resource = "arn:aws:states:::sns:publish"
        Parameters = {
          TopicArn = module.capture_complete_topic.topic_arn
          Message = {
            "source"   = "capture-pipeline"
            "detail.$" = "$"
          }
        }
        ResultPath = null
        End        = true
      }
      FailValidation = {
        Type  = "Fail"
        Error = "validation_error"
        Cause = "{\"error\":\"validation_error\",\"message\":\"Invalid input\"}"
      }
      FailDuplicate = {
        Type  = "Fail"
        Error = "duplicate_slug"
        Cause = "{\"error\":\"duplicate_slug\",\"message\":\"Node already exists\"}"
      }
      FailBedrock = {
        Type  = "Fail"
        Error = "bedrock_unavailable"
        Cause = "{\"error\":\"bedrock_unavailable\",\"message\":\"AI classification service temporarily unavailable\"}"
      }
    }
  })

  lambda_arns = [
    module.capture_validate.function_arn,
    module.capture_classify.function_arn,
    module.capture_persist.function_arn,
    module.capture_create_edges.function_arn,
  ]

  sns_topic_arns = [module.capture_complete_topic.topic_arn]
}

# --- Interface Layer ---

module "api_gateway" {
  source                      = "../../modules/api-gateway"
  api_name                    = "${var.project_name}-${var.environment}-api"
  stage_name                  = var.environment
  capture_state_machine_arn   = module.capture_pipeline.state_machine_arn
  search_lambda_invoke_arn    = module.search_lambda.invoke_arn
  search_lambda_function_name = module.search_lambda.function_name
  graph_lambda_invoke_arn     = module.graph_lambda.invoke_arn
  graph_lambda_function_name  = module.graph_lambda.function_name
  cors_allow_origin           = var.cors_allow_origin
}

module "cloudfront" {
  source               = "../../modules/cloudfront"
  distribution_name    = "${var.project_name}-${var.environment}-frontend"
  frontend_bucket_name = "${var.project_name}-${var.environment}-frontend"
  custom_domain        = var.custom_domain
  acm_certificate_arn  = var.acm_certificate_arn
}
