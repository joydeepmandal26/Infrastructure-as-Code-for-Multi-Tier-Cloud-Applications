variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "private_app_subnet_ids" { type = list(string) }
variable "alb_security_group_id" { type = string }
variable "ec2_security_group_id" { type = string }
variable "ec2_instance_type" { type = string }
variable "ami_id" { type = string }
variable "app_instance_count_min" { type = number }
variable "app_instance_count_desired" { type = number }
variable "app_instance_count_max" { type = number }
variable "app_port" { type = number }
variable "db_endpoint" { type = string }
variable "db_name" { type = string }
variable "db_username" {
  type      = string
  sensitive = true
}
variable "db_password" {
  type      = string
  sensitive = true
}
