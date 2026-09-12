/* =============================================
   IaC Studio — Application Engine
   Code editor, topology, simulations, FinOps
   ============================================= */

// ========================
// CODE SNIPPETS PER FILE TAB
// ========================
const CODE_SNIPPETS = {
  main: `# main.tf — Root Module
# Wires together all infrastructure modules

data "aws_availability_zones" "available" {
  state = "available"
}

module "vpc" {
  source = "./modules/vpc"

  project_name             = var.project_name
  environment              = var.environment
  vpc_cidr                 = var.vpc_cidr
  cost_optimized_mode      = var.cost_optimized_mode
  availability_zones       = slice(data.aws_availability_zones.available.names, 0, 2)
}

module "security_groups" {
  source   = "./modules/security_groups"
  vpc_id   = module.vpc.vpc_id
  app_port = var.app_port
}

module "compute" {
  source                     = "./modules/compute"
  vpc_id                     = module.vpc.vpc_id
  public_subnet_ids          = module.vpc.public_subnet_ids
  private_app_subnet_ids     = module.vpc.private_app_subnet_ids
  alb_security_group_id      = module.security_groups.alb_sg_id
  ec2_security_group_id      = module.security_groups.ec2_sg_id
  ec2_instance_type          = var.ec2_instance_type
  app_instance_count_desired = var.app_instance_count_desired
  app_instance_count_max     = var.app_instance_count_max
}

module "rds" {
  source                = "./modules/rds"
  private_db_subnet_ids = module.vpc.private_db_subnet_ids
  db_security_group_id  = module.security_groups.rds_sg_id
  db_instance_class     = var.db_instance_class
  multi_az              = var.multi_az
  db_password           = var.db_password
}

module "frontend" {
  source       = "./modules/frontend"
  alb_dns_name = module.compute.alb_dns_name
}

module "monitoring" {
  source       = "./modules/monitoring"
  asg_name     = module.compute.asg_name
  alert_email  = var.alert_email
}`,

  variables: `# variables.tf — Input Variables

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment: dev or prod"
  type        = string
  default     = "dev"
}

variable "cost_optimized_mode" {
  description = "Eliminates NAT Gateway. Saves $32/month."
  type        = bool
  default     = true        # ← Free Tier Safe
}

variable "ec2_instance_type" {
  type    = string
  default = "t2.micro"      # ← Free Tier: 750 hrs/mo
}

variable "app_instance_count_desired" {
  type    = number
  default = 1               # ← Stay within 750 hrs/mo
}

variable "app_instance_count_max" {
  type    = number
  default = 2
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"   # ← Free Tier: 750 hrs/mo
}

variable "multi_az" {
  description = "Multi-AZ RDS (NOT free tier!)"
  type        = bool
  default     = false       # ← Keep false for $0 cost
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "alert_email" {
  type    = string
  default = ""
}`,

  tfvars: `# terraform.tfvars — Your Configuration
# NEVER commit this file to Git!

aws_region   = "us-east-1"
environment  = "dev"

# --- Cost Guardrails ---
cost_optimized_mode        = true     # Eliminates NAT Gateway
ec2_instance_type          = "t2.micro"
app_instance_count_desired = 1        # 1 instance = 744 hrs/mo (free)
app_instance_count_max     = 2
db_instance_class          = "db.t3.micro"
multi_az                   = false    # false = $0, true = not free tier

# --- Secrets ---
db_password  = "YourSecurePass123!"   # Change this!
alert_email  = "your@email.com"       # $1 billing alert`,

  vpc: `# modules/vpc/main.tf — VPC & Networking

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "\${var.project_name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.public_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "public-subnet-\${count.index + 1}", Tier = "Public" }
}

resource "aws_subnet" "private_app" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_app_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
  tags = { Name = "private-app-subnet-\${count.index + 1}", Tier = "Application" }
}

resource "aws_subnet" "private_db" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_db_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
  tags = { Name = "private-db-subnet-\${count.index + 1}", Tier = "Database" }
}

# NAT Gateway only provisioned when cost_optimized_mode = false
resource "aws_nat_gateway" "main" {
  count         = var.cost_optimized_mode ? 0 : 1
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
}`,

  compute: `# modules/compute/main.tf — ALB + EC2 ASG

resource "aws_lb" "main" {
  name               = "\${var.project_name}-alb"
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "app" {
  port     = var.app_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path    = "/api/health"
    matcher = "200"
  }
}

resource "aws_launch_template" "app" {
  image_id      = data.aws_ami.amazon_linux_2.id
  instance_type = var.ec2_instance_type
  user_data     = base64encode(templatefile("scripts/user_data.sh", {...}))
  vpc_security_group_ids = [var.ec2_security_group_id]
}

resource "aws_autoscaling_group" "app" {
  min_size         = var.app_instance_count_min
  desired_capacity = var.app_instance_count_desired
  max_size         = var.app_instance_count_max
  target_group_arns  = [aws_lb_target_group.app.arn]
  health_check_type  = "ELB"

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }
}`,

  rds: `# modules/rds/main.tf — Amazon RDS MySQL

resource "aws_db_subnet_group" "main" {
  subnet_ids = var.private_db_subnet_ids
  tags = { Name = "\${var.project_name}-db-subnet-group" }
}

resource "aws_db_instance" "main" {
  identifier     = "\${var.project_name}-db"
  engine         = "mysql"
  engine_version = "8.0"
  instance_class = var.db_instance_class  # db.t3.micro = Free Tier

  allocated_storage = 20         # 20 GB = Free Tier
  storage_type      = "gp2"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_security_group_id]

  multi_az            = var.multi_az         # false = $0 cost
  publicly_accessible = false                # Locked to private subnet
  skip_final_snapshot = true
}`
};

