# 🇩🇴 Azul Checkout - Deployment Guide

Guía completa de deployment para **Azul Checkout** (azul_checkout) en producción con configuración de seguridad, monitoreo y mejores prácticas.

## 📋 Pre-Deployment Checklist

### ✅ Azul Configuration
- [ ] **Merchant ID** - Obtenido de Azul para producción
- [ ] **Merchant Name** - Configurado en portal de Azul
- [ ] **Auth Hash Key** - Clave secreta para validación
- [ ] **Callback URLs** - Registradas en portal de Azul
- [ ] **SSL Certificate** - Válido para dominio de callbacks
- [ ] **Testing Completed** - Todas las pruebas en sandbox exitosas

### ✅ Infrastructure
- [ ] **HTTPS Enabled** - SSL/TLS configurado
- [ ] **Domain Verified** - Dominio verificado con Azul
- [ ] **Firewall Rules** - Configuración de seguridad
- [ ] **Load Balancer** - Configurado si aplica
- [ ] **CDN Setup** - Para assets estáticos
- [ ] **Monitoring** - Métricas y alertas configuradas

### ✅ Application
- [ ] **Environment Variables** - Configuradas para producción
- [ ] **Database Indexes** - Índices optimizados
- [ ] **Error Handling** - Manejo robusto de errores
- [ ] **Logging** - Logs configurados
- [ ] **Backup Strategy** - Respaldos automatizados

## 🔧 Environment Configuration

### Production Environment Variables

```env
# Azul Checkout - Production
AZUL_CHECKOUT_ENVIRONMENT=production
AZUL_CHECKOUT_MERCHANT_ID=your_production_merchant_id
AZUL_CHECKOUT_MERCHANT_NAME="Tu Tienda Online"
AZUL_CHECKOUT_AUTH_HASH_KEY=your_production_auth_hash_key

# URLs de Callback (HTTPS obligatorio)
AZUL_CHECKOUT_BASE_URL=https://tu-sitio.com
AZUL_CHECKOUT_APPROVED_URL=https://tu-sitio.com/payment/success
AZUL_CHECKOUT_DECLINED_URL=https://tu-sitio.com/payment/failed
AZUL_CHECKOUT_CANCEL_URL=https://tu-sitio.com/payment/cancel

# Security Settings
AZUL_CHECKOUT_VALIDATE_HASH=true
AZUL_CHECKOUT_REQUIRE_HTTPS=true
AZUL_CHECKOUT_TIMEOUT_MINUTES=30

# Monitoring
AZUL_CHECKOUT_LOG_LEVEL=info
AZUL_CHECKOUT_ENABLE_METRICS=true

# Bridge-Payments Integration
ENABLED_PROVIDERS=stripe,paypal,authorize_net,azul,azul_checkout
```

### Staging Environment

```env
# Azul Página de Pagos - Staging
AZUL_PAGE_ENVIRONMENT=sandbox
AZUL_PAGE_MERCHANT_ID=your_staging_merchant_id
AZUL_PAGE_MERCHANT_NAME="Tu Tienda - Staging"
AZUL_PAGE_AUTH_HASH_KEY=your_staging_auth_hash_key

# Staging URLs
AZUL_PAGE_BASE_URL=https://staging.tu-sitio.com
AZUL_PAGE_APPROVED_URL=https://staging.tu-sitio.com/payment/success
AZUL_PAGE_DECLINED_URL=https://staging.tu-sitio.com/payment/failed
AZUL_PAGE_CANCEL_URL=https://staging.tu-sitio.com/payment/cancel
```

## 🌐 Infrastructure Setup

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/tu-sitio.com
server {
    listen 443 ssl http2;
    server_name tu-sitio.com;
    
    # SSL Configuration
    ssl_certificate /etc/ssl/certs/tu-sitio.com.crt;
    ssl_certificate_key /etc/ssl/private/tu-sitio.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    
    # Payment callback endpoints
    location /payment/ {
        proxy_pass http://bridge_payments;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Callback-specific settings
        proxy_read_timeout 30s;
        proxy_connect_timeout 10s;
        client_max_body_size 1M;
        
        # Rate limiting for callbacks
        limit_req zone=payment_callbacks burst=10 nodelay;
    }
    
    # Bridge-Payments API
    location /bridge-payment/ {
        proxy_pass http://bridge_payments;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # API-specific settings
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        client_max_body_size 2M;
    }
}

# Rate limiting zones
http {
    limit_req_zone $binary_remote_addr zone=payment_callbacks:10m rate=5r/s;
}
```

### Load Balancer Configuration

```yaml
# AWS Application Load Balancer
apiVersion: v1
kind: ConfigMap
metadata:
  name: alb-config
data:
  # Health check for payment callbacks
  health-check-path: "/health/azul-page"
  health-check-interval: "30"
  health-check-timeout: "5"
  
  # SSL termination
  ssl-policy: "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate-arn: "arn:aws:acm:region:account:certificate/cert-id"
  
  # Sticky sessions for payment flows
  target-group-attributes: |
    stickiness.enabled=true
    stickiness.lb_cookie.duration_seconds=1800
