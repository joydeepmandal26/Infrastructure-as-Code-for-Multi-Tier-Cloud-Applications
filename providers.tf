terraform {
  required_version = ">= 1.16.5"

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
      Project     = "IaC-MultiTier"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Team        = "Joydeep_Vikash_Deepak"
    }
  }
}
