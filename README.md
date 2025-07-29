# FLOWFULL

A standard architecture backend API template with Flowless session validation, multi-database support, and LFU cache optimization. Perfect for building scalable backend APIs with robust authentication and security features.

## Features

- **Flowless Integration**: Seamless session validation with Bridge Validator
- **Multi-Database Support**: PostgreSQL, MySQL, LibSQL, and more via Kysely ORM
- **LFU Cache**: Optimized session caching for high performance
- **Advanced Security**: Device-bound session validation with configurable modes
- **Zod Validation**: Input sanitization and validation for all routes
- **Email System**: i18n template support for notifications
- **Croner Integration**: Cron job scheduling and management
- **Rate Limiting**: Configurable request throttling
- **TypeScript**: Full type safety throughout the application

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- Database (PostgreSQL, MySQL, or LibSQL)
- Flowless backend instance

### Installation

1. Clone or copy the FLOWFULL template:
```bash
cd flowfull
```

2. Install dependencies:
```bash
bun install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the development server:
```bash
bun run dev
```

The API will be available at `http://localhost:3001`

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

## Template Usage

FLOWFULL is designed as a template for building backend APIs. To use it:

1. Copy the template to your project
2. Update package.json with your project details
3. Configure environment variables for your use case
4. Add your specific routes and business logic
5. Customize authentication and validation as needed
6. Deploy to your preferred platform

## License

MIT License - Feel free to use this template for your projects.
