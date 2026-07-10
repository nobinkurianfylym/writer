# Managed data stores: RDS Postgres, ElastiCache Redis, and the S3 export
# bucket. All encrypted at rest with KMS (§9). RDS is Multi-AZ in prod.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "name" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "data_sg_id" { type = string }
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "db_multi_az" {
  type    = bool
  default = false
}
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}
variable "db_username" {
  type    = string
  default = "fylym"
}
variable "db_password" {
  type      = string
  sensitive = true
}

# ---- RDS Postgres ----

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_instance" "this" {
  identifier                  = "${var.name}-db"
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = var.db_instance_class
  allocated_storage           = 20
  max_allocated_storage       = 100
  db_name                     = "fylym"
  username                    = var.db_username
  password                    = var.db_password
  multi_az                    = var.db_multi_az
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [var.data_sg_id]
  storage_encrypted           = true
  backup_retention_period     = 35 # PITR window (§9 durability)
  deletion_protection         = true
  skip_final_snapshot         = false
  final_snapshot_identifier   = "${var.name}-db-final"
  performance_insights_enabled = true
  apply_immediately           = false
}

# ---- ElastiCache Redis ----

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name}-redis"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = "${var.name}-redis"
  description                = "${var.name} Redis (rate limit + BullMQ)"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.db_multi_az ? 2 : 1
  automatic_failover_enabled = var.db_multi_az
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [var.data_sg_id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  port                       = 6379
}

# ---- S3 export bucket (short-lived signed URLs; §9) ----

resource "aws_s3_bucket" "exports" {
  bucket = "${var.name}-exports"
}

resource "aws_s3_bucket_public_access_block" "exports" {
  bucket                  = aws_s3_bucket.exports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id
  rule {
    id     = "expire-exports"
    status = "Enabled"
    filter { prefix = "exports/" }
    expiration { days = 30 }
  }
}

output "db_endpoint" { value = aws_db_instance.this.address }
output "redis_endpoint" { value = aws_elasticache_replication_group.this.primary_endpoint_address }
output "exports_bucket" { value = aws_s3_bucket.exports.bucket }
