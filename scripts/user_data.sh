#!/bin/bash
set -e

# ============================================================
# EC2 User Data Bootstrap Script
# Auto-runs on every new EC2 instance launched by the ASG
# ============================================================

# Install Node.js & git
yum install -y git
if ! command -v node &> /dev/null; then
  curl -fsSL https://nodejs.org/dist/v16.20.2/node-v16.20.2-linux-x64.tar.gz | tar -xz -C /usr/local --strip-components=1 || true
fi
ln -sf /usr/local/bin/node /usr/bin/node || true
ln -sf /usr/local/bin/npm /usr/bin/npm || true

# Install MySQL client (for connectivity testing)
yum install -y mysql || true

# Create application directory
mkdir -p /opt/app
cd /opt/app

# Write backend application inline
cat > /opt/app/package.json << 'PKGJSON'
{
  "name": "iac-multitier-backend",
  "version": "1.0.0",
  "description": "3-Tier IaC Demo Backend API",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.0",
    "cors": "^2.8.5"
  }
}
PKGJSON

cat > /opt/app/server.js << 'APPJS'
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json());

const DB_CONFIG = {
  host:     process.env.DB_ENDPOINT,
  user:     process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     3306,
  waitForConnections: true,
  connectionLimit: 10
};

let pool;

async function getPool() {
  if (!pool) pool = mysql.createPool(DB_CONFIG);
  return pool;
}

// Health check endpoint - proves Presentation → Application tier
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    tier: 'Application',
    instanceId: os.hostname(),
    privateIp: Object.values(os.networkInterfaces())
      .flat()
      .find(i => i.family === 'IPv4' && !i.internal)?.address || 'unknown',
    region: process.env.AWS_REGION || 'us-east-1',
    timestamp: new Date().toISOString()
  });
});

// Database endpoint - proves Application → Data tier
app.get('/api/data', async (req, res) => {
  try {
    const db = await getPool();
    await db.execute(`CREATE TABLE IF NOT EXISTS visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      instance_id VARCHAR(64),
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.execute('INSERT INTO visits (instance_id) VALUES (?)', [os.hostname()]);
    const [rows] = await db.execute('SELECT * FROM visits ORDER BY visited_at DESC LIMIT 10');
    res.json({ success: true, records: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(process.env.APP_PORT || 3000, () => {
  console.log(`[IaC Demo] Backend running on port $${process.env.APP_PORT || 3000}`);
});
APPJS

# Set environment variables
cat > /opt/app/.env << ENVFILE
DB_ENDPOINT=${db_endpoint}
DB_NAME=${db_name}
DB_USERNAME=${db_username}
DB_PASSWORD=${db_password}
APP_PORT=${app_port}
AWS_REGION=us-east-1
ENVFILE

# Install dependencies
cd /opt/app && npm install

# Create systemd service for auto-start
cat > /etc/systemd/system/iac-app.service << 'SERVICE'
[Unit]
Description=IaC Multi-Tier Demo Backend
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/app
EnvironmentFile=/opt/app/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

# Enable and start service
systemctl daemon-reload
systemctl enable iac-app
systemctl start iac-app

echo "Bootstrap complete! App running on port ${app_port}"
