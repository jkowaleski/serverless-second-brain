variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment (dev/prod)"
  type        = string
}

variable "lambda_function_names" {
  description = "Lambda function names to monitor"
  type        = list(string)
}

variable "dynamodb_table_name" {
  description = "DynamoDB table name"
  type        = string
}

variable "api_gateway_name" {
  description = "API Gateway REST API name"
  type        = string
}

variable "api_gateway_stage" {
  description = "API Gateway stage name"
  type        = string
}

variable "state_machine_name" {
  description = "Step Functions state machine name (optional, omit if SFN removed)"
  type        = string
  default     = ""
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for alarm notifications"
  type        = string
}

variable "alarm_lambda_error_pct" {
  description = "Lambda error rate threshold (%)"
  type        = number
  default     = 5
}

variable "alarm_api_5xx_pct" {
  description = "API Gateway 5xx rate threshold (%)"
  type        = number
  default     = 1
}

# --- CloudWatch Dashboard ---

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = concat(
      # Lambda overview
      [
        {
          type   = "text"
          x      = 0
          y      = 0
          width  = 24
          height = 1
          properties = {
            markdown = "# ${var.project_name}-${var.environment} — Operational Dashboard"
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 1
          width  = 12
          height = 6
          properties = {
            title  = "Lambda Invocations"
            region = data.aws_region.current.name
            stat   = "Sum"
            period = 300
            metrics = [
              for fn in var.lambda_function_names : [
                "AWS/Lambda", "Invocations", "FunctionName", fn
              ]
            ]
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 1
          width  = 12
          height = 6
          properties = {
            title  = "Lambda Errors"
            region = data.aws_region.current.name
            stat   = "Sum"
            period = 300
            metrics = [
              for fn in var.lambda_function_names : [
                "AWS/Lambda", "Errors", "FunctionName", fn
              ]
            ]
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 7
          width  = 12
          height = 6
          properties = {
            title  = "Lambda Duration p95 (ms)"
            region = data.aws_region.current.name
            stat   = "p95"
            period = 300
            metrics = [
              for fn in var.lambda_function_names : [
                "AWS/Lambda", "Duration", "FunctionName", fn
              ]
            ]
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 7
          width  = 12
          height = 6
          properties = {
            title  = "Lambda Concurrent Executions"
            region = data.aws_region.current.name
            stat   = "Maximum"
            period = 300
            metrics = [
              for fn in var.lambda_function_names : [
                "AWS/Lambda", "ConcurrentExecutions", "FunctionName", fn
              ]
            ]
          }
        }
      ],
      # DynamoDB
      [
        {
          type   = "metric"
          x      = 0
          y      = 13
          width  = 8
          height = 6
          properties = {
            title  = "DynamoDB Consumed RCU/WCU"
            region = data.aws_region.current.name
            stat   = "Sum"
            period = 300
            metrics = [
              ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", var.dynamodb_table_name],
              ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", var.dynamodb_table_name]
            ]
          }
        },
        {
          type   = "metric"
          x      = 8
          y      = 13
          width  = 8
          height = 6
          properties = {
            title  = "DynamoDB Throttled Requests"
            region = data.aws_region.current.name
            stat   = "Sum"
            period = 60
            metrics = [
              ["AWS/DynamoDB", "ReadThrottleEvents", "TableName", var.dynamodb_table_name],
              ["AWS/DynamoDB", "WriteThrottleEvents", "TableName", var.dynamodb_table_name]
            ]
          }
        },
        {
          type   = "metric"
          x      = 16
          y      = 13
          width  = 8
          height = 6
          properties = {
            title  = "DynamoDB Latency (ms)"
            region = data.aws_region.current.name
            stat   = "Average"
            period = 300
            metrics = [
              ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", var.dynamodb_table_name, "Operation", "GetItem"],
              ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", var.dynamodb_table_name, "Operation", "Query"],
              ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", var.dynamodb_table_name, "Operation", "PutItem"]
            ]
          }
        }
      ],
      # API Gateway
      [
        {
          type   = "metric"
          x      = 0
          y      = 19
          width  = 8
          height = 6
          properties = {
            title  = "API Gateway Requests"
            region = data.aws_region.current.name
            stat   = "Sum"
            period = 300
            metrics = [
              ["AWS/ApiGateway", "Count", "ApiName", var.api_gateway_name, "Stage", var.api_gateway_stage]
            ]
          }
        },
        {
          type   = "metric"
          x      = 8
          y      = 19
          width  = 8
          height = 6
          properties = {
            title  = "API Gateway 4xx / 5xx"
            region = data.aws_region.current.name
            stat   = "Sum"
            period = 300
            metrics = [
              ["AWS/ApiGateway", "4XXError", "ApiName", var.api_gateway_name, "Stage", var.api_gateway_stage],
              ["AWS/ApiGateway", "5XXError", "ApiName", var.api_gateway_name, "Stage", var.api_gateway_stage]
            ]
          }
        },
        {
          type   = "metric"
          x      = 16
          y      = 19
          width  = 8
          height = 6
          properties = {
            title  = "API Gateway Latency p95 (ms)"
            region = data.aws_region.current.name
            stat   = "p95"
            period = 300
            metrics = [
              ["AWS/ApiGateway", "Latency", "ApiName", var.api_gateway_name, "Stage", var.api_gateway_stage],
              ["AWS/ApiGateway", "IntegrationLatency", "ApiName", var.api_gateway_name, "Stage", var.api_gateway_stage]
            ]
          }
        }
      ],
      # Bedrock
      [
        {
          type   = "metric"
          x      = 0
          y      = 25
          width  = 12
          height = 6
          properties = {
            title  = "Bedrock Invocations & Latency"
            region = data.aws_region.current.name
            stat   = "Sum"
            period = 300
            metrics = [
              ["AWS/Bedrock", "Invocations", "ModelId", "us.anthropic.claude-sonnet-4-20250514-v1:0"],
              ["AWS/Bedrock", "Invocations", "ModelId", "amazon.titan-embed-text-v2:0"],
              ["AWS/Bedrock", "InvocationLatency", "ModelId", "us.anthropic.claude-sonnet-4-20250514-v1:0", { stat = "p95" }],
              ["AWS/Bedrock", "InvocationLatency", "ModelId", "amazon.titan-embed-text-v2:0", { stat = "p95" }]
            ]
          }
        }
      ]
    )
  })
}

# --- Alarms ---

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = toset(var.lambda_function_names)

  alarm_name          = "${each.value}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.alarm_lambda_error_pct
  alarm_description   = "Lambda ${each.value} error rate > ${var.alarm_lambda_error_pct}%"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_sns_topic_arn]

  metric_query {
    id          = "error_rate"
    expression  = "IF(invocations > 0, errors / invocations * 100, 0)"
    label       = "Error Rate %"
    return_data = true
  }
  metric_query {
    id = "errors"
    metric {
      metric_name = "Errors"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions  = { FunctionName = each.value }
    }
  }
  metric_query {
    id = "invocations"
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions  = { FunctionName = each.value }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_throttle" {
  alarm_name          = "${var.project_name}-${var.environment}-dynamodb-throttle"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 60
  threshold           = 0
  statistic           = "Sum"
  metric_name         = "ReadThrottleEvents"
  namespace           = "AWS/DynamoDB"
  dimensions          = { TableName = var.dynamodb_table_name }
  alarm_description   = "DynamoDB throttling detected"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_sns_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.project_name}-${var.environment}-api-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.alarm_api_5xx_pct
  alarm_description   = "API Gateway 5xx rate > ${var.alarm_api_5xx_pct}%"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_sns_topic_arn]

  metric_query {
    id          = "error_rate"
    expression  = "IF(requests > 0, errors / requests * 100, 0)"
    label       = "5xx Rate %"
    return_data = true
  }
  metric_query {
    id = "errors"
    metric {
      metric_name = "5XXError"
      namespace   = "AWS/ApiGateway"
      period      = 300
      stat        = "Sum"
      dimensions  = { ApiName = var.api_gateway_name, Stage = var.api_gateway_stage }
    }
  }
  metric_query {
    id = "requests"
    metric {
      metric_name = "Count"
      namespace   = "AWS/ApiGateway"
      period      = 300
      stat        = "Sum"
      dimensions  = { ApiName = var.api_gateway_name, Stage = var.api_gateway_stage }
    }
  }
}

# --- X-Ray tracing ---
# Lambda: active tracing enabled via tracing_config in Lambda module
# API Gateway: xray_tracing_enabled in api-gateway module stage

# --- Data sources ---

data "aws_region" "current" {}

# --- Outputs ---

output "dashboard_name" {
  value = aws_cloudwatch_dashboard.main.dashboard_name
}

output "dashboard_url" {
  value = "https://${data.aws_region.current.name}.console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "alarm_names" {
  value = concat(
    [for a in aws_cloudwatch_metric_alarm.lambda_errors : a.alarm_name],
    [aws_cloudwatch_metric_alarm.dynamodb_throttle.alarm_name],
    [aws_cloudwatch_metric_alarm.api_5xx.alarm_name],
  )
}
