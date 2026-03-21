variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

data "aws_caller_identity" "current" {}

variable "dynamodb_table_arn" {
  description = "DynamoDB table ARN"
  type        = string
}

variable "s3_bucket_arn" {
  description = "S3 content bucket ARN"
  type        = string
}

# Read-only policy — for Search and Graph Lambdas
resource "aws_iam_policy" "dynamodb_read" {
  name = "${var.project_name}-${var.environment}-dynamodb-read"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem"
        ]
        Resource = [
          var.dynamodb_table_arn,
          "${var.dynamodb_table_arn}/index/*"
        ]
      }
    ]
  })
}

# Read-write policy — for Capture and Surfacing Lambdas
resource "aws_iam_policy" "dynamodb_write" {
  name = "${var.project_name}-${var.environment}-dynamodb-write"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          var.dynamodb_table_arn,
          "${var.dynamodb_table_arn}/index/*"
        ]
      }
    ]
  })
}

# S3 read-only — for Graph Lambda (read_node with include_body)
resource "aws_iam_policy" "s3_read" {
  name = "${var.project_name}-${var.environment}-s3-read"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${var.s3_bucket_arn}/*"
      }
    ]
  })
}

# S3 read-write — for Capture Lambda
resource "aws_iam_policy" "s3_write" {
  name = "${var.project_name}-${var.environment}-s3-write"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${var.s3_bucket_arn}/*"
      }
    ]
  })
}

output "dynamodb_read_policy_arn" {
  value = aws_iam_policy.dynamodb_read.arn
}

output "dynamodb_write_policy_arn" {
  value = aws_iam_policy.dynamodb_write.arn
}

output "s3_read_policy_arn" {
  value = aws_iam_policy.s3_read.arn
}

output "s3_write_policy_arn" {
  value = aws_iam_policy.s3_write.arn
}

# Bedrock invoke — for Capture (classification) and Search (embeddings)
resource "aws_iam_policy" "bedrock_invoke" {
  name = "${var.project_name}-${var.environment}-bedrock-invoke"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:inference-profile/*"
        ]
      }
    ]
  })
}

output "bedrock_invoke_policy_arn" {
  value = aws_iam_policy.bedrock_invoke.arn
}

# --- AgentCore Gateway IAM Role ---

resource "aws_iam_role" "agentcore_gateway" {
  name = "${var.project_name}-${var.environment}-agentcore-gateway"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "bedrock-agentcore.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "agentcore_gateway_lambda" {
  name = "lambda-invoke"
  role = aws_iam_role.agentcore_gateway.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = "arn:aws:lambda:*:${data.aws_caller_identity.current.account_id}:function:${var.project_name}-${var.environment}-*"
    }]
  })
}

output "agentcore_gateway_role_arn" {
  value = aws_iam_role.agentcore_gateway.arn
}
