variable "gateway_name" {
  description = "Name of the AgentCore Gateway"
  type        = string
}

variable "description" {
  description = "Gateway description"
  type        = string
  default     = "MCP Gateway for Second Brain knowledge graph"
}

variable "authorizer_type" {
  description = "Authorizer type: CUSTOM_JWT or AWS_IAM"
  type        = string
  default     = "AWS_IAM"
}

variable "jwt_discovery_url" {
  description = "OIDC discovery URL (required when authorizer_type = CUSTOM_JWT)"
  type        = string
  default     = ""
}

variable "jwt_allowed_audience" {
  description = "Allowed JWT audiences"
  type        = list(string)
  default     = []
}

variable "gateway_role_arn" {
  description = "IAM role ARN for the gateway to invoke Lambdas"
  type        = string
}

variable "tools" {
  description = "Map of MCP tool definitions. Keys are target names (alphanumeric + hyphens only)."
  type = map(object({
    lambda_arn  = string
    tool_name   = optional(string)
    description = string
    input_schema = object({
      properties = list(object({
        name        = string
        type        = string
        description = string
        required    = optional(bool, false)
      }))
    })
  }))
}

# --- Gateway ---

resource "aws_bedrockagentcore_gateway" "this" {
  name        = var.gateway_name
  description = var.description
  role_arn    = var.gateway_role_arn

  authorizer_type = var.authorizer_type
  protocol_type   = "MCP"

  dynamic "authorizer_configuration" {
    for_each = var.authorizer_type == "CUSTOM_JWT" ? [1] : []
    content {
      custom_jwt_authorizer {
        discovery_url    = var.jwt_discovery_url
        allowed_audience = var.jwt_allowed_audience
      }
    }
  }

  protocol_configuration {
    mcp {
      instructions       = "MCP Gateway for a personal knowledge graph. Tools provide read, search, write, and audit capabilities over a knowledge base."
      supported_versions = ["2025-03-26"]
    }
  }
}

# --- Gateway Targets (one per tool) ---

resource "aws_bedrockagentcore_gateway_target" "tools" {
  for_each = var.tools

  name               = each.key
  gateway_identifier = aws_bedrockagentcore_gateway.this.gateway_id
  description        = each.value.description

  credential_provider_configuration {
    gateway_iam_role {}
  }

  target_configuration {
    mcp {
      lambda {
        lambda_arn = each.value.lambda_arn

        tool_schema {
          inline_payload {
            name        = coalesce(each.value.tool_name, replace(each.key, "-", "_"))
            description = each.value.description

            input_schema {
              type = "object"

              dynamic "property" {
                for_each = each.value.input_schema.properties
                content {
                  name        = property.value.name
                  type        = property.value.type
                  description = property.value.description
                  required    = property.value.required
                }
              }
            }
          }
        }
      }
    }
  }
}

# --- Lambda permissions for Gateway invocation ---

resource "aws_lambda_permission" "gateway_invoke" {
  for_each = var.tools

  statement_id  = "AllowAgentCoreGateway-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = split(":", each.value.lambda_arn)[6]
  principal     = "bedrock-agentcore.amazonaws.com"
  source_arn    = aws_bedrockagentcore_gateway.this.gateway_arn
}

# --- Outputs ---

output "gateway_id" {
  value = aws_bedrockagentcore_gateway.this.gateway_id
}

output "gateway_arn" {
  value = aws_bedrockagentcore_gateway.this.gateway_arn
}

output "gateway_url" {
  value = aws_bedrockagentcore_gateway.this.gateway_url
}
