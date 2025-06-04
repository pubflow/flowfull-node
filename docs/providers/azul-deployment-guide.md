# 🇩🇴 Azul Payment Gateway - Deployment & Configuration Guide

Complete guide for deploying and configuring Azul payment gateway in production environments.

## 🚀 Pre-Deployment Checklist

### 1. Azul Account Setup
- [ ] **Merchant Account** - Active Azul merchant account
- [ ] **Credentials** - Production MerchantId, Auth1, Auth2
- [ ] **Store Configuration** - Store ID and channel setup
- [ ] **SSL Certificate** - Valid SSL certificate for your domain
- [ ] **Webhook URL** - Configured webhook endpoint
- [ ] **IP Whitelisting** - Server IPs whitelisted with Azul

### 2. Technical Requirements
- [ ] **HTTPS Only** - All communications must use HTTPS
- [ ] **TLS 1.2+** - Minimum TLS version requirement
- [ ] **PCI Compliance** - PCI DSS compliance certification
- [ ] **Server Security** - Secure server configuration
- [ ] **Database Encryption** - Encrypted storage for sensitive data

### 3. Integration Testing
- [ ] **Sandbox Testing** - Complete testing in sandbox environment
- [ ] **Error Scenarios** - All error conditions tested
- [ ] **3D Secure** - 3DS authentication flow tested
- [ ] **Webhooks** - Webhook delivery and processing tested
- [ ] **Load Testing** - Performance under expected load

## 🔧 Environment Configuration

### Production Environment Variables
```env
# Azul Production Configuration
AZUL_MERCHANT_ID=your_production_merchant_id
AZUL_AUTH1=your_production_auth1
AZUL_AUTH2=your_production_auth2
AZUL_ENVIRONMENT=production
AZUL_STORE_ID=38
AZUL_CHANNEL=EC

# Security Settings
AZUL_WEBHOOK_SECRET=your_webhook_secret
AZUL_CERTIFICATE_PATH=/etc/ssl/certs/azul.pem
AZUL_TIMEOUT=30000
AZUL_RETRY_ATTEMPTS=3

# Enable Azul Provider
ENABLED_PROVIDERS=stripe,paypal,authorize_net,azul
DEFAULT_PAYMENT_PROVIDER=azul

# Dominican Republic Specific
AZUL_DEFAULT_CURRENCY=DOP
AZUL_SUPPORTED_CURRENCIES=DOP,USD
AZUL_TAX_RATE=0.18  # ITBIS (18%)
AZUL_LOCALE=es-DO
```

### Staging Environment
```env
# Azul Staging Configuration
AZUL_MERCHANT_ID=your_staging_merchant_id
AZUL_AUTH1=your_staging_auth1
AZUL_AUTH2=your_staging_auth2
AZUL_ENVIRONMENT=sandbox
AZUL_STORE_ID=38
AZUL_CHANNEL=EC

# Staging-specific settings
AZUL_DEBUG_MODE=true
AZUL_LOG_REQUESTS=true
AZUL_MOCK_3DS=false
```

## 🏗️ Infrastructure Setup

### Load Balancer Configuration
```nginx
# Nginx configuration for Azul payments
upstream bridge_payments {
    server app1.example.com:3000;
    server app2.example.com:3000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name payments.example.com;
    
    # SSL Configuration
    ssl_certificate /etc/ssl/certs/payments.example.com.crt;
    ssl_certificate_key /etc/ssl/private/payments.example.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    
    # Azul webhook endpoint
    location /webhooks/azul {
        proxy_pass http://bridge_payments;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Webhook-specific settings
        proxy_read_timeout 30s;
        proxy_connect_timeout 10s;
        client_max_body_size 1M;
    }
    
    # Payment endpoints
    location /bridge-payment/ {
        proxy_pass http://bridge_payments;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Payment-specific settings
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        client_max_body_size 2M;
    }
}
```

### Database Configuration

**✅ No se requieren nuevas tablas para Azul**

Tu esquema existente ya soporta completamente Azul usando la columna `metadata` JSON para datos específicos del proveedor:

```sql
-- Azul utiliza las tablas existentes con metadata JSON

-- 1. Payments table - almacena transacciones Azul
-- metadata contiene: azul_order_id, authorization_code, rrn, response_code, etc.

-- 2. Payment_methods table - almacena tokens DataVault de Azul
-- metadata contiene: azul_token, brand, expiration, etc.

-- 3. Payment_webhooks table - maneja webhooks de Azul
-- payload contiene: notification_id, event_type, azul_order_id, etc.

-- 4. Provider_customers table - clientes Azul (usuarios y guests)
-- metadata contiene: azul_customer_data, preferences, etc.
```