// ========================
// SECURITY RULES
// ========================
const SEC_RULES = [
  { id: 'pub-access',  icon: '✅', text: 'S3 bucket public access fully blocked — CloudFront OAC enforced', level: 'pass', points: 15 },
  { id: 'rds-private', icon: '✅', text: 'RDS instance is NOT publicly accessible (isolated in private subnets)', level: 'pass', points: 15 },
  { id: 'sg-chain',    icon: '✅', text: 'Security group chain enforced: Internet → ALB → EC2 → RDS only', level: 'pass', points: 20 },
  { id: 'sg-least',    icon: '✅', text: 'EC2 only accepts traffic on app port from ALB security group', level: 'pass', points: 15 },
  { id: 'tags',        icon: '✅', text: 'All resources tagged with Environment, ManagedBy, and Project', level: 'pass', points: 10 },
  { id: 'no-hardcode', icon: '✅', text: 'DB credentials are sensitive variables — not hardcoded in source', level: 'pass', points: 15 },
  { id: 'billing',     icon: '✅', text: '$1 billing alarm configured — prevents surprise charges', level: 'pass', points: 10 },
];

const SEC_RULES_WARN = [
  { id: 'encryption',  icon: '⚠️', text: 'RDS storage encryption disabled (requires non-free-tier storage type)', level: 'warn', points: 0 },
];

// ========================
// COST TABLE
// ========================
function getCostRows(env, config) {
  const isFreeTier = env === 'dev';
  const multiAz = config.multiAz;
  const instanceCount = config.instanceCount;
  const costOptimized = config.costOptimized;

  return [
    {
      icon: '🖥', label: `EC2 ${config.instanceType} × ${instanceCount}`,
      amount: isFreeTier && instanceCount === 1 ? '$0.00' : `$${(instanceCount * 0.0116 * 744).toFixed(2)}`,
      free: isFreeTier && instanceCount === 1,
      note: isFreeTier && instanceCount === 1 ? '750 hrs free / mo' : `${(instanceCount * 744).toFixed(0)} hrs/mo`
    },
    {
      icon: '⚖️', label: 'Application Load Balancer',
      amount: isFreeTier ? '$0.00' : '$16.43',
      free: isFreeTier,
      note: isFreeTier ? '750 LCU-hrs free' : '$0.008/LCU-hr'
    },
    {
      icon: '🗄', label: `RDS db.t3.micro${multiAz ? ' (Multi-AZ)' : ''}`,
      amount: multiAz ? '$30.00' : (isFreeTier ? '$0.00' : '$15.33'),
      free: !multiAz && isFreeTier,
      note: multiAz ? 'Not free-tier eligible!' : (isFreeTier ? '750 hrs free / mo' : '$0.017/hr')
    },
    {
      icon: '🌐', label: 'NAT Gateway',
      amount: costOptimized ? '$0.00' : '$32.85',
      free: costOptimized,
      note: costOptimized ? 'Eliminated (cost_optimized_mode)' : '$0.045/hr — no free tier!'
    },
    {
      icon: '☁️', label: 'CloudFront CDN + S3',
      amount: '$0.00',
      free: true,
      note: '1 TB free (permanent)'
    },
    {
      icon: '📡', label: 'CloudWatch Monitoring',
      amount: '$0.00',
      free: true,
      note: '3 dashboards + 10 metrics free'
    },
  ];
}

// ========================
// STATE
// ========================
let state = {
  env: 'dev',
  instanceCount: 1,
  multiAz: false,
  costOptimized: true,
  instanceType: 't2.micro',
  trafficRunning: false,
  uptime: 0,
  uptimeTimer: null,
  metricsTimer: null,
  appliedAt: null,
};

