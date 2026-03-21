variable "api_name" {
  description = "API Gateway REST API name"
  type        = string
}

variable "stage_name" {
  description = "Deployment stage name"
  type        = string
}

variable "capture_state_machine_arn" {
  description = "ARN of the Capture pipeline Step Functions state machine"
  type        = string
}

variable "search_lambda_invoke_arn" {
  description = "Invoke ARN of the Search Lambda"
  type        = string
  default     = ""
}

variable "search_lambda_function_name" {
  description = "Function name of the Search Lambda"
  type        = string
  default     = ""
}

variable "graph_lambda_invoke_arn" {
  description = "Invoke ARN of the Graph Lambda"
  type        = string
  default     = ""
}

variable "graph_lambda_function_name" {
  description = "Function name of the Graph Lambda"
  type        = string
  default     = ""
}

variable "enable_search" {
  description = "Enable /search route"
  type        = bool
  default     = false
}

variable "enable_graph" {
  description = "Enable /graph and /nodes/{id} routes"
  type        = bool
  default     = false
}

variable "cors_allow_origin" {
  description = "CORS allowed origin"
  type        = string
  default     = "*"
}

variable "throttle_burst" {
  description = "API-level burst throttle limit"
  type        = number
  default     = 100
}

variable "throttle_rate" {
  description = "API-level sustained throttle limit"
  type        = number
  default     = 50
}

variable "capture_throttle_burst" {
  description = "POST /capture burst throttle"
  type        = number
  default     = 10
}

variable "capture_throttle_rate" {
  description = "POST /capture sustained throttle"
  type        = number
  default     = 5
}

# ─── REST API ───

resource "aws_api_gateway_rest_api" "this" {
  name        = var.api_name
  description = "Serverless Second Brain API"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# ─── IAM role for API Gateway → Step Functions ───

resource "aws_iam_role" "apigw_sfn" {
  name = "${var.api_name}-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "apigw_sfn" {
  name = "${var.api_name}-sfn-invoke"
  role = aws_iam_role.apigw_sfn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "states:StartSyncExecution"
      Resource = var.capture_state_machine_arn
    }]
  })
}

# ─── /health (mock) ───

resource "aws_api_gateway_resource" "health" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "health"
}

resource "aws_api_gateway_method" "health_get" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.health.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "health_mock" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_get.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "health_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_get.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "health_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_get.http_method
  status_code = aws_api_gateway_method_response.health_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'${var.cors_allow_origin}'"
  }

  response_templates = {
    "application/json" = jsonencode({
      status    = "healthy"
      version   = "1.0.0"
      timestamp = "$context.requestTime"
    })
  }

  depends_on = [aws_api_gateway_integration.health_mock]
}

# ─── /capture (Step Functions sync) ───

resource "aws_api_gateway_resource" "capture" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "capture"
}

resource "aws_api_gateway_method" "capture_post" {
  rest_api_id      = aws_api_gateway_rest_api.this.id
  resource_id      = aws_api_gateway_resource.capture.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "capture_sfn" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.capture.id
  http_method             = aws_api_gateway_method.capture_post.http_method
  integration_http_method = "POST"
  type                    = "AWS"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.id}:states:action/StartSyncExecution"
  credentials             = aws_iam_role.apigw_sfn.arn

  request_templates = {
    "application/json" = jsonencode({
      input           = "$util.escapeJavaScript($input.body)"
      stateMachineArn = var.capture_state_machine_arn
    })
  }
}

data "aws_region" "current" {}

# 201 — success (extract output from Step Functions response)
resource "aws_api_gateway_method_response" "capture_201" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.capture.id
  http_method = aws_api_gateway_method.capture_post.http_method
  status_code = "201"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "capture_201" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.capture.id
  http_method = aws_api_gateway_method.capture_post.http_method
  status_code = aws_api_gateway_method_response.capture_201.status_code

  # Match SUCCEEDED status
  selection_pattern = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'${var.cors_allow_origin}'"
  }

  # Extract the output field from the Step Functions sync response
  # Check execution status to distinguish success from failure
  response_templates = {
    "application/json" = <<-EOF
#set($status = $input.json('$.status'))
#if($status == '"SUCCEEDED"')
$input.json('$.output')
#else
#set($context.responseOverride.status = 500)
{"error":"pipeline_failed","cause":$input.json('$.cause'),"status":$status}
#end
EOF
  }

  depends_on = [aws_api_gateway_integration.capture_sfn]
}

# 400/500 — failure (extract error from Step Functions response)
resource "aws_api_gateway_method_response" "capture_500" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.capture.id
  http_method = aws_api_gateway_method.capture_post.http_method
  status_code = "500"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "capture_500" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.capture.id
  http_method = aws_api_gateway_method.capture_post.http_method
  status_code = aws_api_gateway_method_response.capture_500.status_code

  # Match anything that's not 200
  selection_pattern = "4\\d{2}|5\\d{2}"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'${var.cors_allow_origin}'"
  }

  response_templates = {
    "application/json" = <<-EOF
#set($cause = $util.parseJson($input.json('$.cause')))
$cause
EOF
  }

  depends_on = [aws_api_gateway_integration.capture_sfn, aws_api_gateway_integration_response.capture_201]
}

# ─── /search (Lambda proxy) ───

resource "aws_api_gateway_resource" "search" {
  count       = var.enable_search ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "search"
}

