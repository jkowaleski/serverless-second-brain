variable "api_name" {
  description = "API Gateway REST API name"
  type        = string
}

variable "stage_name" {
  description = "Deployment stage name"
  type        = string
}

variable "capture_lambda_invoke_arn" {
  description = "Invoke ARN of the Capture Lambda"
  type        = string
}

variable "capture_lambda_function_name" {
  description = "Function name of the Capture Lambda"
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

variable "authorizer_lambda_invoke_arn" {
  description = "Invoke ARN of the authorizer Lambda"
  type        = string
  default     = ""
}

variable "authorizer_lambda_function_name" {
  description = "Function name of the authorizer Lambda"
  type        = string
  default     = ""
}

variable "enable_authorizer" {
  description = "Enable Lambda authorizer on endpoints"
  type        = bool
  default     = false
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

# ─── /capture (Lambda proxy) ───

resource "aws_api_gateway_resource" "capture" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "capture"
}

resource "aws_api_gateway_method" "capture_post" {
  rest_api_id      = aws_api_gateway_rest_api.this.id
  resource_id      = aws_api_gateway_resource.capture.id
  http_method      = "POST"
  authorization    = var.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id    = var.enable_authorizer ? aws_api_gateway_authorizer.cognito[0].id : null
  api_key_required = false
}

resource "aws_api_gateway_integration" "capture_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.capture.id
  http_method             = aws_api_gateway_method.capture_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.capture_lambda_invoke_arn
}

resource "aws_lambda_permission" "capture_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.capture_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
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

# ─── CORS (OPTIONS) for /search ───

resource "aws_api_gateway_method" "search_options" {
  count         = var.enable_search ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.search[0].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "search_options" {
  count       = var.enable_search ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.search[0].id
  http_method = aws_api_gateway_method.search_options[0].http_method
  type        = "MOCK"
  request_templates = { "application/json" = jsonencode({ statusCode = 200 }) }
}

resource "aws_api_gateway_method_response" "search_options_200" {
  count       = var.enable_search ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.search[0].id
  http_method = aws_api_gateway_method.search_options[0].http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  response_models = { "application/json" = "Empty" }
}

resource "aws_api_gateway_integration_response" "search_options_200" {
  count       = var.enable_search ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.search[0].id
  http_method = aws_api_gateway_method.search_options[0].http_method
  status_code = aws_api_gateway_method_response.search_options_200[0].status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origin}'"
  }
  depends_on = [aws_api_gateway_integration.search_options]
}

# ─── CORS (OPTIONS) for /graph ───

resource "aws_api_gateway_method" "graph_options" {
  count         = var.enable_graph ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.graph[0].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "graph_options" {
  count       = var.enable_graph ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.graph[0].id
  http_method = aws_api_gateway_method.graph_options[0].http_method
  type        = "MOCK"
  request_templates = { "application/json" = jsonencode({ statusCode = 200 }) }
}

resource "aws_api_gateway_method_response" "graph_options_200" {
  count       = var.enable_graph ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.graph[0].id
  http_method = aws_api_gateway_method.graph_options[0].http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  response_models = { "application/json" = "Empty" }
}

resource "aws_api_gateway_integration_response" "graph_options_200" {
  count       = var.enable_graph ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.graph[0].id
  http_method = aws_api_gateway_method.graph_options[0].http_method
  status_code = aws_api_gateway_method_response.graph_options_200[0].status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origin}'"
  }
  depends_on = [aws_api_gateway_integration.graph_options]
}

# ─── CORS (OPTIONS) for /nodes/{id} ───

resource "aws_api_gateway_method" "nodes_id_options" {
  count         = var.enable_graph ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.nodes_id[0].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "nodes_id_options" {
  count       = var.enable_graph ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.nodes_id[0].id
  http_method = aws_api_gateway_method.nodes_id_options[0].http_method
  type        = "MOCK"
  request_templates = { "application/json" = jsonencode({ statusCode = 200 }) }
}

resource "aws_api_gateway_method_response" "nodes_id_options_200" {
  count       = var.enable_graph ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.nodes_id[0].id
  http_method = aws_api_gateway_method.nodes_id_options[0].http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  response_models = { "application/json" = "Empty" }
}

resource "aws_api_gateway_integration_response" "nodes_id_options_200" {
  count       = var.enable_graph ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.nodes_id[0].id
  http_method = aws_api_gateway_method.nodes_id_options[0].http_method
  status_code = aws_api_gateway_method_response.nodes_id_options_200[0].status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origin}'"
  }
  depends_on = [aws_api_gateway_integration.nodes_id_options]
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

# ─── Lambda Authorizer ───

resource "aws_api_gateway_authorizer" "cognito" {
  count                            = var.enable_authorizer ? 1 : 0
  name                             = "${var.api_name}-cognito"
  rest_api_id                      = aws_api_gateway_rest_api.this.id
  type                             = "TOKEN"
  authorizer_uri                   = var.authorizer_lambda_invoke_arn
  authorizer_result_ttl_in_seconds = 300
  identity_source                  = "method.request.header.Authorization"
}

resource "aws_lambda_permission" "apigw_authorizer" {
  count         = var.enable_authorizer ? 1 : 0
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = var.authorizer_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*"
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
      aws_api_gateway_method.capture_post.authorization,
      aws_api_gateway_method.capture_post.api_key_required,
      aws_api_gateway_integration.health_mock.id,
      aws_api_gateway_integration.capture_lambda.id,
      var.search_lambda_invoke_arn,
      var.graph_lambda_invoke_arn,
      var.authorizer_lambda_invoke_arn,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.health_mock,
    aws_api_gateway_integration.capture_lambda,
    aws_api_gateway_integration.capture_options,
    aws_api_gateway_integration.health_options,
    aws_api_gateway_integration.search_lambda,
    aws_api_gateway_integration.search_options,
    aws_api_gateway_integration.graph_lambda,
    aws_api_gateway_integration.graph_options,
    aws_api_gateway_integration.nodes_id_lambda,
    aws_api_gateway_integration.nodes_id_options,
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

output "stage_name" {
  value = aws_api_gateway_stage.this.stage_name
}

output "authorizer_id" {
  value = var.enable_authorizer ? aws_api_gateway_authorizer.cognito[0].id : ""
}
