# ========================
# SNS Topic for Alerts
# ========================
resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.environment}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ========================
# EC2 CPU High Alarm (triggers scale-out)
# ========================
resource "aws_cloudwatch_metric_alarm" "ec2_cpu_high" {
  alarm_name          = "${var.project_name}-${var.environment}-ec2-cpu-high"
  alarm_description   = "Triggers when EC2 average CPU exceeds threshold"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 120
  statistic           = "Average"
  threshold           = var.cpu_alarm_threshold

  dimensions = {
    AutoScalingGroupName = var.asg_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${var.project_name}-${var.environment}-cpu-alarm"
  }
}

# ========================
# RDS CPU Alarm
# ========================
resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-cpu-high"
  alarm_description   = "RDS CPU utilization exceeded 80%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 120
  statistic           = "Average"
  threshold           = 80

  dimensions = {
    DBInstanceIdentifier = var.db_instance_id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ========================
# Billing Alarm ($1 safety net)
# ========================
resource "aws_cloudwatch_metric_alarm" "billing_alert" {
  alarm_name          = "${var.project_name}-${var.environment}-billing-alert"
  alarm_description   = "AWS bill exceeded $1 — investigate immediately!"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 86400
  statistic           = "Maximum"
  threshold           = 1

  dimensions = {
    Currency = "USD"
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ========================
# CloudWatch Dashboard
# ========================
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "EC2 Auto Scaling Group - CPU Utilization"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", var.asg_name]
          ]
          period = 60
          stat   = "Average"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "ALB - Request Count & Latency"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "RDS - CPU & DB Connections"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.db_instance_id],
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.db_instance_id]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Billing - Estimated Charges (USD)"
          view   = "timeSeries"
          region = "us-east-1"
          metrics = [
            ["AWS/Billing", "EstimatedCharges", "Currency", "USD"]
          ]
          period = 86400
          stat   = "Maximum"
        }
      }
    ]
  })
}
