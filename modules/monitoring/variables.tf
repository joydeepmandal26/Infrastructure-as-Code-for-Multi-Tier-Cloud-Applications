variable "project_name" { type = string }
variable "environment" { type = string }
variable "aws_region" { type = string }
variable "asg_name" { type = string }
variable "alb_arn_suffix" { type = string }
variable "db_instance_id" { type = string }
variable "alert_email" {
  type    = string
  default = ""
}
variable "cpu_alarm_threshold" {
  type    = number
  default = 70
}

