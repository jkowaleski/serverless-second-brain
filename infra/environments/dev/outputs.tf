output "environment" {
  value = var.environment
}

output "project_name" {
  value = var.project_name
}

# Memory layer
output "dynamodb_table_name" {
  value = module.dynamodb.table_name
}

output "dynamodb_table_arn" {
  value = module.dynamodb.table_arn
}

output "s3_content_bucket_name" {
  value = module.s3_content.bucket_name
}

output "s3_content_bucket_arn" {
  value = module.s3_content.bucket_arn
}

# IAM
output "dynamodb_read_policy_arn" {
  value = module.iam.dynamodb_read_policy_arn
}

output "dynamodb_write_policy_arn" {
  value = module.iam.dynamodb_write_policy_arn
}

output "s3_read_policy_arn" {
  value = module.iam.s3_read_policy_arn
}

output "s3_write_policy_arn" {
  value = module.iam.s3_write_policy_arn
}
