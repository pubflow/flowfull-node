# Deployment Guide

## Production Deployment

This guide covers deploying Bridge-Payments to production environments with security, performance, and reliability best practices.

## Prerequisites

### System Requirements

- **Node.js**: 18+ or **Bun** 1.0+
- **Database**: PostgreSQL 12+ (recommended) or MySQL 8+
- **Memory**: Minimum 512MB RAM, recommended 2GB+
- **Storage**: Minimum 10GB, recommended 50GB+ for logs and backups
- **Network**: HTTPS/TLS certificate required

### Infrastructure Requirements

- **Load Balancer**: For high availability
- **Database**: Managed database service recommended
- **Monitoring**: Application and infrastructure monitoring
- **Backup**: Automated database backups
- **Logging**: Centralized log aggregation

## Environment Configuration

### Production Environment Variables

```env
# Server Configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
BASE_URL=https://api.yourdomain.com

# Database (PostgreSQL recommended)
DATABASE_URL=postgresql://user:password@db.yourdomain.com:5432/bridge_payments
DATABASE_SSL=true
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20

# Flowless Integration
FLOWLESS_API_URL=https://api.yourdomain.com
BRIDGE_VALIDATION_SECRET=your-production-secret-key
BRIDGE_VALIDATION_TIMEOUT=5000

# Security
SESSION_REQUIRE_HTTPS=true
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
RATE_LIMIT_REQUESTS=50
RATE_LIMIT_WINDOW=900000

# Payment Providers
DEFAULT_PAYMENT_PROVIDER=stripe
ENABLED_PROVIDERS=stripe,paypal

# Stripe Production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal Production
PAYPAL_CLIENT_ID=your_live_client_id
PAYPAL_CLIENT_SECRET=your_live_client_secret
PAYPAL_ENVIRONMENT=live

# Logging & Monitoring
LOG_LEVEL=warn
LOG_FORMAT=json
LOG_FILE_ENABLED=true
LOG_FILE_PATH=/var/log/bridge-payments/app.log
METRICS_ENABLED=true
METRICS_PORT=9090

# Performance
COMPRESSION_ENABLED=true
CACHE_ENABLED=true
CACHE_TTL=300

# Client Secret Management
CLIENT_SECRET_AUTO_CLEANUP=true
CLIENT_SECRET_CLEANUP_INTERVAL=3600
CLIENT_SECRET_MAX_AGE=3600
```

## Docker Deployment

### Dockerfile

```dockerfile
# Use Bun base image
FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Build application
RUN bun run build

# Production stage
FROM oven/bun:1-slim as production
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bridge-payments

# Copy built application
COPY --from=base --chown=bridge-payments:nodejs /app/dist ./dist
COPY --from=base --chown=bridge-payments:nodejs /app/node_modules ./node_modules
COPY --from=base --chown=bridge-payments:nodejs /app/package.json ./

# Create log directory
RUN mkdir -p /var/log/bridge-payments && \
    chown bridge-payments:nodejs /var/log/bridge-payments

# Switch to non-root user
USER bridge-payments

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start application
CMD ["bun", "run", "dist/index.js"]
```

### Docker Compose

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  bridge-payments:
    build: .
    ports:
      - "3001:3001"
      - "9090:9090"  # Metrics port
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/bridge_payments
      - FLOWLESS_API_URL=https://api.yourdomain.com
      - BRIDGE_VALIDATION_SECRET=${BRIDGE_VALIDATION_SECRET}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
    volumes:
      - ./logs:/var/log/bridge-payments
    depends_on:
      - db
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: bridge_payments
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - bridge-payments
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

## Kubernetes Deployment

### Deployment Manifest

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bridge-payments
  labels:
    app: bridge-payments
spec:
  replicas: 3
  selector:
    matchLabels:
      app: bridge-payments
  template:
    metadata:
      labels:
        app: bridge-payments
    spec:
      containers:
      - name: bridge-payments
        image: your-registry/bridge-payments:latest
        ports:
        - containerPort: 3001
        - containerPort: 9090
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: bridge-payments-secrets
              key: database-url
        - name: BRIDGE_VALIDATION_SECRET
          valueFrom:
            secretKeyRef:
              name: bridge-payments-secrets
              key: bridge-validation-secret
        - name: STRIPE_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: bridge-payments-secrets
              key: stripe-secret-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: logs
          mountPath: /var/log/bridge-payments
      volumes:
      - name: logs
        emptyDir: {}
