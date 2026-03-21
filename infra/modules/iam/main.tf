variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

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