```

## 🗄️ Database Configuration

### Índices Optimizados

```sql
-- Índices para Azul Page
CREATE INDEX idx_payments_azul_page_order_number 
ON payments ((JSON_EXTRACT(metadata, '$.azul_page_data.order_number')))
WHERE provider_id = 'azul_page';

CREATE INDEX idx_payments_azul_page_status_created 
ON payments (status, created_at)
WHERE provider_id = 'azul_page';

CREATE INDEX idx_payments_azul_page_response_code
ON payments ((JSON_EXTRACT(metadata, '$.azul_response.response_code')))
WHERE provider_id = 'azul_page';

-- Índice para callbacks pendientes
CREATE INDEX idx_payments_pending_callbacks
ON payments (created_at)
WHERE provider_id = 'azul_page' 
AND status = 'requires_action';
```

### Database Backup

```bash
#!/bin/bash
# Backup script for Azul Page data

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/azul-page"
DB_NAME="bridge_payments"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup Azul Page payments
mysqldump $DB_NAME payments \
  --where="provider_id='azul_page'" > $BACKUP_DIR/azul_page_backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/azul_page_backup_$DATE.sql

# Remove backups older than 30 days
find $BACKUP_DIR -name "azul_page_backup_*.sql.gz" -mtime +30 -delete

echo "Azul Page backup completed: azul_page_backup_$DATE.sql.gz"
```

## 🔒 Security Configuration

### Firewall Rules

```bash
# Allow HTTPS traffic
sudo ufw allow 443/tcp

# Allow specific callback IPs (if Azul provides them)
# sudo ufw allow from azul_ip_range to any port 443

# Rate limiting at firewall level
sudo ufw limit 443/tcp

# Deny direct access to callback endpoints from unknown IPs
sudo ufw deny from any to any port 80
```

### Environment Security

```bash
# Secure environment variables
sudo chmod 600 /etc/environment
sudo chown root:root /etc/environment

# Use secrets management
export AZUL_PAGE_AUTH_HASH_KEY=$(aws secretsmanager get-secret-value \
  --secret-id azul-page-auth-hash-key \
  --query SecretString --output text)

# Rotate secrets regularly
aws secretsmanager rotate-secret --secret-id azul-page-auth-hash-key
```

### Application Security

```javascript
// Security middleware for callbacks
app.use('/payment/', (req, res, next) => {
  // Validate HTTPS
  if (!req.secure && process.env.NODE_ENV === 'production') {
    return res.status(400).json({
      error: 'HTTPS required for payment callbacks'
    });
  }
  
  // Validate callback parameters
  if (req.path.includes('success') || req.path.includes('failed')) {
    const requiredParams = ['OrderNumber', 'ResponseCode'];
    const missingParams = requiredParams.filter(param => !req.query[param]);
    
    if (missingParams.length > 0) {
      return res.status(400).json({
        error: 'Missing required parameters',
        missing: missingParams
      });
    }
  }
  
  next();
});
```

## 📊 Monitoring & Logging

### Application Metrics

```javascript
// Azul Page specific metrics
const azulPageMetrics = {
  redirects_created: new Counter({
    name: 'azul_page_redirects_total',
    help: 'Total Azul Page redirects created',
    labelNames: ['currency']
  }),
  
  callbacks_received: new Counter({
    name: 'azul_page_callbacks_total',
    help: 'Total Azul Page callbacks received',
    labelNames: ['response_code', 'type']
  }),
  
  payment_completion_time: new Histogram({
    name: 'azul_page_payment_duration_seconds',
    help: 'Time from redirect to callback',
    buckets: [30, 60, 120, 300, 600, 1800] // 30s to 30min
  }),
  
  hash_validation_failures: new Counter({
    name: 'azul_page_hash_validation_failures_total',
    help: 'Failed hash validations'
  })
};

// Track metrics
azulPageMetrics.redirects_created.inc({ currency: 'DOP' });
azulPageMetrics.callbacks_received.inc({ 
  response_code: '00', 
  type: 'success' 
});
```

### Structured Logging

```javascript
// Logging configuration
const logger = winston.createLogger({
  level: process.env.AZUL_PAGE_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'bridge-payments',
    provider: 'azul_page'
  },
  transports: [
    new winston.transports.File({ 
      filename: '/var/log/bridge-payments/azul-page.log' 
    }),
    new winston.transports.Console()
  ]
});

// Log payment events
logger.info('Payment redirect created', {
  order_number: 'ORDER_12345',
  amount_cents: 299900,
  currency: 'DOP',
  customer_email: 'cliente@ejemplo.com'
});