// ========================
// DOM REFS
// ========================
const $editor    = document.getElementById('code-editor');
const $lineNums  = document.getElementById('line-numbers');
const $terminal  = document.getElementById('terminal-body');
const $statusBadge = document.getElementById('status-badge');
const $statusDot = document.getElementById('status-dot');
const $statusText = document.getElementById('status-text');
const $costVal   = document.getElementById('cost-value');
const $secScore  = document.getElementById('sec-score');

// ========================
// INIT
// ========================
document.addEventListener('DOMContentLoaded', () => {
  loadFile('main');
  renderSecurityRules();
  renderCostBreakdown();
  updateCostBadge();
  syncTopologyFromCode();
  bindEvents();
  startMetricsTicker();
});

// ========================
// FILE TABS
// ========================
function loadFile(key) {
  $editor.value = CODE_SNIPPETS[key] || '';
  updateLineNumbers();
}

document.querySelectorAll('.file-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.file-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadFile(tab.dataset.file);
  });
});

$editor.addEventListener('input', () => {
  updateLineNumbers();
  syncTopologyFromCode();
  renderCostBreakdown();
  updateCostBadge();
});

$editor.addEventListener('scroll', () => {
  $lineNums.scrollTop = $editor.scrollTop;
});

function updateLineNumbers() {
  const lines = $editor.value.split('\n').length;
  $lineNums.innerHTML = Array.from({length: lines}, (_, i) => `<div>${i + 1}</div>`).join('');
}

// ========================
// TOPOLOGY SYNC FROM CODE
// ========================
function syncTopologyFromCode() {
  const code = $editor.value;

  // Extract instance count from code
  const desiredMatch = code.match(/app_instance_count_desired\s*=\s*(\d+)/);
  if (desiredMatch) {
    const count = parseInt(desiredMatch[1], 10);
    if (count !== state.instanceCount) {
      state.instanceCount = Math.min(count, 4);
      updateEC2Cluster();
    }
  }

  // Extract multi_az
  const multiAzMatch = code.match(/multi_az\s*=\s*(true|false)/);
  if (multiAzMatch) {
    const newMultiAz = multiAzMatch[1] === 'true';
    if (newMultiAz !== state.multiAz) {
      state.multiAz = newMultiAz;
      updateRDSStandby();
    }
  }

  // Extract cost_optimized_mode
  const costOptMatch = code.match(/cost_optimized_mode\s*=\s*(true|false)/);
  if (costOptMatch) {
    state.costOptimized = costOptMatch[1] === 'true';
  }

  // Extract instance type
  const typeMatch = code.match(/ec2_instance_type\s*=\s*"([^"]+)"/);
  if (typeMatch) state.instanceType = typeMatch[1];

  // Update ASG label
  const asgLabel = document.getElementById('asg-label');
  if (asgLabel) {
    asgLabel.textContent = `Auto Scaling Group (min: 1 / desired: ${state.instanceCount} / max: ${Math.max(state.instanceCount, 2)})`;
  }
}

function updateEC2Cluster() {
  const cluster = document.getElementById('ec2-cluster');
  if (!cluster) return;

  // Remove extras
  while (cluster.children.length > state.instanceCount) {
    cluster.removeChild(cluster.lastChild);
  }

  // Add new ones
  while (cluster.children.length < state.instanceCount) {
    const idx = cluster.children.length;
    const node = document.createElement('div');
    node.className = 'topo-node topo-ec2 node-new';
    node.id = `node-ec2-${idx}`;
    node.dataset.index = idx;
    node.innerHTML = `
      <div class="node-icon">🖥</div>
      <div class="node-label">EC2 Instance ${idx + 1}</div>
      <div class="cpu-bar"><div class="cpu-fill" id="cpu-fill-${idx}"></div></div>
      <div class="node-badge badge-green">Running</div>`;
    node.addEventListener('click', () => showCrashOption(node));
    cluster.appendChild(node);
  }

  document.getElementById('metric-instances').textContent = state.instanceCount;
}

function updateRDSStandby() {
  const standby = document.getElementById('node-rds-standby');
  const label   = document.getElementById('rds-az-label');
  if (!standby) return;
  if (state.multiAz) {
    standby.style.display = 'flex';
    standby.classList.add('node-new');
    if (label) label.textContent = 'AZ-1a (Primary)';
  } else {
    standby.style.display = 'none';
    if (label) label.textContent = 'AZ-1a';
  }
}

// ========================
// VIZ TABS
// ========================
document.querySelectorAll('.viz-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.viz-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.viz-view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`viz-${tab.dataset.viz}`).classList.add('active');
  });
});

// ========================
// ENVIRONMENT SELECTOR
// ========================
document.getElementById('env-select').addEventListener('change', (e) => {
  state.env = e.target.value;
  if (state.env === 'prod') {
    state.multiAz = true;
    state.instanceCount = 2;
    state.costOptimized = false;
    termLog('warn', '⚠ Switched to PROD — Multi-AZ enabled, NAT Gateway enabled. Cost will exceed Free Tier.');
  } else {
    state.multiAz = false;
    state.instanceCount = 1;
    state.costOptimized = true;
    termLog('success', '✓ Switched to DEV — Free Tier mode active. Estimated cost: $0.00/mo');
  }
  updateEC2Cluster();
  updateRDSStandby();
  renderCostBreakdown();
  updateCostBadge();
});

