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
    NODE_TYPES                 = join(",", var.node_types)
    LANGUAGES                  = var.languages
    DEFAULT_VISIBILITY         = var.default_visibility
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
  handler               = "index.handler"
  memory_size           = 512
  timeout               = 30
  environment_variables = local.capture_env
  policy_arns           = local.capture_policies
}

# --- Step Functions — REMOVED: capture uses monolithic Lambda handler now (ADR-006 superseded) ---


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
    USER_POOL_ID               = module.cognito.user_pool_id
    SPA_CLIENT_ID              = module.cognito.spa_client_id
    MCP_CLIENT_ID              = module.cognito.mcp_client_id
  }

  policy_arns = [
    module.iam.dynamodb_read_policy_arn,
    module.iam.bedrock_invoke_policy_arn,
  ]
}

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
    USER_POOL_ID      = module.cognito.user_pool_id
    SPA_CLIENT_ID     = module.cognito.spa_client_id
    MCP_CLIENT_ID     = module.cognito.mcp_client_id
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

# --- Interface Layer ---

module "api_gateway" {
  source                      = "../../modules/api-gateway"
  api_name                    = "${var.project_name}-${var.environment}-api"
  stage_name                  = var.environment
  capture_lambda_invoke_arn      = module.capture_lambda.invoke_arn
  capture_lambda_function_name   = module.capture_lambda.function_name
  search_lambda_invoke_arn    = module.search_lambda.invoke_arn
  search_lambda_function_name = module.search_lambda.function_name
  graph_lambda_invoke_arn     = module.graph_lambda.invoke_arn
  graph_lambda_function_name  = module.graph_lambda.function_name
  enable_search               = true
  enable_graph                = true
  cors_allow_origin           = var.cors_allow_origin

  enable_authorizer               = true
  authorizer_lambda_invoke_arn    = module.authorizer_lambda.invoke_arn
  authorizer_lambda_function_name = module.authorizer_lambda.function_name
}

module "cloudfront" {
  source               = "../../modules/cloudfront"
  distribution_name    = "${var.project_name}-${var.environment}-frontend"
  frontend_bucket_name = "${var.project_name}-${var.environment}-frontend"
  custom_domain        = var.custom_domain
  acm_certificate_arn  = var.acm_certificate_arn
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

# --- Phase 4: Surfacing ---

module "daily_digest_topic" {
  source              = "../../modules/sns"
  topic_name          = "${var.project_name}-${var.environment}-daily-digest"
  email_subscriptions = var.digest_email != "" ? [var.digest_email] : []
}

module "surfacing_lambda" {
  source        = "../../modules/lambda"
  function_name = "${var.project_name}-${var.environment}-surfacing"
  handler       = "handler.handler"
  memory_size   = 512
  timeout       = 60

  environment_variables = {
    TABLE_NAME             = module.dynamodb.table_name
    SNS_DIGEST_TOPIC_ARN   = module.daily_digest_topic.topic_arn
    STALE_DAYS             = tostring(var.surfacing_stale_days)
    MIN_EDGES              = tostring(var.surfacing_min_edges)
    SIMILARITY_THRESHOLD   = var.surfacing_similarity_threshold
    ENVIRONMENT            = var.environment
  }

  policy_arns = [
    module.iam.dynamodb_read_policy_arn,
  ]
}

resource "aws_iam_role_policy" "surfacing_sns" {
  name = "${var.project_name}-${var.environment}-surfacing-sns"
  role = module.surfacing_lambda.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sns:Publish"
      Resource = module.daily_digest_topic.topic_arn
    }]
  })
}

module "surfacing_schedule" {
  source               = "../../modules/eventbridge"
  rule_name            = "${var.project_name}-${var.environment}-daily-surfacing"
  schedule_expression  = "cron(0 8 * * ? *)"
  lambda_arn           = module.surfacing_lambda.function_arn
  lambda_function_name = module.surfacing_lambda.function_name
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

# --- Observability (#14) ---

module "monitoring" {
  source = "../../modules/monitoring"

