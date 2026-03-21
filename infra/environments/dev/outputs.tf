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

output "bedrock_invoke_policy_arn" {
  value = module.iam.bedrock_invoke_policy_arn
}

# Compute layer
output "capture_function_name" {
  value = module.capture_lambda.function_name
}

output "capture_function_arn" {
  value = module.capture_lambda.function_arn
}

output "capture_pipeline_arn" {
  value = module.capture_pipeline.state_machine_arn
}

output "search_function_name" {
  value = module.search_lambda.function_name
}

output "search_function_arn" {
  value = module.search_lambda.function_arn
}

output "graph_function_name" {
  value = module.graph_lambda.function_name
}

output "graph_function_arn" {
  value = module.graph_lambda.function_arn
}

output "capture_complete_topic_arn" {
  value = module.capture_complete_topic.topic_arn
}

# Interface layer
output "api_gateway_invoke_url" {
  value = module.api_gateway.invoke_url
}

output "api_gateway_id" {
  value = module.api_gateway.api_id
}

output "api_gateway_execution_arn" {
  value = module.api_gateway.api_execution_arn
}

output "api_key_id" {
  value = module.api_gateway.api_key_id
}

output "api_key_value" {
  value     = module.api_gateway.api_key_value
  sensitive = true
}

# Frontend
output "cloudfront_distribution_id" {
  value = module.cloudfront.distribution_id
}

output "cloudfront_domain" {
  value = module.cloudfront.distribution_domain
}

output "frontend_bucket_name" {
  value = module.cloudfront.frontend_bucket_name
}

# Surfacing (Phase 4)
output "surfacing_function_name" {
  value = module.surfacing_lambda.function_name
}

output "daily_digest_topic_arn" {
  value = module.daily_digest_topic.topic_arn
}

output "surfacing_schedule_rule" {
  value = module.surfacing_schedule.rule_name
}

# AgentCore Gateway
output "agentcore_gateway_id" {
  value = module.agentcore_gateway.gateway_id
}

output "agentcore_gateway_url" {
  value = module.agentcore_gateway.gateway_url
}

# Write Lambdas
output "connect_function_name" {
  value = module.connect_lambda.function_name
}

output "flag_function_name" {
  value = module.flag_lambda.function_name
}

output "dashboard_url" {
  value = module.monitoring.dashboard_url
}

output "agentcore_runtime_id" {
  value = module.agentcore_runtime.runtime_id
}

output "agentcore_runtime_arn" {
  value = module.agentcore_runtime.runtime_arn
}

# Cognito
output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_spa_client_id" {
  value = module.cognito.spa_client_id
}

output "cognito_mcp_client_id" {
  value = module.cognito.mcp_client_id
}

output "cognito_mcp_client_secret" {
  value     = module.cognito.mcp_client_secret
  sensitive = true
}

output "cognito_domain" {
  value = module.cognito.domain
}

output "cognito_issuer_url" {
  value = module.cognito.issuer_url
}