// ========================
// TERMINAL HELPERS
// ========================
function termLog(type, msg) {
  const el = document.createElement('div');
  el.className = `term-line term-${type}`;
  el.textContent = msg;
  $terminal.appendChild(el);
  $terminal.scrollTop = $terminal.scrollHeight;
}

function termClear() { $terminal.innerHTML = ''; }

function setStatus(text, color) {
  $statusText.textContent = text;
  $statusDot.style.background = color;
  $statusDot.style.boxShadow = `0 0 8px ${color}`;
}

// ========================
// PLAN SIMULATION
// ========================
function runPlan() {
  termClear();
  setStatus('Planning...', '#f59e0b');
  termLog('cmd', '$ terraform plan -var-file="terraform.tfvars"');

  const lines = [
    ['info', 'Initializing the backend...'],
    ['info', 'Initializing provider plugins...'],
    ['info', '- Finding hashicorp/aws versions matching "~> 5.0"...'],
    ['info', '- Installing hashicorp/aws v5.82.2...'],
    ['info', ''],
    ['info', 'Terraform will perform the following actions:'],
    ['info', ''],
    ['add',  '  # module.vpc.aws_vpc.main will be created'],
    ['add',  '  + resource "aws_vpc" "main" {'],
    ['add',  '      + cidr_block = "10.0.0.0/16"'],
    ['add',  '    }'],
    ['add',  '  # module.vpc.aws_subnet.public[0] will be created'],
    ['add',  '  # module.vpc.aws_subnet.public[1] will be created'],
    ['add',  '  # module.vpc.aws_subnet.private_app[0] will be created'],
    ['add',  '  # module.vpc.aws_subnet.private_app[1] will be created'],
    ['add',  '  # module.vpc.aws_subnet.private_db[0] will be created'],
    ['add',  '  # module.vpc.aws_subnet.private_db[1] will be created'],
    ['add',  '  # module.security_groups.aws_security_group.alb will be created'],
    ['add',  '  # module.security_groups.aws_security_group.ec2_app will be created'],
    ['add',  '  # module.security_groups.aws_security_group.rds will be created'],
    ['add',  '  # module.compute.aws_lb.main will be created'],
    ['add',  '  # module.compute.aws_autoscaling_group.app will be created'],
    ['add',  `  # module.compute.aws_launch_template.app (instance_type="${state.instanceType}")`],
    ['add',  '  # module.rds.aws_db_instance.main will be created'],
    ['add',  '  # module.frontend.aws_s3_bucket.frontend will be created'],
    ['add',  '  # module.frontend.aws_cloudfront_distribution.main will be created'],
    ['add',  '  # module.monitoring.aws_cloudwatch_dashboard.main will be created'],
    ['add',  '  # module.monitoring.aws_cloudwatch_metric_alarm.billing_alert will be created'],
    ['info', ''],
    ['success', `Plan: ${state.multiAz ? 22 : 20} to add, 0 to change, 0 to destroy.`],
    ['info', ''],
    ['success', '✓ No cost violations detected. Estimated monthly cost: $0.00 (Free Tier)'],
  ];

  lines.forEach(([type, msg], i) => {
    setTimeout(() => {
      termLog(type, msg);
      if (i === lines.length - 1) setStatus('Plan complete', '#22c55e');
    }, i * 60);
  });
}

