variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "callback_urls" {
  description = "Allowed OAuth callback URLs"
  type        = list(string)
  default     = ["http://localhost:3000/callback"]
}

variable "logout_urls" {
  description = "Allowed OAuth logout URLs"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "allow_self_signup" {
  description = "Allow users to register themselves (false = admin-only, true = multi-tenant)"
  type        = bool
  default     = false
}

# --- User Pool ---

resource "aws_cognito_user_pool" "this" {
  name = "${var.project_name}-${var.environment}-users"

  deletion_protection = "ACTIVE"

  auto_verified_attributes = ["email"]
  username_attributes       = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = !var.allow_self_signup
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }
}

# --- Resource Server (OAuth scopes) ---

resource "aws_cognito_resource_server" "api" {
  identifier   = "${var.project_name}-api"
  name         = "${var.project_name}-api"
  user_pool_id = aws_cognito_user_pool.this.id

  scope {
    scope_name        = "read"
    scope_description = "Read knowledge graph"
  }

  scope {
    scope_name        = "write"
    scope_description = "Write to knowledge graph"
  }
}

# --- App Client: SPA (frontend) ---

resource "aws_cognito_user_pool_client" "spa" {
  name         = "${var.project_name}-${var.environment}-spa"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false # PKCE flow — no secret

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile", "${aws_cognito_resource_server.api.identifier}/read", "${aws_cognito_resource_server.api.identifier}/write"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls
  supported_identity_providers         = ["COGNITO"]

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]
}

# --- App Client: MCP (machine-to-machine) ---

resource "aws_cognito_user_pool_client" "mcp" {
  name         = "${var.project_name}-${var.environment}-mcp"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = true # Client credentials flow

  allowed_oauth_flows                  = ["client_credentials"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["${aws_cognito_resource_server.api.identifier}/read", "${aws_cognito_resource_server.api.identifier}/write"]
  supported_identity_providers         = ["COGNITO"]
}

# --- Domain (hosted UI) ---

resource "aws_cognito_user_pool_domain" "this" {
  domain       = "${var.project_name}-${var.environment}"
  user_pool_id = aws_cognito_user_pool.this.id
}

# --- Outputs ---

output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.this.arn
}

output "user_pool_endpoint" {
  value = aws_cognito_user_pool.this.endpoint
}

output "spa_client_id" {
  value = aws_cognito_user_pool_client.spa.id
}

output "mcp_client_id" {
  value = aws_cognito_user_pool_client.mcp.id
}

output "mcp_client_secret" {
  value     = aws_cognito_user_pool_client.mcp.client_secret
  sensitive = true
}

output "domain" {
  value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}

output "issuer_url" {
  value = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

data "aws_region" "current" {}
