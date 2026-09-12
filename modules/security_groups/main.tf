# ========================
# ALB Security Group
# Accepts HTTP/HTTPS from the public internet
# ========================
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Security group for Application Load Balancer - allows public HTTP/HTTPS"
  vpc_id      = var.vpc_id

  ingress {
    description = "Allow HTTP from Internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow HTTPS from Internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound to EC2 app tier"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-sg"
    Tier = "Public"
  }
}

# ========================
# EC2 App Security Group
# ONLY accepts traffic from the ALB (never directly from internet)
# ========================
resource "aws_security_group" "ec2_app" {
  name        = "${var.project_name}-${var.environment}-ec2-sg"
  description = "Security group for EC2 app servers - only accepts from ALB"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Allow app port ONLY from ALB"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Allow all outbound (DB queries, package updates)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-sg"
    Tier = "Application"
  }
}

# ========================
# RDS Security Group
# ONLY accepts MySQL/Postgres traffic from EC2 app tier
# ========================
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-${var.environment}-rds-sg"
  description = "Security group for RDS - only accepts from EC2 app tier"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Allow MySQL ONLY from EC2 app tier"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2_app.id]
  }

  egress {
    description = "Allow outbound (replication, maintenance)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-sg"
    Tier = "Database"
  }
}
