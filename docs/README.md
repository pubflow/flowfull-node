# 📚 FLOWFULL Documentation

**Developer-Friendly Guides for Building Backends with Pubflow**

Welcome to the Flowfull documentation! Whether you're new to Pubflow or an experienced developer, these guides will help you build production-ready backends in record time.

🌐 **Part of the Pubflow Ecosystem**: [pubflow.com](https://pubflow.com)

---

## 🌟 Essential Reading

### 🎯 **[Core Concepts](CORE-CONCEPTS.md)** ⭐ START HERE
**Deep dive into Flowfull's 7 portable concepts** - The foundation for understanding Flowfull:

1. **Bridge Validation** - Connect to Flowless for authentication
2. **Validation Modes** - Layered security (DISABLED, STANDARD, ADVANCED, STRICT)
3. **HybridCache System** - 3-tier cache for lightning-fast performance
4. **Trust Tokens (PASETO)** - Cryptographically secure tokens
5. **Authentication Middleware** - Protect your routes
6. **Multi-Database Support** - Use any database (PostgreSQL, MySQL, LibSQL)
7. **Environment Configuration** - Configure with ease

**Includes**: Architecture diagrams, real-world examples, Go/Python/Rust implementations

**Perfect for**: Understanding the Pubflow architecture and core concepts

---

### 🚀 **[Starter Kit Guide](STARTER-KIT-GUIDE.md)** ⭐ QUICK START
**Build a complete backend in 30 minutes** - Step-by-step tutorial:

- ✅ Prerequisites and setup
- ✅ Database configuration (PostgreSQL, MySQL, LibSQL/Turso)
- ✅ Flowless integration (Pubflow or self-hosted)
- ✅ Creating protected routes with full CRUD examples
- ✅ Implementing cache for performance
- ✅ Testing and deployment

**Perfect for**: Getting started quickly, building your first Flowfull backend

---

## 🎓 Feature-Specific Guides

### ⚡ **[HybridCache Guide](HYBRIDCACHE-GUIDE.md)** NEW!
**Lightning-fast 3-tier caching system** - Make your backend 50x faster:

- 🚀 97% cache hit rate in production
- 🏗️ 3-tier architecture (LRU → Redis → Database)
- 💡 Real-world examples (user profiles, sessions, API responses)
- 📊 Performance metrics and optimization
- 🔧 Advanced configuration and troubleshooting

**Perfect for**: Optimizing performance, scaling horizontally

---

### 🔐 **[Trust Tokens Guide](TRUST-TOKENS-GUIDE.md)** NEW!
**Secure cryptographic tokens with PASETO** - Build secure token-based features:

- 📧 Email verification
- 🔑 Password reset
- 👥 Organization invitations
- 🎫 API access tokens
- 🔒 6 layers of security validation

**Perfect for**: Implementing secure token-based workflows

---

## 📖 Configuration Guides

### Getting Started
- **[Environment Setup](./environment-setup.md)** - Configure environment variables
- **[Database Setup](./database-setup.md)** - Set up PostgreSQL, MySQL, or LibSQL

### Security & Authentication
- **[Authentication Modes](./auth-modes.md)** - Understanding validation modes
- **[Protected Routes](./protected-routes.md)** - Implementing route protection

---

## 🌟 Understanding Pubflow

### The Three Layers

```
┌─────────────────────────────────────────────────────────┐
│                  PUBFLOW ARCHITECTURE                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐      ┌──────────────┐      ┌────────┐│
│  │   FLOWLESS   │ ───▶ │   FLOWFULL   │ ───▶ │ CLIENT ││
│  │              │      │              │      │        ││
│  │ • Auth       │      │ • Your APIs  │      │ • React││
│  │ • Sessions   │      │ • Business   │      │ • Next ││
│  │ • Users      │      │ • Database   │      │ • RN   ││
│  └──────────────┘      └──────────────┘      └────────┘│
│   pubflow.com          This Repo!            Your App   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

1. **🔐 Flowless** - Core authentication backend
   - Handles user registration, login, sessions
   - Deployed on [Pubflow](https://pubflow.com) or self-hosted
   - **You can build your own Flowless!**

2. **⚡ Flowfull** - Your custom backend (this repository)
   - Connects to Flowless for authentication
   - Implements your business logic
   - Stateless and horizontally scalable

3. **🎨 Flowfull-Client** - Your frontend
   - React, Next.js, React Native, or any framework
   - Connects to your Flowfull backend

### Why Pubflow?

✅ **Build backends in record time** - Pre-built authentication
✅ **Infinitely scalable** - Stateless design with load balancing
✅ **Language agnostic** - Node.js, Go, Python, Rust
✅ **Production ready** - Battle-tested patterns
✅ **Microservices or Monolithic** - Your choice

🌐 **Learn more**: [pubflow.com](https://pubflow.com)

---

## 🔧 Quick Reference

### **Create Protected Route**

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
