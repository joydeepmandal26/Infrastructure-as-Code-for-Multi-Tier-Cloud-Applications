output "alb_sg_id" {
  value = aws_security_group.alb.id
}

output "ec2_sg_id" {
  value = aws_security_group.ec2_app.id
}

output "rds_sg_id" {
  value = aws_security_group.rds.id
}
