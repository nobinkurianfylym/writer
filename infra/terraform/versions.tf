terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state in S3 with DynamoDB locking. Bootstrap this bucket/table
  # once, out of band, before the first `terraform init`.
  backend "s3" {
    bucket         = "fylym-terraform-state"
    key            = "fylym/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "fylym-terraform-locks"
    encrypt        = true
    # `key` is overridden per workspace via `-backend-config` in CI so
    # staging and prod never share state.
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "fylym"
      Environment = terraform.workspace
      ManagedBy   = "terraform"
    }
  }
}
