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
