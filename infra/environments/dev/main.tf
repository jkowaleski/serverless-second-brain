terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "ssb-terraform-state"
    key            = "ssb/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ssb-terraform-lock"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.37"
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
    TABLE_NAME                 = module.dynamodb.table_name
    BUCKET_NAME                = module.s3_content.bucket_name
    BEDROCK_MODEL_ID           = var.bedrock_model_id
    BEDROCK_EMBEDDING_MODEL_ID = var.bedrock_embedding_model_id
    ENVIRONMENT                = var.environment
  }
  capture_policies = [
    module.iam.dynamodb_write_policy_arn,
    module.iam.s3_write_policy_arn,
    module.iam.bedrock_invoke_policy_arn,
  ]
}

# Monolithic handler (kept for direct invocation / testing)
module "capture_lambda" {
  source                = "../../modules/lambda"
  function_name         = "${var.project_name}-${var.environment}-capture"
  handler               = "index.handler"
  memory_size           = 512
  timeout               = 30
  environment_variables = local.capture_env
  policy_arns           = local.capture_policies
}

# Step function handlers — same code package, different entry points
module "capture_validate" {
  source                = "../../modules/lambda"
  function_name         = "${var.project_name}-${var.environment}-capture-validate"
  handler               = "index.validate"
  memory_size           = 256
  timeout               = 10
  environment_variables = local.capture_env
  policy_arns           = [module.iam.dynamodb_read_policy_arn]
}

module "capture_classify" {
  source                = "../../modules/lambda"
  function_name         = "${var.project_name}-${var.environment}-capture-classify"
  handler               = "index.classify"
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
  handler               = "index.persist"
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
  handler               = "index.createEdges"
  memory_size           = 256
  timeout               = 10
  environment_variables = local.capture_env
  policy_arns           = [module.iam.dynamodb_write_policy_arn]
}


# Search Lambda — hybrid keyword + semantic search
module "search_lambda" {
  source        = "../../modules/lambda"
  function_name = "${var.project_name}-${var.environment}-search"
  handler       = "handler.handler"
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

# Graph Lambda — knowledge graph API (read-only)
module "graph_lambda" {
  source        = "../../modules/lambda"
  function_name = "${var.project_name}-${var.environment}-graph"
  handler       = "handler.handler"
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
  enable_search               = true
  enable_graph                = true
  cors_allow_origin           = var.cors_allow_origin
}

module "cloudfront" {
  source               = "../../modules/cloudfront"
  distribution_name    = "${var.project_name}-${var.environment}-frontend"
  frontend_bucket_name = "${var.project_name}-${var.environment}-frontend"
}

# --- Write Lambdas (MCP tools) ---

module "connect_lambda" {
  source        = "../../modules/lambda"
  function_name = "${var.project_name}-${var.environment}-connect"
  handler       = "handler.handler"
  memory_size   = 256
  timeout       = 10

  environment_variables = {
    TABLE_NAME  = module.dynamodb.table_name
    ENVIRONMENT = var.environment
  }

  policy_arns = [module.iam.dynamodb_write_policy_arn]
}

module "flag_lambda" {
  source        = "../../modules/lambda"
  function_name = "${var.project_name}-${var.environment}-flag"
  handler       = "handler.handler"
  memory_size   = 256
  timeout       = 10

  environment_variables = {
    TABLE_NAME  = module.dynamodb.table_name
    ENVIRONMENT = var.environment
  }

  policy_arns = [
    module.iam.dynamodb_read_policy_arn,
    module.iam.dynamodb_write_policy_arn,
  ]
}

# --- AgentCore Gateway (MCP) ---

module "agentcore_gateway" {
  source           = "../../modules/agentcore-gateway"
  gateway_name     = "${var.project_name}-${var.environment}-gateway"
  gateway_role_arn = module.iam.agentcore_gateway_role_arn

  tools = {
    read-node = {
      lambda_arn  = module.graph_lambda.function_arn
      description = "Read a knowledge node by slug. Returns metadata, edges, and related nodes."
      input_schema = {
        properties = [
          { name = "slug", type = "string", description = "Node slug (e.g., 'concepts-serverless')", required = true },
          { name = "include_body", type = "boolean", description = "Include full MDX body from S3" },
          { name = "language", type = "string", description = "Language for body: es or en" },
        ]
      }
    }
    list-nodes = {
      lambda_arn  = module.graph_lambda.function_arn
      description = "List knowledge nodes with optional filters by type, status, and tags."
      input_schema = {
        properties = [
          { name = "type", type = "string", description = "Filter by node type (concept, note, experiment, essay)" },
          { name = "status", type = "string", description = "Filter by status (seed, growing, evergreen)" },
          { name = "limit", type = "integer", description = "Max results (default 20, max 100)" },
        ]
      }
    }
    search = {
      lambda_arn  = module.search_lambda.function_arn
      description = "Hybrid keyword + semantic search across the knowledge graph."
      input_schema = {
        properties = [
          { name = "query", type = "string", description = "Search query in natural language", required = true },
          { name = "limit", type = "integer", description = "Max results (default 10, max 50)" },
          { name = "type", type = "string", description = "Filter by node type" },
        ]
      }
    }
    add-node = {
      lambda_arn  = module.capture_lambda.function_arn
      description = "Create a new seed knowledge node. AI classifies content and generates bilingual metadata."
      input_schema = {
        properties = [
          { name = "text", type = "string", description = "Content text (min 50 chars)", required = true },
          { name = "url", type = "string", description = "Optional source URL" },
          { name = "type", type = "string", description = "Node type (default: concept)" },
          { name = "language", type = "string", description = "Content language: es or en" },
        ]
      }
    }
    connect-nodes = {
      lambda_arn  = module.connect_lambda.function_arn
      description = "Create a bidirectional edge between two existing knowledge nodes."
      input_schema = {
        properties = [
          { name = "source", type = "string", description = "Source node slug", required = true },
          { name = "target", type = "string", description = "Target node slug", required = true },
          { name = "edge_type", type = "string", description = "Relationship type (default: related)" },
          { name = "weight", type = "number", description = "Edge weight 0-1 (default: 1.0)" },
        ]
      }
    }
    flag-stale = {
      lambda_arn  = module.flag_lambda.function_arn
      description = "Flag a knowledge node for human review. Creates audit entry without modifying the node."
      input_schema = {
        properties = [
          { name = "slug", type = "string", description = "Node slug to flag", required = true },
          { name = "reason", type = "string", description = "Why this node needs review", required = true },
        ]
      }
    }
  }
}
