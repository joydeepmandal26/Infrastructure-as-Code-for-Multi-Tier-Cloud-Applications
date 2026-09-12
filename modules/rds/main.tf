# ========================
# DB Subnet Group
# ========================
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db-subnet-group"
  subnet_ids = var.private_db_subnet_ids

  tags = {
    Name = "${var.project_name}-${var.environment}-db-subnet-group"
    Tier = "Database"
  }
}

# ========================
# RDS MySQL Instance
# Free Tier: db.t3.micro, 20GB gp2, Single-AZ
# ========================
resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-${var.environment}-db"

  engine         = var.db_engine
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage
  storage_type          = "gp2"
  storage_encrypted     = false # Encryption requires non-free-tier storage

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_security_group_id]

  multi_az            = var.multi_az
  publicly_accessible = false

  backup_retention_period = 1
  skip_final_snapshot     = true
  deletion_protection     = false

  tags = {
    Name = "${var.project_name}-${var.environment}-rds"
    Tier = "Database"
  }
}
