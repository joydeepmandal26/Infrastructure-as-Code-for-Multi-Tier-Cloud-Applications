locals {
  user_data = base64encode(templatefile("${path.root}/scripts/user_data.sh", {
    db_endpoint = var.db_endpoint
    db_name     = var.db_name
    db_username = var.db_username
    db_password = var.db_password
    app_port    = var.app_port
  }))
}

# ========================
# Application Load Balancer
# ========================
resource "aws_lb" "main" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = false

  tags = {
    Name = "${var.project_name}-${var.environment}-alb"
  }
}

# ========================
# Target Group (points to EC2 instances)
# ========================
resource "aws_lb_target_group" "app" {
  name     = "${var.project_name}-${var.environment}-tg"
  port     = var.app_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/api/health"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-tg"
  }
}

# ========================
# ALB Listener (port 80)
# ========================
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ========================
# EC2 Launch Template
# ========================
resource "aws_launch_template" "app" {
  name_prefix   = "${var.project_name}-${var.environment}-lt-"
  image_id      = var.ami_id
  instance_type = var.ec2_instance_type

  vpc_security_group_ids = [var.ec2_security_group_id]

  user_data = local.user_data

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "${var.project_name}-${var.environment}-app-server"
      Environment = var.environment
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ========================
# Auto Scaling Group
# ========================
resource "aws_autoscaling_group" "app" {
  name                = "${var.project_name}-${var.environment}-asg"
  min_size            = var.app_instance_count_min
  desired_capacity    = var.app_instance_count_desired
  max_size            = var.app_instance_count_max
  vpc_zone_identifier = var.private_app_subnet_ids
  target_group_arns   = [aws_lb_target_group.app.arn]
  health_check_type   = "ELB"

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-${var.environment}-app-instance"
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ========================
# Auto Scaling Policy (Scale Out on CPU > threshold)
# ========================
resource "aws_autoscaling_policy" "scale_out" {
  name                   = "${var.project_name}-${var.environment}-scale-out"
  autoscaling_group_name = aws_autoscaling_group.app.name
  adjustment_type        = "ChangeInCapacity"
  scaling_adjustment     = 1
  cooldown               = 300
}
