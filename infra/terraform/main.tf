# Root composition for a FYLYM environment. Select the environment with a
# Terraform workspace: `terraform workspace select staging`. Per-env sizing
# is driven off `terraform.workspace` so staging and prod share one codebase.

data "aws_caller_identity" "current" {}

locals {
  env    = terraform.workspace
  name   = "fylym-${local.env}"
  is_prod = local.env == "prod"

  account_id = data.aws_caller_identity.current.account_id
  registry   = "${local.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"

  services = ["api", "worker", "web"]

  # Modest in staging; larger + Multi-AZ in prod.
  db_instance_class = local.is_prod ? "db.r6g.large" : "db.t4g.micro"
  redis_node_type   = local.is_prod ? "cache.r6g.large" : "cache.t4g.micro"
  multi_az          = local.is_prod

  api_url = "https://api.${var.app_domain}"
  web_url = "https://${var.app_domain}"

  database_url = "postgresql://fylym:${var.db_password}@${module.data.db_endpoint}:5432/fylym"
  redis_url    = "rediss://${module.data.redis_endpoint}:6379"
}

# ---- Container registry ----

resource "aws_ecr_repository" "svc" {
  for_each             = toset(local.services)
  name                 = "fylym/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

# ---- Networking + data ----

module "network" {
  source                = "./modules/network"
  name                  = local.name
  azs                   = var.azs
  cloudflare_ipv4_cidrs = var.cloudflare_ipv4_cidrs
}

module "data" {
  source             = "./modules/data"
  name               = local.name
  private_subnet_ids = module.network.private_subnet_ids
  data_sg_id         = module.network.data_sg_id
  db_instance_class  = local.db_instance_class
  db_multi_az        = local.multi_az
  redis_node_type    = local.redis_node_type
  db_password        = var.db_password
}

# ---- Secrets: DATABASE_URL/REDIS_URL contain credentials, so inject them as
#      ECS secrets rather than plaintext environment. ----

resource "aws_secretsmanager_secret" "database_url" {
  name = "${local.name}/database-url"
}
resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = local.database_url
}

resource "aws_secretsmanager_secret" "redis_url" {
  name = "${local.name}/redis-url"
}
resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = local.redis_url
}

locals {
  data_secret_arns = {
    DATABASE_URL = aws_secretsmanager_secret.database_url.arn
    REDIS_URL    = aws_secretsmanager_secret.redis_url.arn
  }
  # App secrets (JWT keys, SMTP, Google OAuth) come from var.app_secret_arns.
  service_secret_arns = merge(local.data_secret_arns, var.app_secret_arns)
}

# ---- IAM ----

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name}-exec"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Execution role also needs to read the secrets it injects.
data "aws_iam_policy_document" "read_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = values(local.service_secret_arns)
  }
}
resource "aws_iam_role_policy" "read_secrets" {
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_secrets.json
}

resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

# Task role: the worker + api read/write the exports bucket.
data "aws_iam_policy_document" "task" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["arn:aws:s3:::${module.data.exports_bucket}/*"]
  }
}
resource "aws_iam_role_policy" "task" {
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

# ---- Cluster + ALB ----

resource "aws_ecs_cluster" "this" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_lb" "this" {
  name               = local.name
  load_balancer_type = "application"
  security_groups    = [module.network.alb_sg_id]
  subnets            = module.network.public_subnet_ids
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name}-api"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = module.network.vpc_id
  target_type = "ip"
  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
  }
}

resource "aws_lb_target_group" "web" {
  name        = "${local.name}-web"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.network.vpc_id
  target_type = "ip"
  health_check {
    path                = "/login"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# api.<domain> routes to the API service.
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  condition {
    host_header { values = ["api.${var.app_domain}"] }
  }
}

# ---- Services ----

module "api" {
  source             = "./modules/ecs-service"
  name               = "${local.name}-api"
  cluster_arn        = aws_ecs_cluster.this.arn
  execution_role_arn = aws_iam_role.execution.arn
  task_role_arn      = aws_iam_role.task.arn
  image              = "${local.registry}/fylym/api:${var.image_tag}"
  container_port     = 3001
  subnet_ids         = module.network.private_subnet_ids
  security_group_id  = module.network.service_sg_id
  target_group_arn   = aws_lb_target_group.api.arn
  aws_region         = var.aws_region
  desired_count      = local.is_prod ? 2 : 1
  min_count          = local.is_prod ? 2 : 1
  max_count          = local.is_prod ? 8 : 2
  environment = {
    PORT           = "3001"
    APP_URL        = local.web_url
    CORS_ORIGIN    = local.web_url
    S3_ENDPOINT    = "https://s3.${var.aws_region}.amazonaws.com"
    S3_REGION      = var.aws_region
    S3_BUCKET      = module.data.exports_bucket
    S3_FORCE_PATH_STYLE = "false"
  }
  secret_arns = local.service_secret_arns
}

module "worker" {
  source             = "./modules/ecs-service"
  name               = "${local.name}-worker"
  cluster_arn        = aws_ecs_cluster.this.arn
  execution_role_arn = aws_iam_role.execution.arn
  task_role_arn      = aws_iam_role.task.arn
  image              = "${local.registry}/fylym/worker:${var.image_tag}"
  subnet_ids         = module.network.private_subnet_ids
  security_group_id  = module.network.service_sg_id
  aws_region         = var.aws_region
  desired_count      = 1
  min_count          = 1
  max_count          = local.is_prod ? 6 : 2
  environment = {
    S3_ENDPOINT         = "https://s3.${var.aws_region}.amazonaws.com"
    S3_REGION           = var.aws_region
    S3_BUCKET           = module.data.exports_bucket
    S3_FORCE_PATH_STYLE = "false"
  }
  secret_arns = local.service_secret_arns
}

module "web" {
  source             = "./modules/ecs-service"
  name               = "${local.name}-web"
  cluster_arn        = aws_ecs_cluster.this.arn
  execution_role_arn = aws_iam_role.execution.arn
  task_role_arn      = aws_iam_role.task.arn
  image              = "${local.registry}/fylym/web:${var.image_tag}"
  container_port     = 3000
  subnet_ids         = module.network.private_subnet_ids
  security_group_id  = module.network.service_sg_id
  target_group_arn   = aws_lb_target_group.web.arn
  aws_region         = var.aws_region
  desired_count      = local.is_prod ? 2 : 1
  min_count          = local.is_prod ? 2 : 1
  max_count          = local.is_prod ? 6 : 2
  environment = {
    PORT     = "3000"
    HOSTNAME = "0.0.0.0"
  }
}

output "alb_dns_name" { value = aws_lb.this.dns_name }
output "ecr_registry" { value = local.registry }
output "exports_bucket" { value = module.data.exports_bucket }
