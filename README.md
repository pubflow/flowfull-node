# 🚀 FLOWFULL-NODE

**Build production-ready backends in record time** with the Pubflow architecture.

Flowfull is your **custom backend layer** that connects to [Pubflow](https://pubflow.com) - a powerful trust-based authentication system. Create scalable, secure backends in any language (Node.js, Go, Python, Rust) with built-in session validation, multi-database support, and advanced caching.

> **Part of the Pubflow Ecosystem**: Flowless (core auth) → **Flowfull (your backend)** → Flowfull-Client (React/Next.js/React Native)

## 🌟 What is Pubflow?

**Pubflow** is a complete architecture for building modern applications in record time:

```
┌─────────────────────────────────────────────────────────────┐
│                    PUBFLOW ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │   FLOWLESS   │ ───▶ │   FLOWFULL   │ ───▶ │  CLIENT   │ │
│  │  (Core Auth) │      │ (Your Backend)│      │ (Frontend)│ │
│  └──────────────┘      └──────────────┘      └───────────┘ │
│   • User Auth           • Custom APIs         • React       │
│   • Sessions            • Business Logic      • Next.js     │
│   • Validation          • Database            • React Native│
│   • Trust Tokens        • Cache               • Your Choice │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### The Three Layers

1. **🔐 Flowless** - The core authentication backend
   - Deployed on [Pubflow](https://pubflow.com) as a managed service
   - Handles user registration, login, sessions
   - Validates all authentication requests
   - No setup or maintenance required

2. **⚡ Flowfull** - Your custom backend (this repository)
   - Connects to Flowless for authentication
   - Implements your business logic
   - Stateless and horizontally scalable
   - Available in multiple languages: Node.js, Go, Python, Rust

3. **🎨 Flowfull-Client** - Your frontend application
   - React, Next.js, React Native, or any framework
   - Connects to your Flowfull backend
   - Uses Pubflow authentication seamlessly

### Why Pubflow?

✅ **Build backends in record time** - Pre-built authentication, validation, and security
✅ **Infinitely scalable** - Stateless design with Pubflow Load Balancer
✅ **Language agnostic** - Use Node.js, Go, Python, Rust, or build your own
✅ **Production ready** - Battle-tested patterns and security
✅ **Microservices or Monolithic** - Your choice of architecture

🌐 **Learn more**: [pubflow.com](https://pubflow.com)

---

## 🎯 Core Concepts

Flowfull is built on **portable, language-agnostic concepts** that work in any technology stack:

1. **Bridge Validation** - Distributed authentication validating sessions from Flowless
2. **Validation Modes** - Layered security (DISABLED, STANDARD, ADVANCED, STRICT)
3. **HybridCache** - 3-tier cache system (Redis → LRU → Database) with automatic fallback
4. **Trust Tokens (PASETO)** - Cryptographically secure tokens using Ed25519 signatures
5. **Auth Middleware** - Flexible route protection with requireAuth/optionalAuth patterns
6. **Multi-Database Support** - PostgreSQL, MySQL, LibSQL via Kysely ORM
7. **Environment Configuration** - Zod-validated configuration with fail-fast validation

📖 **[Read Full Core Concepts Documentation](docs/CORE-CONCEPTS.md)** - Developer-friendly guide with examples

## ✨ Features

- ✅ **Bridge Validation**: Session validation with Flowless integration and LRU cache
- ✅ **Multi-Database**: PostgreSQL, MySQL, LibSQL support via Kysely ORM
- ✅ **Validation Modes**: Configurable security layers (STANDARD, ADVANCED, STRICT)
- ✅ **Auth Middleware**: requireAuth, optionalAuth, requireUserType patterns
- ✅ **Zod Validation**: Type-safe input validation and sanitization
- ✅ **Environment Config**: Zod-validated environment variables with auto-detection
- ✅ **TypeScript**: Full type safety throughout
- 🔜 **HybridCache**: Redis + LRU + Database 3-tier cache 
- 🔜 **PASETO Tokens**: Trust tokens for invitations and API access

## 🚀 Quick Start

### Prerequisites

- **Bun** v1.0+ ([Install](https://bun.sh)) or Node.js 18+
- **Database** (PostgreSQL, MySQL, or LibSQL/Turso)
- **Pubflow Account** - Sign up at [pubflow.com](https://pubflow.com)

### 30-Minute Setup

```bash
# 1. Copy template
cp -r 2/flowfull my-new-backend
cd my-new-backend

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env with your Flowless URL and secret

# 4. Start development server
bun run dev
```

The API will be available at `http://localhost:3001`

### Connect to Pubflow

1. **Sign up** at [pubflow.com](https://pubflow.com)
2. **Create a Flowless instance**
3. **Get your credentials**:
   - `FLOWLESS_API_URL` - Your Flowless endpoint (e.g., `https://your-instance.pubflow.com`)
   - `BRIDGE_VALIDATION_SECRET` - Your Bridge Secret
4. **Configure** your `.env` file with these credentials
5. **Start building** your custom backend!

📖 **[Complete Starter Kit Guide](docs/STARTER-KIT-GUIDE.md)** - Build a complete backend in 30 minutes
🌐 **[Full Documentation](https://docs.pubflow.com)** - Complete Flowfull documentation

## Configuration

### Required Environment Variables

```env
# Database
DATABASE_URL=your_database_url

# Flowless Integration
FLOWLESS_API_URL=http://localhost:3000
BRIDGE_VALIDATION_SECRET=your_secret_key

# Server
PORT=3001
NODE_ENV=development
```

### Optional Configuration

- **Session Validation**: Configure validation modes (STANDARD, ADVANCED, STRICT)
- **Rate Limiting**: Configure request limits
- **CORS**: Set allowed origins and headers
- **Compression**: Enable/disable response compression
- **Features**: Enable/disable specific application features

## API Endpoints

### Core Endpoints

- `GET /health` - Health check
- `GET /` - API information and features
- `GET /api/v1/public` - Public route example
- `GET /api/v1/protected` - Protected route example (requires authentication)
- `POST /api/v1/items` - Create item example (with validation)
- `GET /api/v1/items` - List items example (with pagination)

## Architecture

### Core Components

1. **Bridge Validator**: Session validation with Flowless integration
2. **Repository Pattern**: Database abstraction layer with Kysely ORM
3. **Authentication Middleware**: Session-based authentication
4. **Email Service**: Template-based notifications with i18n
5. **Cache Layer**: LFU cache for session optimization
6. **Validation Layer**: Zod-based input validation and sanitization

### Security Features

- **Session Validation**: Device-bound sessions with IP/User-Agent validation
- **Request Sanitization**: Zod-based input validation
- **Rate Limiting**: Configurable request throttling
- **CORS Protection**: Strict origin validation
- **Authentication Middleware**: Secure route protection

### Database Support

FLOWFULL supports multiple database types through Kysely ORM:

- **PostgreSQL**: Full support with connection pooling
- **MySQL**: Complete compatibility
- **LibSQL**: Turso serverless SQLite support
- **Neon**: Serverless PostgreSQL
- **PlanetScale**: Serverless MySQL

## Development

### Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun run test` - Run test suite
- `bun run lint` - Lint code
- `bun run format` - Format code
- `bun run validate-config` - Validate environment configuration

### Adding New Routes

1. Create route file in `src/routes/`
2. Import and register in `src/index.ts`
3. Add authentication middleware if needed
4. Implement Zod validation schemas
5. Add proper error handling

### Database Integration

1. Configure database connection in environment
2. Use repository pattern for data access
3. Implement proper error handling
4. Add connection pooling for production

## 📚 Documentation

- **[Core Concepts](docs/CORE-CONCEPTS.md)** - Deep dive into Flowfull's portable concepts
- **[Starter Kit Guide](docs/STARTER-KIT-GUIDE.md)** - Build a backend in 30 minutes
- **[.env.example](.env.example)** - Complete environment variable reference

## 🌍 Language Portability

Flowfull is **language-agnostic by design**. Build your backend in any language:

### Available Implementations

- **✅ Flowfull-Node.js** (this repository) - Bun/Node.js with Hono and Kysely
- **🔜 Flowfull-Go** - Coming soon with Gin and GORM
- **🔜 Flowfull-Python** - Coming soon with FastAPI and SQLAlchemy
- **🔜 Flowfull-Rust** - Coming soon with Actix and Diesel

### Build Your Own

All core concepts are documented with cross-language examples. You can:

1. **Use existing implementation** - Start with Flowfull-Node.js
2. **Build your own** - Follow the [Core Concepts](docs/CORE-CONCEPTS.md) guide
3. **Mix and match** - Use different languages for different services

**Example**: Use Flowfull-Go for high-performance APIs and Flowfull-Node.js for rapid prototyping.

See [Core Concepts](docs/CORE-CONCEPTS.md) for implementation guides in Go, Python, and Rust.

## 🎯 Use Cases

Flowfull + Pubflow is perfect for:

- **🚀 Rapid Development** - Build production backends in hours, not weeks
- **🏢 SaaS Applications** - Multi-tenant with built-in authentication
- **🔌 Microservices** - Distributed authentication with Bridge Validation
- **📱 Mobile Apps** - React Native with Flowfull-Client
- **🌐 Web Apps** - React/Next.js with seamless auth
- **⚡ Serverless** - LibSQL/Turso support for edge deployments
- **🔄 API Gateways** - Route protection and validation
- **📊 Internal Tools** - Admin panels and dashboards

## 🏗️ Scalability & Architecture

### Horizontal Scaling

Flowfull is designed to be **stateless** and **horizontally scalable**:

```
                    ┌─────────────────┐
                    │ Pubflow Load    │
                    │   Balancer      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         ┌────▼────┐    ┌────▼────┐   ┌────▼────┐
         │Flowfull │    │Flowfull │   │Flowfull │
         │Instance1│    │Instance2│   │Instance3│
         └────┬────┘    └────┬────┘   └────┬────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │    Flowless     │
                    │  (Core Auth)    │
                    └─────────────────┘
```

### Best Practices

✅ **Keep Flowfull stateless** - All state in Flowless or database
✅ **Use HybridCache** - Redis for shared cache across instances
✅ **Separate concerns** - One Flowfull per service/domain
✅ **Load balance** - Use Pubflow Load Balancer or your own
✅ **Monitor** - Track performance and cache hit rates

### Microservices vs Monolithic

**You choose!** Pubflow supports both:

- **Microservices**: Multiple Flowfull instances, each handling specific domains
- **Monolithic**: Single Flowfull instance with all your business logic
- **Hybrid**: Start monolithic, split into microservices as you grow

## 📝 License

MIT License - Feel free to use this template for your projects.