#### Ejemplos de uso del metadata para Azul:

**Payments metadata:**
```json
{
  "azul_order_id": "987654321",
  "authorization_code": "123456",
  "rrn": "123456789012",
  "response_code": "00",
  "lot_number": "001",
  "ticket": "1234",
  "iso_code": "00",
  "merchant_id": "123456",
  "channel": "EC",
  "store": "38",
  "pos_input_mode": "E-Commerce",
  "transaction_type": "Sale",
  "currency_pos_code": "214",
  "itbis": "537.82",
  "three_ds_data": {
    "authentication_status": "Y",
    "eci": "05",
    "cavv": "base64_cavv_value"
  }
}
```

**Payment_methods metadata (DataVault):**
```json
{
  "azul_token": "token_from_datavault",
  "azul_brand": "VISA",
  "azul_expiration": "1225",
  "token_created_at": "2024-12-02T13:16:26Z",
  "validation_status": "validated",
  "customer_type": "individual"
}
```

**Provider_customers metadata:**
```json
{
  "azul_customer_data": {
    "preferred_currency": "DOP",
    "tax_id": "12345678901",
    "preferred_language": "es-DO",
    "billing_preferences": {
      "auto_pay": true,
      "invoice_delivery": "email"
    }
  },
  "risk_profile": {
    "score": 85,
    "last_updated": "2024-12-02T13:16:26Z"
  }
}
```

## 🔒 Security Configuration

### Firewall Rules
```bash
# Allow HTTPS traffic
sudo ufw allow 443/tcp

# Allow Azul webhook IPs (example IPs - verify with Azul)
sudo ufw allow from 200.88.100.0/24 to any port 443
sudo ufw allow from 200.88.101.0/24 to any port 443

# Deny all other traffic to webhook endpoint
sudo ufw deny 443/tcp
```

### SSL Certificate Setup
```bash
# Install SSL certificate for Azul communications
sudo mkdir -p /etc/ssl/azul
sudo cp azul-production.crt /etc/ssl/azul/
sudo cp azul-production.key /etc/ssl/azul/
sudo chmod 600 /etc/ssl/azul/azul-production.key
sudo chown root:root /etc/ssl/azul/*
```

### Environment Security
```bash
# Secure environment variables
sudo chmod 600 /etc/environment
sudo chown root:root /etc/environment

# Use secrets management
export AZUL_AUTH1=$(aws secretsmanager get-secret-value --secret-id azul-auth1 --query SecretString --output text)
export AZUL_AUTH2=$(aws secretsmanager get-secret-value --secret-id azul-auth2 --query SecretString --output text)
```

## 📊 Monitoring & Logging

### Application Monitoring
```javascript
// Azul-specific metrics
const azulMetrics = {
  transactions_total: new Counter({
    name: 'azul_transactions_total',
    help: 'Total Azul transactions',
    labelNames: ['status', 'currency']
  }),
  
  transaction_duration: new Histogram({
    name: 'azul_transaction_duration_seconds',
    help: 'Azul transaction duration',
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  }),
  
  webhook_events: new Counter({
    name: 'azul_webhook_events_total',
    help: 'Total Azul webhook events',
    labelNames: ['event_type', 'status']
  })
};

// Track transaction metrics
azulMetrics.transactions_total.inc({ 
  status: transaction.status, 
  currency: transaction.currency 
});

azulMetrics.transaction_duration.observe(
  (Date.now() - startTime) / 1000
);
```

### Log Configuration
```json
{
  "logging": {
    "level": "info",
    "format": "json",
    "azul": {
      "log_requests": false,
      "log_responses": false,
      "log_sensitive_data": false,
      "mask_card_numbers": true,
      "mask_auth_keys": true
    }
  }
}
```

### Health Checks
```javascript
// Azul health check endpoint
app.get('/health/azul', async (req, res) => {
  try {
    const azulAdapter = getPaymentAdapter('azul');
    const healthCheck = await azulAdapter.healthCheck();
    
    if (healthCheck.success) {
      res.status(200).json({
        status: 'healthy',
        provider: 'azul',
        latency: healthCheck.latency,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        provider: 'azul',
        error: healthCheck.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      provider: 'azul',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

## 🔄 Backup & Recovery

### Database Backup
```bash
#!/bin/bash
# Azul data backup script

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/azul"
DB_NAME="bridge_payments"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup tables with Azul data (using existing schema)
mysqldump $DB_NAME payments payment_methods provider_customers payment_webhooks \
  --where="provider_id='azul'" > $BACKUP_DIR/azul_backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/azul_backup_$DATE.sql