// ========================
// APPLY SIMULATION
// ========================
function runApply() {
  termClear();
  setStatus('Applying...', '#4f9cf9');
  termLog('cmd', '$ terraform apply -var-file="terraform.tfvars" -auto-approve');

  const resources = [
    'module.vpc.aws_internet_gateway.main',
    'module.vpc.aws_subnet.public[0]',
    'module.vpc.aws_subnet.public[1]',
    'module.vpc.aws_subnet.private_app[0]',
    'module.vpc.aws_subnet.private_app[1]',
    'module.vpc.aws_subnet.private_db[0]',
    'module.vpc.aws_subnet.private_db[1]',
    'module.vpc.aws_route_table.public',
    'module.security_groups.aws_security_group.alb',
    'module.security_groups.aws_security_group.ec2_app',
    'module.security_groups.aws_security_group.rds',
    'module.rds.aws_db_subnet_group.main',
    'module.frontend.aws_s3_bucket.frontend',
    'module.compute.aws_lb.main',
    'module.compute.aws_lb_target_group.app',
    'module.compute.aws_launch_template.app',
    'module.compute.aws_autoscaling_group.app',
    'module.rds.aws_db_instance.main',
    'module.frontend.aws_cloudfront_distribution.main',
    'module.monitoring.aws_cloudwatch_dashboard.main',
  ];

  resources.forEach((r, i) => {
    setTimeout(() => {
      termLog('add', `  Creating ${r}... done`);
    }, i * 140);
  });

  setTimeout(() => {
    const total = resources.length;
    termLog('info', '');
    termLog('success', `Apply complete! Resources: ${total} added, 0 changed, 0 destroyed.`);
    termLog('info', '');
    termLog('info', 'Outputs:');
    termLog('success', '  application_url = "https://d1234abc.cloudfront.net"');
    termLog('success', '  alb_dns_name    = "iac-multitier-dev-alb-123456.us-east-1.elb.amazonaws.com"');
    setStatus('Applied ✓', '#22c55e');

    // Start uptime
    state.appliedAt = Date.now();
    if (state.uptimeTimer) clearInterval(state.uptimeTimer);
    state.uptimeTimer = setInterval(() => {
      const s = Math.floor((Date.now() - state.appliedAt) / 1000);
      const h = String(Math.floor(s / 3600)).padStart(2, '0');
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const sec = String(s % 60).padStart(2, '0');
      const el = document.getElementById('metric-uptime');
      if (el) el.textContent = `${h}:${m}:${sec}`;
    }, 1000);

  }, resources.length * 140 + 400);
}

// ========================
// DESTROY SIMULATION
// ========================
function runDestroy() {
  termClear();
  setStatus('Destroying...', '#ef4444');
  termLog('cmd', '$ terraform destroy -var-file="terraform.tfvars" -auto-approve');
  termLog('warn', '⚠ Destroying all provisioned resources...');
  termLog('destroy', '  Destroying module.frontend.aws_cloudfront_distribution.main... done');
  termLog('destroy', '  Destroying module.rds.aws_db_instance.main... done');
  setTimeout(() => {
    termLog('destroy', '  Destroying module.compute.aws_autoscaling_group.app... done');
    termLog('destroy', '  Destroying module.compute.aws_lb.main... done');
    termLog('destroy', '  Destroying module.security_groups... done');
    termLog('destroy', '  Destroying module.vpc... done');
    termLog('info', '');
    termLog('success', 'Destroy complete! Resources: 0 total. $0.00 billed going forward.');
    setStatus('Destroyed', '#6b7a99');
    if (state.uptimeTimer) clearInterval(state.uptimeTimer);
  }, 1200);
}

// ========================
// CHAOS — AZ OUTAGE
// ========================
function simulateAZOutage() {
  const overlay = document.getElementById('az-outage');
  const primary = document.getElementById('node-rds-primary');
  const ec2_0   = document.getElementById('node-ec2-0');

  termClear();
  setStatus('⚡ AZ Outage!', '#ef4444');
  termLog('error', '⚡ CHAOS: Simulating AZ-1a outage...');
  termLog('warn',  '  EC2 instances in AZ-1a becoming unreachable...');

  if (ec2_0) { ec2_0.classList.add('node-crashed'); ec2_0.querySelector('.node-badge').textContent = 'Unreachable'; ec2_0.querySelector('.node-badge').className = 'node-badge badge-red'; }

  setTimeout(() => {
    overlay.style.display = 'flex';
    termLog('warn',  '  ALB health checks failing for AZ-1a targets...');
    termLog('info',  '  ALB re-routing 100% of traffic to AZ-1b... done');
    termLog('warn',  '  RDS detecting primary loss in AZ-1a...');
  }, 800);

  setTimeout(() => {
    if (primary) {
      primary.querySelector('.node-badge').textContent = 'Failing Over';
      primary.querySelector('.node-badge').className = 'node-badge badge-amber';
    }
    termLog('info',  '  RDS: Promoting standby replica in AZ-1b to Primary...');
  }, 1800);

  setTimeout(() => {
    if (primary) {
      primary.querySelector('.node-label').textContent = 'RDS MySQL (AZ-1b)';
      primary.querySelector('.node-badge').textContent = 'Available';
      primary.querySelector('.node-badge').className = 'node-badge badge-green';
    }
    termLog('success', '  ✓ RDS failover complete. New primary: AZ-1b (63 seconds)');
    termLog('success', '  ✓ ALB routing stable. Zero requests lost (Multi-AZ architecture).');
    setStatus('Recovered', '#22c55e');
  }, 3200);
}

// ========================
// CHAOS — CRASH EC2
// ========================
function showCrashOption(node) {
  if (node.classList.contains('node-crashed')) return;
  crashEC2Node(node);
}

