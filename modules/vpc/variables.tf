variable "project_name" {
  description = "Project name prefix for tagging resources"
  type        = string
  default     = "multi-tier-cloud"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "CIDR block for the custom VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of Availability Zones to spread subnets across"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (Presentation / ALB)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_app_subnet_cidrs" {
  description = "CIDR blocks for application tier subnets (EC2 ASG)"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "private_db_subnet_cidrs" {
  description = "CIDR blocks for data tier subnets (Amazon RDS)"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24"]
}

variable "enable_nat_gateway" {
  description = "Set to true to provision a NAT Gateway (~$32/mo). Keep false for $0 Free-Tier safe mode."
  type        = bool
  default     = false
}

variable "cost_optimized_mode" {
  description = "When true and enable_nat_gateway is false, enables map_public_ip_on_launch for app subnets so instances can fetch packages at $0 without a NAT Gateway, secured via strict ALB-only Security Groups."
  type        = bool
  default     = true
}
