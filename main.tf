data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ========================
# VPC & Networking
# ========================
module "vpc" {
  source = "./modules/vpc"

  project_name             = var.project_name
  environment              = var.environment
  vpc_cidr                 = var.vpc_cidr
  public_subnet_cidrs      = var.public_subnet_cidrs
  private_app_subnet_cidrs = var.private_app_subnet_cidrs
  private_db_subnet_cidrs  = var.private_db_subnet_cidrs
  availability_zones       = slice(data.aws_availability_zones.available.names, 0, 2)
  cost_optimized_mode      = var.cost_optimized_mode
}

# ========================
# Security Groups
# ========================
module "security_groups" {
  source = "./modules/security_groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
  app_port     = var.app_port
}

# ========================
# Application Tier (ALB + EC2 ASG)
# ========================
module "compute" {
  source = "./modules/compute"

  project_name               = var.project_name
  environment                = var.environment
  vpc_id                     = module.vpc.vpc_id
  public_subnet_ids          = module.vpc.public_subnet_ids
  private_app_subnet_ids     = var.cost_optimized_mode ? module.vpc.public_subnet_ids : module.vpc.private_app_subnet_ids
  alb_security_group_id      = module.security_groups.alb_sg_id
  ec2_security_group_id      = module.security_groups.ec2_sg_id
  ec2_instance_type          = var.ec2_instance_type
  ami_id                     = data.aws_ami.amazon_linux_2.id
  app_instance_count_min     = var.app_instance_count_min
  app_instance_count_desired = var.app_instance_count_desired
  app_instance_count_max     = var.app_instance_count_max
  app_port                   = var.app_port
  db_endpoint                = module.rds.db_endpoint
  db_name                    = var.db_name
  db_username                = var.db_username
  db_password                = var.db_password
}

# ========================
# Data Tier (RDS)
# ========================
module "rds" {
  source = "./modules/rds"

  project_name          = var.project_name
  environment           = var.environment
  private_db_subnet_ids = module.vpc.private_db_subnet_ids
  db_security_group_id  = module.security_groups.rds_sg_id
  db_engine             = var.db_engine
  db_engine_version     = var.db_engine_version
  db_instance_class     = var.db_instance_class
  db_allocated_storage  = var.db_allocated_storage
  db_name               = var.db_name
  db_username           = var.db_username
  db_password           = var.db_password
  multi_az              = var.multi_az
}



# ========================
# Monitoring (CloudWatch)
# ========================
module "monitoring" {
  source = "./modules/monitoring"

  project_name        = var.project_name
  environment         = var.environment
  aws_region          = var.aws_region
  asg_name            = module.compute.asg_name
  alb_arn_suffix      = module.compute.alb_arn_suffix
  db_instance_id      = module.rds.db_instance_id
  alert_email         = var.alert_email
  cpu_alarm_threshold = var.cpu_alarm_threshold
}