# Remove backups older than 30 days
find $BACKUP_DIR -name "azul_backup_*.sql.gz" -mtime +30 -delete

echo "Azul backup completed: azul_backup_$DATE.sql.gz"
```

### Configuration Backup
```bash
#!/bin/bash
# Backup Azul configuration

CONFIG_BACKUP_DIR="/backups/config"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup environment configuration
cp /etc/environment $CONFIG_BACKUP_DIR/azul_env_$DATE
cp /etc/ssl/azul/* $CONFIG_BACKUP_DIR/azul_certs_$DATE/

# Backup application configuration
tar -czf $CONFIG_BACKUP_DIR/azul_config_$DATE.tar.gz \
  /app/config/azul.json \
  /app/config/providers.json
```

## 🚨 Incident Response

### Common Issues & Solutions

#### 1. Transaction Timeouts
```bash
# Check Azul API connectivity
curl -X POST https://pagos.azul.com.do/WebServices/JSON/default.aspx \
  -H "Content-Type: application/json" \
  -d '{"MerchantId":"test"}' \
  --max-time 30

# Monitor response times
tail -f /var/log/bridge-payments/azul.log | grep "response_time"
```

#### 2. Webhook Delivery Failures
```javascript
// Webhook retry mechanism
const retryWebhook = async (webhookData, attempt = 1) => {
  const maxAttempts = 5;
  const backoffMs = Math.pow(2, attempt) * 1000;
  
  try {
    await processWebhook(webhookData);
  } catch (error) {
    if (attempt < maxAttempts) {
      setTimeout(() => retryWebhook(webhookData, attempt + 1), backoffMs);
    } else {
      // Send to dead letter queue
      await sendToDeadLetterQueue(webhookData, error);
    }
  }
};
```

#### 3. Authentication Failures
```bash
# Verify credentials
echo "Checking Azul credentials..."
if [ -z "$AZUL_MERCHANT_ID" ]; then
  echo "ERROR: AZUL_MERCHANT_ID not set"
fi

if [ -z "$AZUL_AUTH1" ]; then
  echo "ERROR: AZUL_AUTH1 not set"
fi

if [ -z "$AZUL_AUTH2" ]; then
  echo "ERROR: AZUL_AUTH2 not set"
fi
```

## 📈 Performance Optimization

### Connection Pooling
```javascript
// HTTP connection pooling for Azul API
const https = require('https');

const azulAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000
});

// Use agent for Azul requests
const azulRequest = https.request({
  hostname: 'pagos.azul.com.do',
  port: 443,
  path: '/WebServices/JSON/default.aspx',
  method: 'POST',
  agent: azulAgent
});
```

### Caching Strategy
```javascript
// Cache Azul responses for idempotent operations
const Redis = require('redis');
const redis = Redis.createClient();

const cacheAzulResponse = async (key, response, ttl = 300) => {
  await redis.setex(`azul:${key}`, ttl, JSON.stringify(response));
};

const getCachedAzulResponse = async (key) => {
  const cached = await redis.get(`azul:${key}`);
  return cached ? JSON.parse(cached) : null;
};
```

## 🎯 Go-Live Checklist

### Final Verification
- [ ] **Production Credentials** - Verified and working
- [ ] **SSL Certificates** - Valid and properly configured
- [ ] **Webhook Endpoints** - Tested and responding correctly
- [ ] **Error Handling** - All error scenarios handled
- [ ] **Monitoring** - Metrics and alerts configured
- [ ] **Backup Systems** - Automated backups working
- [ ] **Security Scan** - Vulnerability assessment completed
- [ ] **Load Testing** - Performance under expected load verified
- [ ] **Documentation** - All documentation updated
- [ ] **Team Training** - Support team trained on Azul integration

### Post-Deployment
- [ ] **Monitor Transactions** - Watch for any issues in first 24 hours
- [ ] **Verify Webhooks** - Ensure webhook delivery is working
- [ ] **Check Logs** - Monitor application logs for errors
- [ ] **Performance Metrics** - Verify response times are acceptable
- [ ] **Customer Support** - Brief support team on new provider

---

This deployment guide ensures a smooth and secure production deployment of Azul payment gateway integration with proper monitoring, security, and incident response procedures.
