# ========================
# General
# ========================
variable "aws_region" {
  description = "AWS region to deploy all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (dev or prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be 'dev' or 'prod'."
  }
}

variable "project_name" {
  description = "Project name used as prefix for all resources"
  type        = string
  default     = "iac-multitier"
}

# ========================
# Networking
# ========================
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_app_subnet_cidrs" {
  description = "CIDR blocks for private application subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "private_db_subnet_cidrs" {
  description = "CIDR blocks for private database subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24"]
}

variable "cost_optimized_mode" {
  description = "When true, eliminates NAT Gateway ($0/month). EC2 access controlled via Security Groups only."
  type        = bool
  default     = true
}

# ========================
# Compute (EC2 / ALB / ASG)
# ========================
variable "ec2_instance_type" {
  description = "EC2 instance type for application servers"
  type        = string
  default     = "t2.micro" # Free tier eligible
}

variable "app_instance_count_min" {
  description = "Minimum number of EC2 instances in the Auto Scaling Group"
  type        = number
  default     = 1
}

variable "app_instance_count_desired" {
  description = "Desired number of EC2 instances in the Auto Scaling Group"
  type        = number
  default     = 1
}

variable "app_instance_count_max" {
  description = "Maximum number of EC2 instances in the Auto Scaling Group"
  type        = number
  default     = 2
}

variable "app_port" {
  description = "Port on which the application backend listens"
  type        = number
  default     = 3000
}

# ========================
# Database (RDS)
# ========================
variable "db_engine" {
  description = "RDS database engine"
  type        = string
  default     = "mysql"
}

variable "db_engine_version" {
  description = "RDS engine version"
  type        = string
  default     = "8.0"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro" # Free tier eligible
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS in GB (20 GB is free tier)"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Name of the initial database"
  type        = string
  default     = "appdb"
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "admin"
  sensitive   = true
}

variable "db_password" {
  description = "RDS master password (min 8 chars)"
  type        = string
  sensitive   = true
}

variable "multi_az" {
  description = "Enable Multi-AZ for RDS (NOT free tier eligible — set false to keep $0 cost)"
  type        = bool
  default     = false
}

# ========================
# Monitoring & Alerts
# ========================
variable "alert_email" {
  description = "Email address to receive CloudWatch billing and infrastructure alerts"
  type        = string
  default     = ""
}

variable "cpu_alarm_threshold" {
  description = "EC2 CPU utilization % threshold to trigger scale-out alarm"
  type        = number
  default     = 70
}