logger.info('Payment callback received', {
  order_number: 'ORDER_12345',
  azul_order_id: '987654321',
  response_code: '00',
  response_time_ms: 45000
});
```

### Health Checks

```javascript
// Health check endpoint for Azul Page
app.get('/health/azul-page', async (req, res) => {
  try {
    const healthCheck = {
      status: 'healthy',
      provider: 'azul_page',
      timestamp: new Date().toISOString(),
      checks: {}
    };
    
    // Check configuration
    healthCheck.checks.configuration = {
      merchant_id: !!process.env.AZUL_PAGE_MERCHANT_ID,
      auth_hash_key: !!process.env.AZUL_PAGE_AUTH_HASH_KEY,
      callback_urls: !!process.env.AZUL_PAGE_APPROVED_URL
    };
    
    // Check database connectivity
    const dbCheck = await checkDatabaseConnection();
    healthCheck.checks.database = dbCheck;
    
    // Check recent callback processing
    const recentCallbacks = await getRecentCallbackStats();
    healthCheck.checks.callbacks = recentCallbacks;
    
    const allHealthy = Object.values(healthCheck.checks)
      .every(check => check.status === 'ok');
    
    res.status(allHealthy ? 200 : 503).json(healthCheck);
    
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      provider: 'azul_page',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

## 🚨 Incident Response

### Common Issues & Solutions

#### 1. Callback Timeouts

```bash
# Check for pending payments
mysql -e "
SELECT 
  id, 
  JSON_EXTRACT(metadata, '$.azul_page_data.order_number') as order_number,
  created_at,
  TIMESTAMPDIFF(MINUTE, created_at, NOW()) as minutes_pending
FROM payments 
WHERE provider_id = 'azul_page' 
AND status = 'requires_action'
AND created_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE);"

# Manual callback processing
curl -X POST "https://tu-sitio.com/payment/success?OrderNumber=ORDER_12345&ResponseCode=00&AuthorizationCode=123456"
```

#### 2. Hash Validation Failures

```javascript
// Debug hash calculation
const debugHashCalculation = (params) => {
  console.log('Parameters received:', params);
  
  const { AuthHash, ...paramsToHash } = params;
  const sortedKeys = Object.keys(paramsToHash).sort();
  
  console.log('Sorted keys:', sortedKeys);
  console.log('Values for hash:', sortedKeys.map(k => paramsToHash[k]));
  
  const hashString = sortedKeys.map(k => paramsToHash[k]).join('|') + 
                    '|' + process.env.AZUL_PAGE_AUTH_HASH_KEY;
  
  console.log('Hash string:', hashString.replace(process.env.AZUL_PAGE_AUTH_HASH_KEY, '[SECRET]'));
  
  const calculatedHash = crypto.createHash('sha512')
    .update(hashString).digest('hex').toUpperCase();
  
  console.log('Calculated hash:', calculatedHash);
  console.log('Received hash:', AuthHash);
  console.log('Match:', calculatedHash === AuthHash);
};
```

#### 3. SSL Certificate Issues

```bash
# Check SSL certificate
openssl s_client -connect tu-sitio.com:443 -servername tu-sitio.com

# Verify certificate chain
curl -I https://tu-sitio.com/payment/success

# Check certificate expiration
openssl x509 -in /etc/ssl/certs/tu-sitio.com.crt -text -noout | grep "Not After"
```

## 📈 Performance Optimization

### Callback Processing Optimization

```javascript
// Async callback processing
const processCallbackAsync = async (params) => {
  // Immediate response to Azul
  res.status(200).send('OK');
  
  // Process in background
  setImmediate(async () => {
    try {
      await updatePaymentStatus(params);
      await triggerWebhooks(params);
      await sendCustomerNotification(params);
    } catch (error) {
      logger.error('Async callback processing failed', { error, params });
      // Add to retry queue
      await addToRetryQueue(params);
    }
  });
};
```

### Database Query Optimization

```sql
-- Optimized query for order lookup
SELECT 
  id,
  status,
  amount_cents,
  currency,
  JSON_EXTRACT(metadata, '$.azul_page_data.order_number') as order_number
FROM payments 
WHERE provider_id = 'azul_page'
AND JSON_EXTRACT(metadata, '$.azul_page_data.order_number') = ?
LIMIT 1;

-- Use prepared statements
PREPARE stmt FROM 'SELECT * FROM payments WHERE provider_id = "azul_page" AND JSON_EXTRACT(metadata, "$.azul_page_data.order_number") = ?';
```

## 🎯 Go-Live Checklist

### Final Verification
- [ ] **Production Credentials** - Verified with Azul
- [ ] **SSL Certificate** - Valid and properly configured
- [ ] **Callback URLs** - Registered with Azul and responding
- [ ] **Hash Validation** - Working correctly
- [ ] **Error Handling** - All scenarios covered
- [ ] **Monitoring** - Metrics and alerts active
- [ ] **Backup Systems** - Automated backups working
- [ ] **Security Scan** - Vulnerability assessment completed
- [ ] **Load Testing** - Performance under expected load verified
- [ ] **Documentation** - All documentation updated
- [ ] **Team Training** - Support team trained on Azul Page

### Post-Deployment
- [ ] **Monitor Redirects** - Watch redirect success rate
- [ ] **Verify Callbacks** - Ensure callback processing works
- [ ] **Check Logs** - Monitor for any errors
- [ ] **Performance Metrics** - Verify response times
- [ ] **Customer Support** - Brief support team on new provider

---

Esta guía de deployment asegura una implementación segura y robusta de Azul Página de Pagos en producción con monitoreo completo y procedimientos de respuesta a incidentes.