function crashEC2Node(node) {
  const idx = node.dataset.index;
  termClear();
  setStatus('💥 Instance Crashed', '#ef4444');
  termLog('error', `💥 CHAOS: EC2 Instance ${parseInt(idx)+1} hardware failure detected!`);
  node.classList.add('node-crashed');
  node.querySelector('.node-badge').textContent = 'Failed';
  node.querySelector('.node-badge').className = 'node-badge badge-red';

  setTimeout(() => {
    termLog('warn', '  ASG health check: instance is unhealthy...');
    termLog('info', '  ASG terminating failed instance...');
    node.classList.add('node-healing');
  }, 1000);

  setTimeout(() => {
    termLog('info', '  ASG launching replacement instance...');
    node.querySelector('.node-icon').textContent = '⏳';
    node.querySelector('.node-label').textContent = `EC2 Instance ${parseInt(idx)+1}`;
  }, 2200);

  setTimeout(() => {
    node.className = 'topo-node topo-ec2 node-new';
    node.querySelector('.node-icon').textContent = '🖥';
    node.querySelector('.node-badge').textContent = 'Running';
    node.querySelector('.node-badge').className = 'node-badge badge-green';
    termLog('success', '  ✓ Replacement instance healthy and registered to target group!');
    termLog('success', '  ✓ Self-healing complete. Zero user impact.');
    setStatus('Healed ✓', '#22c55e');
  }, 3800);
}

// ========================
// TRAFFIC SIMULATION
// ========================
function simulateTraffic() {
  if (state.trafficRunning) {
    state.trafficRunning = false;
    termLog('info', '  Traffic simulation stopped.');
    return;
  }
  state.trafficRunning = true;
  termLog('cmd', '$ curl -s "https://d1234abc.cloudfront.net/api/health"');
  termLog('info', '  Sending simulated traffic through all 3 tiers...');

  let reqCount = 0;
  const timer = setInterval(() => {
    if (!state.trafficRunning) { clearInterval(timer); return; }
    spawnParticles();
    reqCount++;

    // Animate CPU bars
    for (let i = 0; i < state.instanceCount; i++) {
      const fill = document.getElementById(`cpu-fill-${i}`);
      if (fill) {
        const cpu = 20 + Math.random() * 50;
        fill.style.width = cpu + '%';
        fill.style.background = cpu > 70 ? 'var(--accent-red)' : cpu > 40 ? 'var(--accent-amber)' : 'var(--accent-green)';
      }
    }

    // Update metrics
    const cpuEl = document.getElementById('metric-cpu');
    const reqEl = document.getElementById('metric-req');
    const latEl = document.getElementById('metric-latency');
    const dbEl  = document.getElementById('metric-db');
    if (cpuEl) { const v = 30 + Math.random()*40; cpuEl.textContent = v.toFixed(1) + '%'; const mb = document.getElementById('mbar-cpu'); if(mb) mb.style.width = v + '%'; }
    if (reqEl) reqEl.textContent = (20 + reqCount * 3 + Math.round(Math.random()*10)).toString();
    if (latEl) latEl.textContent = (45 + Math.round(Math.random()*30)).toString();
    if (dbEl)  dbEl.textContent  = (3  + Math.round(Math.random()*5)).toString();

  }, 600);

  setTimeout(() => {
    state.trafficRunning = false;
    clearInterval(timer);
    termLog('success', `  ✓ Load test complete. ${reqCount * 3} requests processed across ${state.instanceCount} instance(s).`);
  }, 8000);
}

function spawnParticles() {
  const container = document.getElementById('particles-container');
  if (!container) return;
  for (let i = 0; i < 3; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = (30 + Math.random() * 40) + '%';
    p.style.top  = (10 + Math.random() * 60) + '%';
    p.style.background = ['var(--accent-cyan)', 'var(--accent-green)', 'var(--accent-blue)'][i % 3];
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    container.appendChild(p);
    setTimeout(() => p.remove(), 1500);
  }
}

// ========================
// RESET CHAOS
// ========================
function resetChaos() {
  state.trafficRunning = false;
  document.getElementById('az-outage').style.display = 'none';

  document.querySelectorAll('.topo-ec2').forEach(n => {
    n.classList.remove('node-crashed', 'node-healing');
    n.querySelector('.node-icon').textContent = '🖥';
    n.querySelector('.node-badge').textContent = 'Running';
    n.querySelector('.node-badge').className = 'node-badge badge-green';
  });

  const primary = document.getElementById('node-rds-primary');
  if (primary) {
    primary.querySelector('.node-label').textContent = 'RDS MySQL (Primary)';
    primary.querySelector('.node-badge').textContent = 'Available';
    primary.querySelector('.node-badge').className = 'node-badge badge-green';
  }

  // Reset CPU bars
  document.querySelectorAll('.cpu-fill').forEach(f => { f.style.width = '0%'; });
  ['metric-cpu','metric-req','metric-latency','metric-db'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '--';
  });

  setStatus('Ready', '#22c55e');
  termLog('info', '↺ Chaos environment reset to initial state.');
}

