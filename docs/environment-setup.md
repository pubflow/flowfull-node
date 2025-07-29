# Environment Variables Configuration

Esta guía explica cómo configurar todas las variables de entorno para FLOWFULL de forma segura y optimizada.

## 🔧 Configuración Básica

### 1. **Setup Inicial**

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar configuración
nano .env  # o tu editor preferido
```

### 2. **Variables Obligatorias**

```env
# ================================
# CONFIGURACIÓN MÍNIMA REQUERIDA
# ================================

# Servidor
PORT=3001
NODE_ENV=development
DATABASE_URL=your_database_url

# Flowless Integration
FLOWLESS_API_URL=http://localhost:3000
BRIDGE_VALIDATION_SECRET=your-super-secret-key-here
```

## 🗄️ Configuración de Base de Datos

### **Seleccionar Proveedor de DB**

```env
# PostgreSQL (Recomendado para producción)
DATABASE_URL=postgresql://user:password@localhost:5432/flowfull_db

# MySQL
DATABASE_URL=mysql://user:password@localhost:3306/flowfull_db

# LibSQL/Turso (Recomendado para desarrollo)
DATABASE_URL=libsql://your-database.turso.io
LIBSQL_AUTH_TOKEN=your_auth_token

# Neon (PostgreSQL Serverless)
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require

# PlanetScale (MySQL Serverless)
DATABASE_URL=mysql://user:password@aws.connect.psdb.cloud/database?ssl={"rejectUnauthorized":true}
```

### **Configuración de Pool**

```env
# Pool de conexiones (ajustar según carga)
DATABASE_POOL_MIN=2          # Desarrollo: 2, Producción: 5-10
DATABASE_POOL_MAX=10         # Desarrollo: 10, Producción: 20-50
DATABASE_SSL=false           # Desarrollo: false, Producción: true
```

## 🔐 Configuración de Autenticación

### **Modos de Validación**

```env
# ================================
# MODOS DE SEGURIDAD
# ================================

# DESARROLLO - Sin validaciones estrictas
AUTH_VALIDATION_MODE=DISABLED
AUTH_ENABLE_VALIDATION_MODE=false

# STAGING - Validación básica
AUTH_VALIDATION_MODE=STANDARD
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=false
AUTH_DEVICE_VALIDATION=false

# PRODUCCIÓN - Validación avanzada
AUTH_VALIDATION_MODE=ADVANCED
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true

# CRÍTICO - Validación estricta
AUTH_VALIDATION_MODE=STRICT
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true
AUTH_AUTO_INVALIDATE=true
```

### **Configuración de Sessions**

```env
# Session management
SESSION_VALIDATION_CACHE_TTL=300    # 5 minutos
SESSION_HEADER_NAME=X-Session-ID
SESSION_COOKIE_NAME=session_id
SESSION_REQUIRE_HTTPS=false         # Desarrollo: false, Producción: true
```

### **Bridge Validator**

```env
# Flowless integration
FLOWLESS_API_URL=http://localhost:3000
BRIDGE_VALIDATION_SECRET=tu-clave-secreta-super-segura-aqui
BRIDGE_VALIDATION_TIMEOUT=5000      # 5 segundos
BRIDGE_RETRY_ATTEMPTS=3
```

## 🛡️ Configuración de Seguridad

### **CORS Configuration**

```env
# CORS - Ajustar según tu frontend
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,https://yourdomain.com
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_HEADERS=Content-Type,Authorization,X-Session-ID
CORS_CREDENTIALS=true
CORS_MAX_AGE=86400
```

### **Rate Limiting**

```env
# Rate limiting - Ajustar según carga esperada
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=100             # Requests por ventana
RATE_LIMIT_WINDOW=900000            # 15 minutos en ms
RATE_LIMIT_SKIP_SUCCESSFUL=false
RATE_LIMIT_STORE=memory             # memory o redis
```

### **Request Security**

```env
# Seguridad de requests
MAX_REQUEST_SIZE=1048576            # 1MB
REQUEST_TIMEOUT=30000               # 30 segundos
VALIDATE_CONTENT_TYPE=true
REQUIRE_USER_AGENT=false            # Desarrollo: false, Producción: true
```

## 📧 Configuración de Email (Opcional)

```env
# ================================
# SISTEMA DE EMAIL
# ================================

# ZeptoMail configuration
ZEPTOMAIL_API_KEY=Zoho-enczapikey your_api_key_here
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=Your Organization
EMAIL_REPLY_TO_ADDRESS=support@yourdomain.com
EMAIL_REPLY_TO_NAME=Support Team

# Organization info
ORGANIZATION_NAME=Your Organization Name
ORGANIZATION_EMAIL=info@yourdomain.com
ORGANIZATION_PHONE=+1 (555) 123-4567
ORGANIZATION_WEBSITE=https://yourdomain.com

# Internationalization
GLOBAL_LANG=en
DEFAULT_LANGUAGE=en
```

## 📊 Configuración de Logging

```env
# ================================
# LOGGING Y MONITORING
# ================================

