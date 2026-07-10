variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "azs" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

variable "image_tag" {
  description = "Container image tag to deploy (a git SHA in CI)."
  type        = string
}

variable "db_password" {
  description = "RDS master password (from CI secret / Secrets Manager)."
  type        = string
  sensitive   = true
}

variable "cloudflare_ipv4_cidrs" {
  description = "Cloudflare edge ranges permitted to reach the ALB."
  type        = list(string)
  # https://www.cloudflare.com/ips-v4 — kept short here; full list in tfvars.
  default = ["173.245.48.0/20", "103.21.244.0/22", "104.16.0.0/13"]
}

variable "app_domain" {
  description = "Public hostname for the web app (Cloudflare-fronted)."
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM cert ARN for the ALB HTTPS listener."
  type        = string
}

variable "app_secret_arns" {
  description = "Map of container env var name -> Secrets Manager ARN (JWT keys, SMTP, OAuth, etc.)."
  type        = map(string)
  default     = {}
}
