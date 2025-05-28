# Architecture Overview

## System Architecture

Bridge-Payments is designed as a microservice that handles payment processing while integrating securely with your existing Flowless authentication system.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Applications                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Web App   │  │ Mobile App  │  │   Admin     │             │
│  │ (React/Vue) │  │(React Native│  │  Dashboard  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway / Load Balancer                │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│     Flowless        │ │   Bridge-Payments   │ │   Other Services    │
│  (Auth & CRUD)      │ │  (Payment Service)  │ │                     │
│                     │ │                     │ │                     │
│ ┌─────────────────┐ │ │ ┌─────────────────┐ │ │                     │
│ │ Authentication  │ │ │ │ Payment Routes  │ │ │                     │
│ │ User Management │ │ │ │ Provider Adapts │ │ │                     │
│ │ Session Mgmt    │ │ │ │ Guest Checkout  │ │ │                     │
│ │ CRUD Operations │ │ │ │ Webhook Handler │ │ │                     │
│ └─────────────────┘ │ │ └─────────────────┘ │ │                     │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
          │                       │
          │                       ▼
          │             ┌─────────────────────┐
          │             │   Payment Database  │
          │             │   (PostgreSQL/      │
          │             │    MySQL/SQLite)    │
          │             └─────────────────────┘
          │
          ▼
┌─────────────────────┐
│   Main Database     │
│  (Users, Sessions,  │
│   Business Logic)   │
└─────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Payment Providers                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Stripe    │  │   PayPal    │  │Authorize.net│             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Authentication Bridge

**Purpose**: Validates user sessions with Flowless backend

```typescript
// Session validation flow
Client Request → Bridge-Payments → Flowless Validation → Response
```

**Components**:
- `BridgeValidator`: Handles session validation with Flowless
- `AuthMiddleware`: Protects routes and injects user context
- `GuestMiddleware`: Handles guest checkout flows

### 2. Payment Processing Engine

**Purpose**: Unified interface for multiple payment providers

```typescript
// Provider abstraction
PaymentRequest → ProviderAdapter → External Provider → Response
```

**Components**:
- `ProviderFactory`: Creates appropriate provider instances
- `ProviderAdapters`: Stripe, PayPal, Authorize.net implementations
- `PaymentManager`: Orchestrates payment flows

### 3. Database Layer

**Purpose**: Persistent storage with automatic cleanup

```typescript
// Database operations
API Request → Kysely Query Builder → Database → Response
```

**Components**:
- `DatabaseConnection`: Connection management
- `PaymentRepository`: Payment data operations
- `CleanupService`: Automatic client_secret cleanup

### 4. Webhook System

**Purpose**: Handles provider webhooks for payment updates

```typescript
// Webhook processing
Provider Webhook → Signature Validation → Event Processing → Database Update
```

## Data Flow Diagrams

### Authenticated User Payment Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Bridge    │    │  Flowless   │    │  Provider   │
│             │    │  Payments   │    │             │    │  (Stripe)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │                  │
       │ POST /payments   │                  │                  │
       │ + session_id     │                  │                  │
       ├─────────────────►│                  │                  │
       │                  │ Validate Session │                  │
       │                  ├─────────────────►│                  │
       │                  │ User Data        │                  │
       │                  │◄─────────────────┤                  │
       │                  │ Create Payment   │                  │
       │                  ├─────────────────────────────────────►│
       │                  │ Payment Intent   │                  │
       │                  │◄─────────────────────────────────────┤
       │ Payment Response │                  │                  │
       │◄─────────────────┤                  │                  │
       │                  │                  │                  │
```

### Guest Checkout Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Bridge    │    │  Provider   │
│             │    │  Payments   │    │  (Stripe)   │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       │ POST /payments   │                  │
       │ + guest_data     │                  │
       ├─────────────────►│                  │
       │                  │ Create Payment   │
       │                  ├─────────────────►│
       │                  │ Payment Intent   │
       │                  │◄─────────────────┤
       │ Payment Response │                  │
       │◄─────────────────┤                  │
       │                  │                  │
```

### Webhook Processing Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Provider   │    │   Bridge    │    │  Database   │
│  (Stripe)   │    │  Payments   │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       │ Webhook Event    │                  │
       ├─────────────────►│                  │
       │                  │ Verify Signature │
       │                  │                  │
       │                  │ Update Payment   │
       │                  ├─────────────────►│
       │                  │ Cleanup Secret   │
       │                  ├─────────────────►│
       │                  │ Success          │
       │                  │◄─────────────────┤
       │ 200 OK           │                  │
       │◄─────────────────┤                  │
```

## Security Architecture

### Multi-Layer Security

1. **Transport Security**: HTTPS/TLS encryption
2. **Authentication**: Session validation with Flowless
3. **Authorization**: Role-based access control
4. **Input Validation**: Comprehensive request validation
5. **Rate Limiting**: Protection against abuse
6. **Data Protection**: Automatic sensitive data cleanup

### Security Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                        Security Perimeter                       │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Application Layer                        │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │                  Business Logic                         │ │ │
│  │  │  ┌─────────────────────────────────────────────────────┐ │ │ │
│  │  │  │                Data Layer                           │ │ │ │
│  │  │  └─────────────────────────────────────────────────────┘ │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Scalability Considerations

### Horizontal Scaling

- **Stateless Design**: No server-side sessions
- **Database Connection Pooling**: Efficient resource usage
- **Load Balancer Ready**: Multiple instance support
- **Caching Strategy**: Reduced database load

### Performance Optimizations

- **Bun Runtime**: High-performance JavaScript runtime
- **Kysely ORM**: Type-safe, efficient queries
- **Connection Pooling**: Optimized database connections
- **Async Processing**: Non-blocking operations

## Error Handling Strategy

### Error Categories

1. **Validation Errors**: Invalid input data
2. **Authentication Errors**: Session validation failures
3. **Provider Errors**: Payment provider issues
4. **System Errors**: Database, network, or runtime errors

### Error Response Format

```typescript
{
  "error": {
    "code": "PAYMENT_FAILED",
    "message": "Payment could not be processed",
    "details": {
      "provider": "stripe",
      "provider_error": "card_declined"
    },
    "timestamp": "2024-01-15T10:00:00Z",
    "request_id": "req_123456"
  }
}
```

## Monitoring & Observability

### Metrics Collection

- **Request Metrics**: Response times, error rates
- **Payment Metrics**: Success rates, provider performance
- **System Metrics**: Memory usage, database connections
- **Business Metrics**: Revenue, conversion rates

### Logging Strategy

- **Structured Logging**: JSON format for easy parsing
- **Log Levels**: Error, warn, info, debug
- **Sensitive Data**: Automatic redaction of PII
- **Correlation IDs**: Request tracing across services

## Technology Stack Details

### Runtime & Framework

- **Bun**: High-performance JavaScript runtime
- **Hono**: Lightweight, fast web framework
- **TypeScript**: Type safety and developer experience

### Database & ORM

- **Kysely**: Type-safe SQL query builder
- **PostgreSQL/MySQL/SQLite**: Flexible database support
- **Connection Pooling**: Efficient resource management

### Payment Integration

- **Stripe**: Credit cards, digital wallets
- **PayPal**: PayPal accounts, credit cards
- **Authorize.net**: Credit cards, ACH

### Development Tools

- **Zod**: Runtime type validation
- **Nanoid**: Secure ID generation
- **ESLint/Prettier**: Code quality and formatting

## Next Steps

- **[Database Schema](./database.md)** - Detailed database design
- **[API Reference](./api-reference.md)** - Complete API documentation
- **[Authentication](./authentication.md)** - Flowless integration details
- **[Deployment](./deployment.md)** - Production deployment guide