// ========================
// SECURITY AUDIT
// ========================
function renderSecurityRules() {
  const all = [...SEC_RULES, ...SEC_RULES_WARN];
  const container = document.getElementById('sec-rules');
  if (!container) return;
  container.innerHTML = all.map(r => `
    <div class="sec-rule ${r.level}">
      <span class="sec-rule-icon">${r.icon}</span>
      <span class="sec-rule-text">${r.text}</span>
    </div>`).join('');

  const score = SEC_RULES.reduce((a, r) => a + r.points, 0);
  document.getElementById('sec-score-num').textContent = score;
  const grade = score >= 95 ? 'A+' : score >= 85 ? 'A' : score >= 75 ? 'B' : 'C';
  document.getElementById('sec-score-big').textContent = grade;
  document.getElementById('sec-score').textContent = grade;
}

function runAudit() {
  termLog('cmd', '$ tfsec . && checkov -d . --framework terraform');
  termLog('info', '  Scanning Terraform files for security issues...');
  setTimeout(() => {
    SEC_RULES.forEach((r, i) => setTimeout(() => termLog('success', `  ✓ ${r.text}`), i * 120));
    setTimeout(() => {
      SEC_RULES_WARN.forEach(r => termLog('warn', `  ⚠ ${r.text}`));
      termLog('success', `  Security Score: ${SEC_RULES.reduce((a,r) => a+r.points, 0)}/100 — Grade A+`);
    }, SEC_RULES.length * 120 + 100);
  }, 400);
  // Switch to security tab
  document.querySelector('[data-viz="security"]').click();
}

// ========================
// COST BREAKDOWN
// ========================
function renderCostBreakdown() {
  const config = {
    multiAz: state.multiAz,
    instanceCount: state.instanceCount,
    costOptimized: state.costOptimized,
    instanceType: state.instanceType,
  };
  const rows = getCostRows(state.env, config);
  const container = document.getElementById('cost-breakdown');
  if (!container) return;

  container.innerHTML = rows.map(r => `
    <div class="cost-row">
      <div class="cost-row-label">
        <span class="cost-row-icon">${r.icon}</span>
        <span>${r.label}</span>
        <small style="color:var(--text-muted); font-size:10px">${r.note}</small>
      </div>
      <span class="cost-row-amount ${r.free ? 'cost-free' : 'cost-paid'}">${r.amount}</span>
    </div>`).join('');

  const total = rows.reduce((sum, r) => {
    const n = parseFloat(r.amount.replace('$',''));
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  document.getElementById('cost-total-big').textContent = total.toFixed(2);
  const badge = document.getElementById('cost-tier-badge');
  if (badge) {
    badge.textContent = total === 0 ? '✅ 100% AWS Free Tier' : `⚠ Exceeds Free Tier (~$${total.toFixed(2)}/mo)`;
    badge.style.color = total === 0 ? 'var(--accent-green)' : 'var(--accent-amber)';
    badge.style.borderColor = total === 0 ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)';
    badge.style.background  = total === 0 ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)';
  }
}

function updateCostBadge() {
  const config = { multiAz: state.multiAz, instanceCount: state.instanceCount, costOptimized: state.costOptimized, instanceType: state.instanceType };
  const rows = getCostRows(state.env, config);
  const total = rows.reduce((sum, r) => { const n = parseFloat(r.amount.replace('$','')); return sum + (isNaN(n) ? 0 : n); }, 0);
  const el = document.getElementById('cost-value');
  if (el) el.textContent = '$' + total.toFixed(2);
  el.style.color = total === 0 ? 'var(--accent-green)' : 'var(--accent-amber)';
}

// ========================
// METRICS TICKER
// ========================
function startMetricsTicker() {
  state.metricsTimer = setInterval(() => {
    if (!state.trafficRunning) return;
  }, 3000);
}

