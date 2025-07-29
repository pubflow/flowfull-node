# FLOWFULL Documentation

Documentación completa para FLOWFULL - Backend API Template con Flowless session validation.

## 📚 Guías Principales

### 🚀 **Getting Started**
- [Environment Setup](./environment-setup.md) - Configuración de variables de entorno
- [Database Setup](./database-setup.md) - Configuración de base de datos multi-proveedor
- [Authentication Modes](./auth-modes.md) - Modos de validación de seguridad

### 🔐 **Security & Authentication**
- [Protected Routes](./protected-routes.md) - Cómo crear rutas seguras con middleware
- [Bridge Validator Flow](./bridge-validator-flow.md) - Flujo completo de validación
- [Security Best Practices](./security-best-practices.md) - Mejores prácticas de seguridad

### 🛠️ **Development**
- [API Development Guide](./api-development.md) - Desarrollo de APIs con FLOWFULL
- [Error Handling](./error-handling.md) - Manejo de errores y debugging
- [Testing Guide](./testing.md) - Testing de rutas y middleware

### 🚀 **Deployment**
- [Production Deployment](./deployment.md) - Deploy en producción
- [Performance Optimization](./performance.md) - Optimización y escalabilidad
- [Monitoring & Logging](./monitoring.md) - Monitoreo y logs

## 🔧 Quick Reference

### **Crear Ruta Protegida**

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/auth-middleware';

const app = new Hono();

// Schema de validación
const createItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional()
});

// Ruta protegida con validación
app.post('/items', authMiddleware, async (c) => {
  try {
    // 1. Usuario autenticado disponible
    const user = c.get('user');
    
    // 2. Validar datos de entrada
    const body = await c.req.json();
    const validatedData = createItemSchema.parse(body);
    
    // 3. Lógica de negocio
    const item = {
      id: crypto.randomUUID(),
      ...validatedData,
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };
    
    // 4. Respuesta exitosa
    return c.json({ success: true, data: item }, 201);
    
  } catch (error) {
    // 5. Manejo de errores
    if (error instanceof z.ZodError) {
      return c.json({
        error: 'Datos inválidos',
        details: error.errors
      }, 400);
    }
    
    return c.json({ error: 'Error interno' }, 500);
  }
});

export default app;
```

### **Configuración Básica (.env)**

```env
# Servidor
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/flowfull_db

# Flowless Integration
FLOWLESS_API_URL=http://localhost:3000
BRIDGE_VALIDATION_SECRET=your-super-secret-key-here

# Seguridad
AUTH_VALIDATION_MODE=STANDARD
CORS_ORIGINS=http://localhost:3000
```

### **Modos de Autenticación**

| Modo | Uso | Validaciones | Performance |
|------|-----|--------------|-------------|
| `DISABLED` | Desarrollo | Ninguna | Máxima |
| `STANDARD` | Staging | IP | Alta |
| `ADVANCED` | Producción | IP + UA + Device | Media |
| `STRICT` | Crítico | Todas + Auto-invalidate | Menor |

## 🏗️ Arquitectura

### **Componentes Core**

```
flowfull/
├── src/
│   ├── lib/
│   │   ├── auth/              # Sistema de autenticación
│   │   │   ├── bridge-validator.ts    # Core validator
│   │   │   ├── auth-middleware.ts     # Middleware de rutas
│   │   │   ├── session-cache.ts       # Cache LFU
│   │   │   └── validation-mode.ts     # Modos de seguridad
│   │   ├── database/          # Conexión multi-DB
│   │   ├── email/             # Sistema de email i18n
│   │   └── utils/             # Utilidades
│   ├── routes/                # Rutas de API
│   └── config/                # Configuración
└── docs/                      # Documentación
```

### **Flujo de Request**

```mermaid
graph TD
    A[Request] --> B[CORS Middleware]
    B --> C[Rate Limiting]
    C --> D[Auth Middleware]
    D --> E[Bridge Validator]
    E --> F[LFU Cache Check]
    F --> G{Cache Hit?}
    G -->|Yes| H[Validate Security]
    G -->|No| I[Query Flowless API]
    I --> J[Update Cache]
    J --> H
    H --> K{Valid Session?}
    K -->|Yes| L[Route Handler]
    K -->|No| M[401 Unauthorized]
    L --> N[Response]
```

## 🔍 Troubleshooting

### **Problemas Comunes**

| Error | Causa | Solución |
|-------|-------|----------|
| `Database connection failed` | URL incorrecta | Verificar `DATABASE_URL` |
| `Bridge validation timeout` | Flowless no responde | Verificar `FLOWLESS_API_URL` |
| `Session validation failed` | Modo muy estricto | Ajustar `AUTH_VALIDATION_MODE` |
| `CORS error` | Origins mal configurados | Verificar `CORS_ORIGINS` |

### **Debug Mode**

```env
# Activar logs detallados
LOG_LEVEL=debug
DEV_LOG_REQUESTS=true
AUTH_LOG_VIOLATIONS=true
```

## 📊 Performance

### **Optimizaciones Incluidas**

- 🚀 **LFU Cache**: Sessions frecuentes en memoria
- ⚡ **Connection Pooling**: Reutilización de conexiones DB
- 🗜️ **Compression**: Respuestas comprimidas automáticamente
- 🔄 **Batch Validation**: Validaciones en paralelo
- 📦 **Request Deduplication**: Evita requests duplicados

### **Métricas Típicas**

| Operación | Latencia | Throughput |
|-----------|----------|------------|
| Cache Hit | ~2ms | 10,000+ req/s |
| Cache Miss | ~50ms | 1,000+ req/s |
| DB Query | ~10ms | 500+ req/s |
| Full Validation | ~60ms | 200+ req/s |

## 🛡️ Security Features

### **Protecciones Incluidas**

- ✅ **Session Validation**: Bridge Validator con Flowless
- ✅ **Input Sanitization**: Zod validation en todas las rutas
- ✅ **Rate Limiting**: Protección contra ataques DDoS
- ✅ **CORS Protection**: Origins específicos únicamente
- ✅ **Request Size Limits**: Prevención de ataques de memoria
- ✅ **SQL Injection Protection**: Kysely ORM con prepared statements
- ✅ **XSS Protection**: Headers de seguridad automáticos

### **Compliance**

- 🔒 **GDPR Ready**: Manejo seguro de datos personales
- 🏦 **PCI DSS Compatible**: Estándares de seguridad financiera
- 🛡️ **OWASP Top 10**: Protección contra vulnerabilidades comunes
- 📋 **SOC 2 Ready**: Controles de seguridad empresarial

## 🚀 Next Steps

1. **Setup Inicial**: [Environment Setup](./environment-setup.md)
2. **Configurar DB**: [Database Setup](./database-setup.md)
3. **Primera Ruta**: [Protected Routes](./protected-routes.md)
4. **Deploy**: [Production Deployment](./deployment.md)

## 🆘 Support

- 📖 **Documentation**: Revisa las guías específicas
- 🐛 **Issues**: Reporta problemas en el repositorio
- 💬 **Community**: Únete a las discusiones
- 📧 **Contact**: Para soporte enterprise

---

**FLOWFULL** - Standard architecture backend API template
Built with ❤️ for secure, scalable applications