  project_name    = var.project_name
  environment     = var.environment
  alarm_sns_topic_arn = module.daily_digest_topic.topic_arn

  lambda_function_names = [
    module.capture_lambda.function_name,
    module.search_lambda.function_name,
    module.graph_lambda.function_name,
    module.connect_lambda.function_name,
    module.flag_lambda.function_name,
    module.surfacing_lambda.function_name,
  ]

  dynamodb_table_name = module.dynamodb.table_name
  api_gateway_name    = "${var.project_name}-${var.environment}-api"
  api_gateway_stage   = var.environment
}

# --- Authentication (#17) ---

module "cognito" {
  source        = "../../modules/cognito"
  project_name  = var.project_name
  environment   = var.environment
  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls
}

module "authorizer_lambda" {
  source        = "../../modules/lambda"
  function_name = "${var.project_name}-${var.environment}-authorizer"
  handler       = "handler.handler"
  memory_size   = 128
  timeout       = 5

  environment_variables = {
    USER_POOL_ID  = module.cognito.user_pool_id
    SPA_CLIENT_ID = module.cognito.spa_client_id
    MCP_CLIENT_ID = module.cognito.mcp_client_id
  }

  policy_arns = []
}

# --- Phase 3: AgentCore Runtime (#8) ---

resource "aws_iam_role" "agentcore_runtime" {
  name = "${var.project_name}-${var.environment}-agentcore-runtime"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "bedrock-agentcore.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "agentcore_runtime_lambda" {
  name = "lambda-invoke"
  role = aws_iam_role.agentcore_runtime.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = [
        module.graph_lambda.function_arn,
        module.search_lambda.function_arn,
        module.capture_lambda.function_arn,
        module.connect_lambda.function_arn,
        module.flag_lambda.function_arn,
      ]
    }]
  })
}

resource "aws_s3_object" "runtime_code" {
  bucket = module.s3_content.bucket_name
  key    = "runtime/mcp-server.zip"
  source = data.archive_file.runtime_code.output_path
  etag   = data.archive_file.runtime_code.output_md5
}

data "archive_file" "runtime_code" {
  type        = "zip"
  source_dir  = "${path.module}/../../../src/runtime"
  output_path = "${path.module}/runtime.zip"
}

module "agentcore_runtime" {
  source = "../../modules/agentcore-runtime"

  runtime_name = "${var.project_name}_${var.environment}_runtime"
  role_arn     = aws_iam_role.agentcore_runtime.arn
  s3_bucket    = module.s3_content.bucket_name
  s3_key       = "runtime/mcp-server.zip"

  environment_variables = {
    PROJECT_NAME = var.project_name
    ENVIRONMENT  = var.environment
    AWS_REGION   = var.aws_region
  }

  depends_on = [aws_s3_object.runtime_code]
}

# ─── SSM Parameters (for CI/CD) ───

resource "aws_ssm_parameter" "frontend_bucket" {
  name  = "/${var.project_name}/${var.environment}/frontend/bucket"
  type  = "String"
  value = module.cloudfront.frontend_bucket_name
}

resource "aws_ssm_parameter" "cloudfront_distribution_id" {
  name  = "/${var.project_name}/${var.environment}/frontend/cloudfront-distribution-id"
  type  = "String"
  value = module.cloudfront.distribution_id
}

resource "aws_ssm_parameter" "api_url" {
  name  = "/${var.project_name}/${var.environment}/api/url"
  type  = "String"
  value = module.api_gateway.invoke_url
}

resource "aws_ssm_parameter" "cognito_domain" {
  name  = "/${var.project_name}/${var.environment}/cognito/domain"
  type  = "String"
  value = module.cognito.domain
}

resource "aws_ssm_parameter" "cognito_spa_client_id" {
  name  = "/${var.project_name}/${var.environment}/cognito/spa-client-id"
  type  = "String"
  value = module.cognito.spa_client_id
}

resource "aws_ssm_parameter" "cognito_user_pool_id" {
  name  = "/${var.project_name}/${var.environment}/cognito/user-pool-id"
  type  = "String"
  value = module.cognito.user_pool_id
}
