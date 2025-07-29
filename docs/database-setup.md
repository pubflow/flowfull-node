# Database Configuration Guide

Esta guía explica cómo configurar y seleccionar la base de datos para FLOWFULL, con soporte para múltiples proveedores.

## 🗄️ Bases de Datos Soportadas

FLOWFULL soporta múltiples tipos de base de datos a través de Kysely ORM:

### 1. **PostgreSQL** (Recomendado para producción)
- ✅ Mejor rendimiento para aplicaciones complejas
- ✅ Soporte completo de transacciones ACID
- ✅ Escalabilidad horizontal y vertical
- ✅ Ideal para aplicaciones enterprise

### 2. **MySQL** 
- ✅ Amplia compatibilidad
- ✅ Buen rendimiento para aplicaciones web
- ✅ Fácil de configurar y mantener

### 3. **LibSQL/Turso** (Recomendado para desarrollo)
- ✅ Serverless SQLite compatible
- ✅ Escalabilidad automática
- ✅ Ideal para desarrollo y aplicaciones pequeñas
- ✅ Edge computing support

### 4. **Neon** (PostgreSQL Serverless)
- ✅ PostgreSQL serverless
- ✅ Escalabilidad automática
- ✅ Branching de base de datos

### 5. **PlanetScale** (MySQL Serverless)
- ✅ MySQL serverless
- ✅ Branching de esquemas
- ✅ Escalabilidad automática

## ⚙️ Configuración por Proveedor

### 1. **PostgreSQL Local/Tradicional**

```env
# .env
DATABASE_URL=postgresql://username:password@localhost:5432/flowfull_db
DATABASE_TYPE=postgresql
DATABASE_SSL=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

**Instalación local:**
```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib

# macOS
brew install postgresql

# Windows
# Descargar desde https://www.postgresql.org/download/windows/

# Crear base de datos
sudo -u postgres createdb flowfull_db
sudo -u postgres createuser --interactive
```

### 2. **MySQL Local/Tradicional**

```env
# .env
DATABASE_URL=mysql://username:password@localhost:3306/flowfull_db
DATABASE_TYPE=mysql
DATABASE_SSL=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

**Instalación local:**
```bash
# Ubuntu/Debian
sudo apt install mysql-server

# macOS
brew install mysql

# Windows
# Descargar desde https://dev.mysql.com/downloads/mysql/

# Configurar base de datos
mysql -u root -p
CREATE DATABASE flowfull_db;
CREATE USER 'flowfull_user'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON flowfull_db.* TO 'flowfull_user'@'localhost';
```

### 3. **LibSQL/Turso (Recomendado para desarrollo)**

```env
# .env
DATABASE_URL=libsql://your-database.turso.io
DATABASE_TYPE=libsql
LIBSQL_AUTH_TOKEN=your_auth_token
```

**Setup Turso:**
```bash
# Instalar Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Crear base de datos
turso db create flowfull-db

# Obtener URL y token
turso db show flowfull-db
turso db tokens create flowfull-db
```

### 4. **Neon (PostgreSQL Serverless)**

```env
# .env
DATABASE_URL=postgresql://username:password@ep-cool-darkness-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
DATABASE_TYPE=neon
DATABASE_SSL=true
```