# Logging levels
LOG_LEVEL=info                      # debug, info, warn, error
LOG_FORMAT=json                     # json o simple
LOG_MODE=false                      # true para debug detallado
LOG_FILE_ENABLED=true
LOG_FILE_PATH=./logs/flowfull.log

# Log rotation
LOG_ROTATION_ENABLED=true
LOG_MAX_SIZE=10485760              # 10MB
LOG_MAX_FILES=5

# Health check
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_PATH=/health
```

## ⚡ Configuración de Performance

```env
# ================================
# PERFORMANCE Y CACHE
# ================================

# Compression
COMPRESSION_ENABLED=true
COMPRESSION_FORCE_DISABLE=false

# Cache
CACHE_ENABLED=true
CACHE_TTL=300                      # 5 minutos

# Development settings
DEV_MODE=true                      # Solo en desarrollo
DEV_CORS_RELAXED=true             # Solo en desarrollo
DEV_LOG_REQUESTS=true             # Solo en desarrollo
```

## 🌍 Configuración por Ambiente

### **Development (.env.development)**

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=libsql://:memory:
FLOWLESS_API_URL=http://localhost:3000

# Security relaxed
AUTH_VALIDATION_MODE=DISABLED
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
SESSION_REQUIRE_HTTPS=false
DATABASE_SSL=false

# Debug enabled
LOG_LEVEL=debug
DEV_MODE=true
DEV_LOG_REQUESTS=true
```

### **Staging (.env.staging)**

```env
NODE_ENV=staging
PORT=3001
DATABASE_URL=postgresql://user:pass@staging-db:5432/flowfull_staging
FLOWLESS_API_URL=https://staging-api.yourdomain.com

# Security moderate
AUTH_VALIDATION_MODE=STANDARD
AUTH_IP_VALIDATION=true
SESSION_REQUIRE_HTTPS=true
DATABASE_SSL=true

# Logging moderate
LOG_LEVEL=info
DEV_MODE=false
```

### **Production (.env.production)**

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:pass@prod-db:5432/flowfull_prod
FLOWLESS_API_URL=https://api.yourdomain.com

# Security strict
AUTH_VALIDATION_MODE=ADVANCED
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true
SESSION_REQUIRE_HTTPS=true
DATABASE_SSL=true

# Performance optimized
DATABASE_POOL_MIN=10
DATABASE_POOL_MAX=50
COMPRESSION_ENABLED=true
CACHE_ENABLED=true

# Logging production
LOG_LEVEL=warn
LOG_FILE_ENABLED=true
DEV_MODE=false
```

## 🔒 Seguridad de Variables de Entorno

### **Secretos Seguros**

```bash
# Generar secretos seguros
openssl rand -hex 32  # Para BRIDGE_VALIDATION_SECRET

# Ejemplo de secreto fuerte
BRIDGE_VALIDATION_SECRET=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

### **Gestión de Secretos**

```bash
# Nunca commitear .env
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.production" >> .gitignore

# Usar servicios de secretos en producción
# AWS Secrets Manager
# Azure Key Vault
# Google Secret Manager
# HashiCorp Vault
```

### **Validación de Configuración**

```bash
# Validar configuración antes de deploy
bun run validate-config

# Script de validación personalizado
bun run src/scripts/validate-env.ts
```

## ⚠️ Errores Comunes

### **1. DATABASE_URL Incorrecto**

```bash
# ❌ INCORRECTO
DATABASE_URL=postgres://localhost/db

# ✅ CORRECTO
DATABASE_URL=postgresql://user:password@localhost:5432/database_name
```

### **2. BRIDGE_VALIDATION_SECRET Débil**

```bash
# ❌ INCORRECTO
BRIDGE_VALIDATION_SECRET=123456

# ✅ CORRECTO
BRIDGE_VALIDATION_SECRET=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

### **3. CORS Mal Configurado**

```bash
# ❌ INCORRECTO - Muy permisivo
CORS_ORIGINS=*

# ✅ CORRECTO - Específico
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

## 📋 Checklist de Configuración

- [ ] ✅ `.env` copiado desde `.env.example`
- [ ] ✅ `DATABASE_URL` configurado correctamente
- [ ] ✅ `BRIDGE_VALIDATION_SECRET` generado de forma segura
- [ ] ✅ `FLOWLESS_API_URL` apunta al backend correcto
- [ ] ✅ `AUTH_VALIDATION_MODE` apropiado para el ambiente
- [ ] ✅ `CORS_ORIGINS` configurado específicamente
- [ ] ✅ SSL habilitado en producción
- [ ] ✅ Rate limiting configurado
- [ ] ✅ Logging configurado apropiadamente
- [ ] ✅ `.env` añadido a `.gitignore`
- [ ] ✅ Configuración validada con `validate-config`

## 🔗 Referencias

- [Database Setup Guide](./database-setup.md)
- [Authentication Modes](./auth-modes.md)
- [Security Best Practices](./security.md)
