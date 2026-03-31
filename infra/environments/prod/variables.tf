variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name, prefixes all resources"
  type        = string
  default     = "ssb"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be dev or prod."
  }
}

variable "node_types" {
  description = "Valid knowledge node types"
  type        = list(string)
  default     = ["concept", "note", "experiment", "essay"]
}

variable "edge_types" {
  description = "Valid edge relationship types"
  type        = list(string)
  default     = ["related"]
}

variable "bedrock_model_id" {
  description = "Bedrock model ID for classification and reasoning"
  type        = string
  default     = "us.anthropic.claude-sonnet-4-20250514-v1:0"
}

variable "bedrock_embedding_model_id" {
  description = "Bedrock model ID for embeddings"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}

variable "digest_email" {
  description = "Email address for daily digest notifications"
  type        = string
  default     = "jonmatum@gmail.com"
}

variable "cors_allow_origin" {
  description = "CORS allowed origin for API Gateway"
  type        = string
  default     = "https://jonmatum.com"
}

variable "surfacing_stale_days" {
  description = "Days before a seed is considered stale"
  type        = number
  default     = 7
}

variable "surfacing_min_edges" {
  description = "Minimum edges before a node is considered orphaned"
  type        = number
  default     = 2
}

variable "surfacing_similarity_threshold" {
  description = "Cosine similarity threshold for missing connection suggestions"
  type        = string
  default     = "0.85"
}

variable "custom_domain" {
  description = "Custom domain for CloudFront distribution"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for custom domain (must be in us-east-1)"
  type        = string
  default     = ""
}

variable "default_visibility" {
  description = "Default visibility for new nodes: public or private"
  type        = string
  default     = "private"

  validation {
    condition     = contains(["public", "private"], var.default_visibility)
    error_message = "Visibility must be public or private."
  }
}

variable "cognito_callback_urls" {
  description = "Allowed OAuth callback URLs for frontend"
  type        = list(string)
  default     = ["http://localhost:3000/callback"]
}

variable "cognito_logout_urls" {
  description = "Allowed OAuth logout URLs"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "allow_self_signup" {
  description = "Allow users to self-register (false = personal, true = multi-tenant)"
  type        = bool
  default     = false
}
