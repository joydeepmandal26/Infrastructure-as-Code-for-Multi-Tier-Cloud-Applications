# Infrastructure as Code for Multi-Tier Cloud Applications

A production-ready, modular **Terraform** implementation for deploying a resilient multi-tier web application architecture on **Amazon Web Services (AWS)**.

---

## 🏛 Architecture Overview

The infrastructure implements a multi-tier pattern adhering to the **AWS Well-Architected Framework**:

```
                              Internet
                                 │
                         ┌───────▼───────┐
                         │ Internet GW   │
                         └───────┬───────┘
                                 │
┌────────────────────────────────┼────────────────────────────────┐
│ VPC (10.0.0.0/16)              │                                │
│                                │                                │
│   ┌────────────────────────────▼────────────────────────────┐   │
│   │  Public Subnets (Multi-AZ)                              │   │
│   │  Application Load Balancer (ALB) - HTTP (Port 80)       │   │
│   └────────────────────────────┬────────────────────────────┘   │
│                                │                                │
│   ┌────────────────────────────▼────────────────────────────┐   │
│   │  App Subnets (Multi-AZ)                                 │   │
│   │  EC2 Auto Scaling Group (Node.js API - Port 3000)       │   │
│   └────────────────────────────┬────────────────────────────┘   │
│                                │                                │
│   ┌────────────────────────────▼────────────────────────────┐   │
│   │  Database Subnets (Multi-AZ Private)                    │   │
│   │  Amazon RDS (MySQL 8.0 - Port 3306)                     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   CloudWatch Alarms & Metrics Dashboard + SNS Notifications     │
└─────────────────────────────────────────────────────────────────┘
```

### 1. Presentation & Routing Layer
- **Application Load Balancer (ALB)**: Deployed across public subnets in multiple Availability Zones. Distributes incoming HTTP traffic and performs health checks on target instances.

### 2. Application Tier (Compute)
- **Auto Scaling Group (ASG)**: Launches EC2 instances across availability zones with automatic scaling policies.
- **Launch Template**: Configures Amazon Linux 2 instances with automated user data scripts bootstrapping Node.js and the backend service.
- **Target Tracking / Alarms**: Scales compute capacity based on traffic load and CPU utilization.

### 3. Data Tier (Database)
- **Amazon RDS (MySQL 8.0)**: Fully managed relational database placed in dedicated private subnets with no internet ingress.
- **Configurable Multi-AZ**: High availability and automatic failover support for production workloads.

### 4. Observability & Security
- **Strict Security Group Chaining**: ALB accepts traffic on port 80; EC2 accepts traffic only from the ALB security group; RDS accepts traffic only from the EC2 security group.
- **CloudWatch Dashboard & Alarms**: Tracks ALB target response time, EC2 CPU utilization, and RDS storage/connections with SNS email alerts.

---

## 📁 Repository Structure

```
.
├── environments/               # Environment-specific configuration templates
│   ├── dev.tfvars.example      # Development environment variables
│   └── prod.tfvars.example     # Production environment variables
├── modules/
│   ├── compute/                # EC2 Launch Template, ASG, ALB, Target Groups
│   ├── frontend/               # Optional S3 + CloudFront static assets module
│   ├── monitoring/             # CloudWatch dashboards, metrics, and SNS alarms
│   ├── rds/                    # Amazon RDS MySQL instance and Subnet Groups
│   ├── security_groups/        # Layered security group definitions
│   └── vpc/                    # Multi-AZ VPC, subnets, route tables, and IGW
├── scripts/
│   └── user_data.sh            # EC2 bootstrap script (Node.js API setup)
├── main.tf                     # Root Terraform module configuration
├── outputs.tf                  # Root output definitions (ALB URL, VPC IDs, etc.)
├── providers.tf                # AWS provider configuration and tags
├── variables.tf                # Input variable declarations
├── terraform.tfvars.example    # Example variable input file
└── README.md                   # Project documentation
```

---

## 🚀 Quick Start Guide

### Prerequisites
- [Terraform](https://www.terraform.io/downloads) (>= 1.5.0)
- [AWS CLI](https://aws.amazon.com/cli/) installed and configured (`aws configure`)
- AWS IAM permissions to provision VPC, EC2, RDS, and CloudWatch resources

### Step 1: Clone the Repository
```bash
git clone https://github.com/joydeepmandal26/Infrastructure-as-Code-for-Multi-Tier-Cloud-Applications.git
cd Infrastructure-as-Code-for-Multi-Tier-Cloud-Applications
```

### Step 2: Configure Variables
Create your `terraform.tfvars` file by copying the example:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your settings:
```hcl
aws_region          = "us-east-1"
environment         = "dev"
project_name        = "iac-multitier"
cost_optimized_mode = true

ec2_instance_type          = "t3.micro"
app_instance_count_min     = 1
app_instance_count_desired = 1
app_instance_count_max     = 2

db_instance_class = "db.t3.micro"
db_name           = "appdb"
db_username       = "admin"
db_password       = "YourStrongPasswordHere123!"

alert_email = "your-email@example.com"
```

> **Note**: Never commit `terraform.tfvars` or credentials into version control. It is already included in `.gitignore`.

### Step 3: Initialize Terraform
Download provider plugins and initialize local modules:
```bash
terraform init
```

### Step 4: Plan and Validate
Preview the resources that Terraform will create:
```bash
terraform plan
```

### Step 5: Deploy the Infrastructure
Apply the execution plan to provision the resources in AWS:
```bash
terraform apply
```
Type `yes` when prompted.

---

## 📊 Key Outputs

Once provisioning finishes, Terraform outputs the connection details:
- `application_url`: Direct URL to the Application Load Balancer
- `alb_dns_name`: Public DNS endpoint of the ALB
- `vpc_id`: Provisioned VPC identifier
- `cloudwatch_dashboard_url`: Direct link to your AWS CloudWatch metrics dashboard

---

## 🧹 Clean Up / Teardown

To avoid incurring ongoing AWS charges after testing or evaluation:
```bash
terraform destroy
```
Type `yes` to confirm deletion of all provisioned cloud resources.

---

## 🛡 Security Best Practices
- **No Public Database**: The RDS instance is placed in private isolated subnets without public IPs.
- **Principle of Least Privilege**: Ingress rules restrict traffic strictly tier-by-tier.
- **Cost-Optimized Mode**: `cost_optimized_mode = true` enables single-AZ NAT-free dev environments to remain within AWS Free Tier limits.
