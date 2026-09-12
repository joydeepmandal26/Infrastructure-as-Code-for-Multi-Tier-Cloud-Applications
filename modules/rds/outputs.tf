output "db_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}

output "db_instance_id" {
  value = aws_db_instance.main.id
}

output "db_arn" {
  value = aws_db_instance.main.arn
}
