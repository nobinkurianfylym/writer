# Paging + uptime. A 5xx burn-rate alarm on the API and an external uptime
# health check both notify an SNS topic (wire it to PagerDuty/email).

variable "alert_email" {
  description = "Address subscribed to the paging SNS topic."
  type        = string
  default     = ""
}

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ---- API 5xx burn rate ----
# Fires when the API returns 5xx at an elevated rate — the signal that a bad
# deploy slipped past smoke, or a downstream dependency is failing.
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name}-api-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.this.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ---- Uptime health check (external, us-east-1 metric) ----
resource "aws_route53_health_check" "api" {
  fqdn              = "api.${var.app_domain}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 30
  tags              = { Name = "${local.name}-api-uptime" }
}

# Route53 health check metrics live in us-east-1 regardless of app region.
resource "aws_cloudwatch_metric_alarm" "api_uptime" {
  alarm_name          = "${local.name}-api-uptime"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    HealthCheckId = aws_route53_health_check.api.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

output "alerts_topic_arn" { value = aws_sns_topic.alerts.arn }
