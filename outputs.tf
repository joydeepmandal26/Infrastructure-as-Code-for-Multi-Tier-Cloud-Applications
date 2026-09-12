output "cloudfront_domain_name" {
  description = "CloudFront distribution URL for the static frontend (Presentation Tier)"
  value       = module.frontend.cloudfront_domain_name
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS (Application Tier entry point)"
  value       = module.compute.alb_dns_name
}

output "rds_endpoint" {
  description = "RDS database endpoint (Data Tier - private, not publicly accessible)"
  value       = module.rds.db_endpoint
  sensitive   = true
}

output "vpc_id" {
  description = "ID of the provisioned VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets (ALB layer)"
  value       = module.vpc.public_subnet_ids
}

output "private_app_subnet_ids" {
  description = "IDs of private application subnets (EC2 layer)"
  value       = module.vpc.private_app_subnet_ids
}

output "private_db_subnet_ids" {
  description = "IDs of private database subnets (RDS layer)"
  value       = module.vpc.private_db_subnet_ids
}

output "application_url" {
  description = "Full HTTPS URL to access the deployed application"
  value       = "https://${module.frontend.cloudfront_domain_name}"
}

output "cloudwatch_dashboard_url" {
  description = "AWS Console URL for the CloudWatch monitoring dashboard"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${var.project_name}-${var.environment}"
}