```

### Service and Ingress

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: bridge-payments-service
spec:
  selector:
    app: bridge-payments
  ports:
  - name: http
    port: 80
    targetPort: 3001
  - name: metrics
    port: 9090
    targetPort: 9090

---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: bridge-payments-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
  - hosts:
    - api.yourdomain.com
    secretName: bridge-payments-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /bridge-payment
        pathType: Prefix
        backend:
          service:
            name: bridge-payments-service
            port:
              number: 80
```

## Load Balancer Configuration

### Nginx Configuration

```nginx
# nginx.conf
upstream bridge_payments {
    least_conn;
    server bridge-payments-1:3001 max_fails=3 fail_timeout=30s;
    server bridge-payments-2:3001 max_fails=3 fail_timeout=30s;
    server bridge-payments-3:3001 max_fails=3 fail_timeout=30s;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    location /bridge-payment/ {
        proxy_pass http://bridge_payments;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Health check
        proxy_next_upstream error timeout http_500 http_502 http_503;
    }

    location /health {
        proxy_pass http://bridge_payments;
        access_log off;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

## Database Setup

### PostgreSQL Production Configuration

```sql
-- Create database and user
CREATE DATABASE bridge_payments;
CREATE USER bridge_payments_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE bridge_payments TO bridge_payments_user;

-- Connect to database
\c bridge_payments;

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO bridge_payments_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bridge_payments_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bridge_payments_user;

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO bridge_payments_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO bridge_payments_user;
```

### Database Optimization

```sql
-- Performance tuning
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- Reload configuration
SELECT pg_reload_conf();
```

## Monitoring & Logging

### Application Monitoring

```typescript
// src/lib/monitoring/metrics.ts
import { register, Counter, Histogram, Gauge } from 'prom-client';

export const metrics = {
  httpRequests: new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status']
  }),
  
  httpDuration: new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route']
  }),
  
  paymentRequests: new Counter({
    name: 'payment_requests_total',
    help: 'Total number of payment requests',
    labelNames: ['provider', 'status']
  }),
  
  activeConnections: new Gauge({
    name: 'database_connections_active',
    help: 'Number of active database connections'
  })
};

// Metrics endpoint
app.get('/metrics', async (c) => {
  return new Response(await register.metrics(), {
    headers: { 'Content-Type': register.contentType }
  });
});
```

### Log Configuration

```typescript
// src/lib/logging/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bridge-payments' },
  transports: [
    new winston.transports.File({
      filename: '/var/log/bridge-payments/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: '/var/log/bridge-payments/combined.log'
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

## Security Considerations

### SSL/TLS Configuration

- Use TLS 1.2 or higher
- Implement HSTS headers
- Use strong cipher suites
- Regular certificate renewal

### Environment Security

- Store secrets in secure vaults (AWS Secrets Manager, HashiCorp Vault)
- Use least privilege access
- Regular security updates
- Network segmentation

### Application Security

- Input validation and sanitization
- Rate limiting and DDoS protection
- Regular dependency updates
- Security headers implementation

## Backup & Recovery

### Database Backups

```bash
#!/bin/bash
# backup-script.sh

DB_NAME="bridge_payments"
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup
pg_dump $DB_NAME | gzip > "$BACKUP_DIR/bridge_payments_$DATE.sql.gz"

# Upload to S3 (optional)
aws s3 cp "$BACKUP_DIR/bridge_payments_$DATE.sql.gz" s3://your-backup-bucket/

# Cleanup old backups
find $BACKUP_DIR -name "bridge_payments_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: bridge_payments_$DATE.sql.gz"
```

### Disaster Recovery

1. **Database Recovery**: Restore from latest backup
2. **Application Recovery**: Deploy from container registry
3. **Configuration Recovery**: Restore from version control
4. **Monitoring**: Verify all systems operational

## Performance Optimization

### Application Tuning

- Connection pooling optimization
- Query optimization and indexing
- Caching implementation
- Response compression

### Infrastructure Scaling

- Horizontal scaling with load balancers
- Database read replicas
- CDN for static assets
- Auto-scaling based on metrics

## Next Steps

- **[Monitoring Setup](./monitoring.md)** - Detailed monitoring configuration
- **[Security Guide](./security.md)** - Comprehensive security practices
- **[Troubleshooting](./troubleshooting.md)** - Common issues and solutions
- **[Maintenance](./maintenance.md)** - Ongoing maintenance procedures