resource "aws_api_gateway_method" "search_get" {
  count         = var.enable_search ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.search[0].id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "search_lambda" {
  count                   = var.enable_search ? 1 : 0
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.search[0].id
  http_method             = aws_api_gateway_method.search_get[0].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.search_lambda_invoke_arn
}

resource "aws_lambda_permission" "apigw_search" {
  count         = var.enable_search ? 1 : 0
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.search_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
}

# ─── /graph (Lambda proxy) ───

resource "aws_api_gateway_resource" "graph" {
  count       = var.enable_graph ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "graph"
}

resource "aws_api_gateway_method" "graph_get" {
  count         = var.enable_graph ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.graph[0].id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "graph_lambda" {
  count                   = var.enable_graph ? 1 : 0
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.graph[0].id
  http_method             = aws_api_gateway_method.graph_get[0].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.graph_lambda_invoke_arn
}

resource "aws_lambda_permission" "apigw_graph" {
  count         = var.enable_graph ? 1 : 0
  statement_id  = "AllowAPIGatewayInvokeGraph"
  action        = "lambda:InvokeFunction"
  function_name = var.graph_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
}

# ─── /nodes/{id} (Lambda proxy → Graph Lambda) ───

resource "aws_api_gateway_resource" "nodes" {
  count       = var.enable_graph ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "nodes"
}

resource "aws_api_gateway_resource" "nodes_id" {
  count       = var.enable_graph ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.nodes[0].id
  path_part   = "{id}"
}

resource "aws_api_gateway_method" "nodes_id_get" {
  count         = var.enable_graph ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.nodes_id[0].id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "nodes_id_lambda" {
  count                   = var.enable_graph ? 1 : 0
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.nodes_id[0].id
  http_method             = aws_api_gateway_method.nodes_id_get[0].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.graph_lambda_invoke_arn
}

# ─── CORS (OPTIONS) for /capture ───

resource "aws_api_gateway_method" "capture_options" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.capture.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "capture_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.capture.id
  http_method = aws_api_gateway_method.capture_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "capture_options_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.capture.id
  http_method = aws_api_gateway_method.capture_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "capture_options_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.capture.id
  http_method = aws_api_gateway_method.capture_options.http_method
  status_code = aws_api_gateway_method_response.capture_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origin}'"
  }

  depends_on = [aws_api_gateway_integration.capture_options]
}

# ─── CORS (OPTIONS) for /health ───

resource "aws_api_gateway_method" "health_options" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.health.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "health_options" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "health_options_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "health_options_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_options.http_method
  status_code = aws_api_gateway_method_response.health_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origin}'"
  }

  depends_on = [aws_api_gateway_integration.health_options]
}

# ─── Deployment + Stage ───

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.health.id,
      aws_api_gateway_resource.capture.id,
      aws_api_gateway_method.health_get.id,
      aws_api_gateway_method.capture_post.id,
      aws_api_gateway_integration.health_mock.id,
      aws_api_gateway_integration.capture_sfn.id,
      var.search_lambda_invoke_arn,
      var.graph_lambda_invoke_arn,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.health_mock,
    aws_api_gateway_integration.capture_sfn,
    aws_api_gateway_integration.capture_options,
    aws_api_gateway_integration.health_options,
    aws_api_gateway_integration_response.capture_201,
    aws_api_gateway_integration_response.capture_500,
    aws_api_gateway_integration.search_lambda,
    aws_api_gateway_integration.graph_lambda,
    aws_api_gateway_integration.nodes_id_lambda,
  ]
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${var.api_name}"
  retention_in_days = 14
}

resource "aws_api_gateway_stage" "this" {
  deployment_id = aws_api_gateway_deployment.this.id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  stage_name    = var.stage_name

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      latency        = "$context.integrationLatency"
    })
  }

  xray_tracing_enabled = true
}

resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.this.stage_name
  method_path = "*/*"

  settings {
    throttling_burst_limit = var.throttle_burst
    throttling_rate_limit  = var.throttle_rate
    metrics_enabled        = true
    logging_level          = "INFO"
  }
}

resource "aws_api_gateway_method_settings" "capture" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.this.stage_name
  method_path = "capture/POST"

  settings {
    throttling_burst_limit = var.capture_throttle_burst
    throttling_rate_limit  = var.capture_throttle_rate
  }
}

# ─── API Key + Usage Plan ───

resource "aws_api_gateway_api_key" "this" {
  name    = "${var.api_name}-key"
  enabled = true
}

resource "aws_api_gateway_usage_plan" "this" {
  name = "${var.api_name}-usage-plan"

  api_stages {
    api_id = aws_api_gateway_rest_api.this.id
    stage  = aws_api_gateway_stage.this.stage_name
  }

  throttle_settings {
    burst_limit = var.throttle_burst
    rate_limit  = var.throttle_rate
  }
}

resource "aws_api_gateway_usage_plan_key" "this" {
  key_id        = aws_api_gateway_api_key.this.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.this.id
}

# ─── API Gateway account (CloudWatch role) ───

resource "aws_api_gateway_account" "this" {
  cloudwatch_role_arn = aws_iam_role.apigw_cloudwatch.arn
}

resource "aws_iam_role" "apigw_cloudwatch" {
  name = "${var.api_name}-apigw-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apigw_cloudwatch" {
  role       = aws_iam_role.apigw_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# ─── Outputs ───

output "api_id" {
  value = aws_api_gateway_rest_api.this.id
}

output "api_execution_arn" {
  value = aws_api_gateway_rest_api.this.execution_arn
}

output "invoke_url" {
  value = aws_api_gateway_stage.this.invoke_url
}

output "api_key_id" {
  value = aws_api_gateway_api_key.this.id
}

output "api_key_value" {
  value     = aws_api_gateway_api_key.this.value
  sensitive = true
}

output "stage_name" {
  value = aws_api_gateway_stage.this.stage_name
}