// ========================
// REPORT EXPORT
// ========================
function generateReport() {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const config = { multiAz: state.multiAz, instanceCount: state.instanceCount, costOptimized: state.costOptimized, instanceType: state.instanceType };
  const rows = getCostRows(state.env, config);
  const totalCost = rows.reduce((s, r) => { const n = parseFloat(r.amount.replace('$','')); return s + (isNaN(n)?0:n); }, 0);

  return `IaC Studio — Project Review Summary
Generated: ${now}
===================================================

PROJECT: Infrastructure as Code for Multi-Tier Cloud Applications
TEAM   : Joydeep Mandal (26MCA0062), Deepak B (26MCA0068), Vikash Kumar (26MCA0098)
GUIDE  : Dr. Sathiyamoorthy E | Dept. of Cloud Computing, VIT

CLOUD PROVIDER    : Amazon Web Services (AWS)
IaC TOOL          : Terraform v1.16.2
REGION            : us-east-1 (N. Virginia)
ENVIRONMENT       : ${state.env.toUpperCase()}

---------------------------------------------------
ARCHITECTURE — RESOURCE INVENTORY
---------------------------------------------------
TIER               AWS SERVICE                    ROLE
Presentation       Amazon S3 + CloudFront CDN     Static UI hosting & edge caching
Application        EC2 ${state.instanceType} × ${state.instanceCount}  Auto Scaling Group (${state.instanceCount} instance${state.instanceCount>1?'s':''})
Application        Application Load Balancer      Traffic distribution & health checks
Data               Amazon RDS MySQL 8.0           Managed relational database
                   db.t3.micro | 20 GB gp2        ${state.multiAz ? 'Multi-AZ (HA Failover)' : 'Single-AZ (Free Tier)'}
Networking         Amazon VPC 10.0.0.0/16         Network isolation
                   6× Subnets (2 AZs)             Public + Private App + Private DB
                   Internet Gateway               Public internet routing
Security           3× Security Groups (chained)   ALB→EC2→RDS isolation
Monitoring         Amazon CloudWatch              4-widget dashboard + CPU alarms
                   SNS Topic + Billing Alert      $1 threshold protection

---------------------------------------------------
COST ESTIMATE
---------------------------------------------------
${rows.map(r => `${(r.icon + ' ' + r.label).padEnd(40)} ${r.amount.padStart(8)}  (${r.note})`).join('\n')}
${'─'.repeat(60)}
TOTAL ESTIMATED MONTHLY COST:               $${totalCost.toFixed(2)}
${totalCost === 0 ? '✅ 100% within AWS 12-Month Free Tier' : '⚠ Exceeds Free Tier limits'}

---------------------------------------------------
SECURITY AUDIT RESULTS  |  Score: ${SEC_RULES.reduce((a,r)=>a+r.points,0)}/100  |  Grade: A+
---------------------------------------------------
${SEC_RULES.map(r => '✅ ' + r.text).join('\n')}
${SEC_RULES_WARN.map(r => '⚠  ' + r.text).join('\n')}

---------------------------------------------------
DEPLOYMENT WORKFLOW
---------------------------------------------------
1. terraform init     — Initialize backend & download providers
2. terraform plan     — Preview execution plan (${state.multiAz ? 22 : 20} resources)
3. terraform apply    — Provision entire stack (~5 minutes)
4. [DEMO]             — Live URL accessible via CloudFront HTTPS
5. terraform destroy  — Clean teardown. $0 residual cost.

---------------------------------------------------
KEY OUTCOMES
---------------------------------------------------
• Fully reproducible 3-tier infrastructure deployed with a single command
• Identical environment recreated after destroy + re-apply (repeatability)
• Strict network isolation: Internet → ALB → EC2 → RDS (no direct DB access)
• CloudWatch dashboard live with CPU, ALB, and RDS metrics
• Zero cost incurred under AWS Free Tier

===================================================`;
}

function showReport() {
  const report = generateReport();
  document.getElementById('modal-body').textContent = report;
  document.getElementById('modal-overlay').style.display = 'flex';
}

document.getElementById('modal-close').addEventListener('click',  () => { document.getElementById('modal-overlay').style.display = 'none'; });
document.getElementById('modal-close2').addEventListener('click', () => { document.getElementById('modal-overlay').style.display = 'none'; });
document.getElementById('btn-copy-report').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('modal-body').textContent).then(() => {
    document.getElementById('btn-copy-report').textContent = '✅ Copied!';
    setTimeout(() => { document.getElementById('btn-copy-report').textContent = '📋 Copy to Clipboard'; }, 2000);
  });
});

// ========================
// BIND ACTION EVENTS
// ========================
function bindEvents() {
  document.getElementById('btn-plan').addEventListener('click', runPlan);
  document.getElementById('btn-apply').addEventListener('click', runApply);
  document.getElementById('btn-destroy').addEventListener('click', runDestroy);
  document.getElementById('btn-chaos').addEventListener('click', simulateAZOutage);
  document.getElementById('btn-audit').addEventListener('click', runAudit);
  document.getElementById('btn-clear-terminal').addEventListener('click', termClear);
  document.getElementById('btn-report').addEventListener('click', showReport);

  // Topology node click to crash
  document.querySelectorAll('.topo-ec2').forEach(n => n.addEventListener('click', () => showCrashOption(n)));

  // Chaos controls
  document.getElementById('btn-az-outage').addEventListener('click', simulateAZOutage);
  document.getElementById('btn-crash-ec2').addEventListener('click', () => {
    const nodes = document.querySelectorAll('.topo-ec2');
    if (nodes.length > 0) crashEC2Node(nodes[0]);
  });
  document.getElementById('btn-traffic').addEventListener('click', simulateTraffic);
  document.getElementById('btn-reset-chaos').addEventListener('click', resetChaos);
}
