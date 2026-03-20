terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "ssb-terraform-state"
    key            = "ssb/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ssb-terraform-lock"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