**Setup Neon:**
1. Ir a [neon.tech](https://neon.tech)
2. Crear cuenta y proyecto
3. Copiar connection string
4. Configurar en `.env`

### 5. **PlanetScale (MySQL Serverless)**

```env
# .env
DATABASE_URL=mysql://username:password@aws.connect.psdb.cloud/database-name?ssl={"rejectUnauthorized":true}
DATABASE_TYPE=planetscale
PLANETSCALE_HOST=aws.connect.psdb.cloud
PLANETSCALE_USERNAME=username
PLANETSCALE_PASSWORD=password
```

**Setup PlanetScale:**
```bash
# Instalar CLI
npm install -g @planetscale/cli

# Login
pscale auth login

# Crear base de datos
pscale database create flowfull-db

# Crear branch
pscale branch create flowfull-db main

# Obtener connection string
pscale connect flowfull-db main
```

## 🔧 Configuración Avanzada

### 1. **Connection Pooling**

```env
# Configuración de pool de conexiones
DATABASE_POOL_MIN=2          # Mínimo de conexiones
DATABASE_POOL_MAX=10         # Máximo de conexiones
DATABASE_POOL_IDLE_TIMEOUT=30000  # Timeout de conexiones idle
DATABASE_POOL_ACQUIRE_TIMEOUT=60000  # Timeout para obtener conexión
```

### 2. **SSL Configuration**

```env
# Para producción siempre usar SSL
DATABASE_SSL=true

# Para desarrollo local
DATABASE_SSL=false
```

### 3. **Multiple Environments**

```env
# Development
DATABASE_URL=libsql://dev-database.turso.io

# Staging
DATABASE_URL=postgresql://user:pass@staging-db.example.com:5432/flowfull_staging

# Production
DATABASE_URL=postgresql://user:pass@prod-db.example.com:5432/flowfull_prod
```

## 🚀 Migración y Setup Inicial

### 1. **Verificar Configuración**

```bash
# Validar configuración de base de datos
bun run validate-config
```

### 2. **Testing de Conexión**

```typescript
// src/scripts/test-db-connection.ts
import { getDatabase } from '@/lib/database/connection';

async function testConnection() {
  try {
    const db = await getDatabase();
    console.log('✅ Conexión a base de datos exitosa');
    
    // Test simple query
    const result = await db.selectFrom('information_schema.tables').selectAll().limit(1).execute();
    console.log('✅ Query de prueba exitosa');
    
  } catch (error) {
    console.error('❌ Error de conexión:', error);
    process.exit(1);
  }
}

testConnection();
```

### 3. **Estructura de Tablas Base**

FLOWFULL incluye tablas base para autenticación:

```sql
-- users: Información básica de usuarios
-- sessions: Sessions activas con validación
-- audit_logs: Logs de seguridad y auditoría
-- settings: Configuración de aplicación
```

## 🔍 Troubleshooting

### 1. **Error de Conexión**

```bash
# Verificar que la base de datos esté corriendo
# PostgreSQL
sudo systemctl status postgresql

# MySQL
sudo systemctl status mysql

# Verificar conectividad
telnet hostname port
```

### 2. **Error de Autenticación**

```bash
# Verificar credenciales en .env
# Verificar permisos de usuario en la base de datos
# Para PostgreSQL:
sudo -u postgres psql -c "\du"

# Para MySQL:
mysql -u root -p -e "SELECT User, Host FROM mysql.user;"
```

### 3. **Error de SSL**

```env
# Si hay problemas con SSL, temporalmente deshabilitar
DATABASE_SSL=false

# O configurar certificados específicos
DATABASE_SSL_CA=/path/to/ca-certificate.crt
DATABASE_SSL_CERT=/path/to/client-certificate.crt
DATABASE_SSL_KEY=/path/to/client-key.key
```

## 📊 Recomendaciones por Caso de Uso

### 🏗️ **Desarrollo Local**
```env
DATABASE_URL=libsql://:memory:  # En memoria para tests
# o
DATABASE_URL=libsql://local.db  # Archivo local
```

### 🧪 **Staging/Testing**
```env
DATABASE_URL=libsql://staging-db.turso.io
# o
DATABASE_URL=postgresql://user:pass@staging-db:5432/flowfull_staging
```

### 🚀 **Producción Pequeña/Media**
```env
DATABASE_URL=libsql://prod-db.turso.io
# o
DATABASE_URL=postgresql://user:pass@neon-db/flowfull_prod
```

### 🏢 **Producción Enterprise**
```env
DATABASE_URL=postgresql://user:pass@prod-cluster:5432/flowfull_prod
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=50
DATABASE_SSL=true
```

## 🔗 Referencias

- [Kysely Documentation](https://kysely.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [Turso Documentation](https://docs.turso.tech/)
- [Neon Documentation](https://neon.tech/docs/)
- [PlanetScale Documentation](https://planetscale.com/docs/)
