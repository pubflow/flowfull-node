# 🔧 VALIDATION_MODE Technical Specification

## 📋 **Core Implementation Files**

### **1. Enhanced Auth Config (`src/lib/auth/config.ts`)**

```typescript
// Add to existing AuthConfig interface
export interface AuthConfig {
  // ... existing properties
  
  // New validation mode properties
  VALIDATION_MODE: ValidationModeType;
  SECURITY_CONFIG?: SecurityConfig;
  CACHE_CONFIG?: CacheConfig;
  AUDIT_CONFIG?: AuditConfig;
  ENABLE_VALIDATION_MODE: boolean;
}

// New validation mode types
export type ValidationModeType = 'DISABLED' | 'STANDARD' | 'ADVANCED' | 'STRICT' | 'CUSTOM';

export interface SecurityConfig {
  ip_validation: boolean;
  user_agent_validation: boolean;
  device_fingerprinting: boolean;
  session_binding: boolean;
  auto_invalidate: boolean;
  log_violations: boolean;
  max_violations: number;
  violation_window: number; // in milliseconds
}

export interface CacheConfig {
  enabled: boolean;
  ttl_multiplier: number;
  max_entries: number;
  validation_interval: number;
  bypass_on_violations: boolean;
  smart_invalidation: boolean;
}

export interface AuditConfig {
  enabled: boolean;
  log_violations: boolean;
  log_validations: boolean;
  audit_interval: number;
  max_audit_entries: number;
}

// Enhanced getAuthConfig function
export function getAuthConfig(): AuthConfig {
  const config: AuthConfig = {
    // ... existing config
    
    // New validation mode config
    VALIDATION_MODE: (process.env.VALIDATION_MODE as ValidationModeType) || 'STANDARD',
    ENABLE_VALIDATION_MODE: process.env.ENABLE_VALIDATION_MODE !== 'false',
    
    // Parse JSON configs with defaults
    SECURITY_CONFIG: parseSecurityConfig(),
    CACHE_CONFIG: parseCacheConfig(),
    AUDIT_CONFIG: parseAuditConfig()
  };
  
  return config;
}

function parseSecurityConfig(): SecurityConfig {
  const defaultConfig: SecurityConfig = {
    ip_validation: true,
    user_agent_validation: true,
    device_fingerprinting: false,
    session_binding: true,
    auto_invalidate: false,
    log_violations: true,
    max_violations: 5,
    violation_window: 15 * 60 * 1000 // 15 minutes
  };
  
  try {
    const envConfig = process.env.SECURITY_CONFIG;
    if (envConfig) {
      return { ...defaultConfig, ...JSON.parse(envConfig) };
    }
  } catch (error) {
    console.warn('Failed to parse SECURITY_CONFIG, using defaults');
  }
  
  return defaultConfig;
}

function parseCacheConfig(): CacheConfig {
  const defaultConfig: CacheConfig = {
    enabled: true,
    ttl_multiplier: 1.0,
    max_entries: 500,
    validation_interval: 5 * 60 * 1000, // 5 minutes
    bypass_on_violations: false,
    smart_invalidation: true
  };
  
  try {
    const envConfig = process.env.CACHE_CONFIG;
    if (envConfig) {
      return { ...defaultConfig, ...JSON.parse(envConfig) };
    }
  } catch (error) {
    console.warn('Failed to parse CACHE_CONFIG, using defaults');
  }
  
  return defaultConfig;
}

function parseAuditConfig(): AuditConfig {
  const defaultConfig: AuditConfig = {
    enabled: true,
    log_violations: true,
    log_validations: false,
    audit_interval: 10 * 60 * 1000, // 10 minutes
    max_audit_entries: 1000
  };
  
  try {
    const envConfig = process.env.AUDIT_CONFIG;
    if (envConfig) {
      return { ...defaultConfig, ...JSON.parse(envConfig) };
    }
  } catch (error) {
    console.warn('Failed to parse AUDIT_CONFIG, using defaults');
  }
  
  return defaultConfig;
}
```

### **2. Validation Mode Core (`src/lib/auth/validation-mode.ts`)**

```typescript
import { AuthConfig, ValidationModeType, SecurityConfig } from './config';
import { SecurityValidator } from './security-validator';
import { AuditLogger } from './audit-logger';
import { UserContext } from '../utils/user-context';

export interface ValidationResult {
  valid: boolean;
  violations: SecurityViolation[];
  metadata: ValidationMetadata;
  action: 'allow' | 'deny' | 'invalidate';
}

export interface SecurityViolation {
  type: 'ip_mismatch' | 'user_agent_mismatch' | 'device_mismatch' | 'session_binding_failure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
}

export interface ValidationMetadata {
  ip_address: string;
  user_agent: string;
  device_fingerprint?: string;
  session_binding_id?: string;
  last_validation: string;
  violation_count: number;
  validation_mode: ValidationModeType;
}

export class ValidationMode {
  private config: AuthConfig;
  private securityValidator: SecurityValidator;
  private auditLogger: AuditLogger;
  private violationTracker: Map<string, number> = new Map();

  constructor(config: AuthConfig) {
    this.config = config;
    this.securityValidator = new SecurityValidator(config.SECURITY_CONFIG!);
    this.auditLogger = new AuditLogger(config.AUDIT_CONFIG!);
  }

  isEnabled(): boolean {
    return this.config.ENABLE_VALIDATION_MODE && this.config.VALIDATION_MODE !== 'DISABLED';
  }

  async validateRequest(
    request: any, 
    userContext: UserContext, 
    cachedData?: any
  ): Promise<ValidationResult> {
    if (!this.isEnabled()) {
      return {
        valid: true,
        violations: [],
        metadata: this.createBasicMetadata(request, userContext),
        action: 'allow'
      };
    }

    const violations: SecurityViolation[] = [];
    const metadata = this.createValidationMetadata(request, userContext);

    // Apply validation based on mode
    switch (this.config.VALIDATION_MODE) {
      case 'STANDARD':
        violations.push(...await this.validateStandard(request, userContext, cachedData));
        break;
      case 'ADVANCED':
        violations.push(...await this.validateAdvanced(request, userContext, cachedData));
        break;
      case 'STRICT':
        violations.push(...await this.validateStrict(request, userContext, cachedData));
        break;
      case 'CUSTOM':
        violations.push(...await this.validateCustom(request, userContext, cachedData));
        break;
    }

    // Determine action based on violations
    const action = this.determineAction(violations, userContext);
    
    // Track violations
    if (violations.length > 0) {
      this.trackViolations(userContext.user?.id || 'anonymous', violations);
    }

    // Log audit trail
    await this.auditLogger.logValidation({
      userContext,
      violations,
      action,
      metadata,
      timestamp: new Date().toISOString()
    });

    return {
      valid: action === 'allow',
      violations,
      metadata,
      action
    };
  }

  private async validateStandard(
    request: any, 
    userContext: UserContext, 
    cachedData?: any
  ): Promise<SecurityViolation[]> {
    const violations: SecurityViolation[] = [];

    // IP validation
    if (this.config.SECURITY_CONFIG?.ip_validation) {
      const ipViolation = await this.securityValidator.validateIP(request, cachedData);
      if (ipViolation) violations.push(ipViolation);
    }

    // User-Agent validation
    if (this.config.SECURITY_CONFIG?.user_agent_validation) {
      const uaViolation = await this.securityValidator.validateUserAgent(request, cachedData);
      if (uaViolation) violations.push(uaViolation);
    }

    return violations;
  }

  private async validateAdvanced(
    request: any, 
    userContext: UserContext, 
    cachedData?: any
  ): Promise<SecurityViolation[]> {
    const violations = await this.validateStandard(request, userContext, cachedData);

    // Device fingerprinting
    if (this.config.SECURITY_CONFIG?.device_fingerprinting) {
      const deviceViolation = await this.securityValidator.validateDevice(request, cachedData);
      if (deviceViolation) violations.push(deviceViolation);
    }

    return violations;
  }

  private async validateStrict(
    request: any, 
    userContext: UserContext, 
    cachedData?: any
  ): Promise<SecurityViolation[]> {
    const violations = await this.validateAdvanced(request, userContext, cachedData);

    // Session binding validation
    if (this.config.SECURITY_CONFIG?.session_binding) {
      const bindingViolation = await this.securityValidator.validateSessionBinding(request, cachedData);
      if (bindingViolation) violations.push(bindingViolation);
    }

    return violations;
  }

  private async validateCustom(
    request: any, 
    userContext: UserContext, 
    cachedData?: any
  ): Promise<SecurityViolation[]> {
    // Custom validation logic based on SECURITY_CONFIG
    return await this.securityValidator.validateCustom(request, userContext, cachedData);
  }

  private determineAction(violations: SecurityViolation[], userContext: UserContext): 'allow' | 'deny' | 'invalidate' {
    if (violations.length === 0) return 'allow';

    const criticalViolations = violations.filter(v => v.severity === 'critical');
    const highViolations = violations.filter(v => v.severity === 'high');

    // Auto-invalidate on critical violations
    if (criticalViolations.length > 0 && this.config.SECURITY_CONFIG?.auto_invalidate) {
      return 'invalidate';
    }

    // Check violation count threshold
    const userId = userContext.user?.id || 'anonymous';
    const violationCount = this.violationTracker.get(userId) || 0;
    
    if (violationCount >= (this.config.SECURITY_CONFIG?.max_violations || 5)) {
      return this.config.SECURITY_CONFIG?.auto_invalidate ? 'invalidate' : 'deny';
    }

    // Allow with warnings for low/medium violations
    return 'allow';
  }

  private trackViolations(userId: string, violations: SecurityViolation[]): void {
    const currentCount = this.violationTracker.get(userId) || 0;
    this.violationTracker.set(userId, currentCount + violations.length);

    // Clean up old violation counts periodically
    setTimeout(() => {
      this.violationTracker.delete(userId);
    }, this.config.SECURITY_CONFIG?.violation_window || 15 * 60 * 1000);
  }

  private createValidationMetadata(request: any, userContext: UserContext): ValidationMetadata {
    return {
      ip_address: this.extractIP(request),
      user_agent: this.extractUserAgent(request),
      device_fingerprint: this.extractDeviceFingerprint(request),
      session_binding_id: userContext.session?.id,
      last_validation: new Date().toISOString(),
      violation_count: this.violationTracker.get(userContext.user?.id || 'anonymous') || 0,
      validation_mode: this.config.VALIDATION_MODE
    };
  }

  private createBasicMetadata(request: any, userContext: UserContext): ValidationMetadata {
    return {
      ip_address: this.extractIP(request),
      user_agent: this.extractUserAgent(request),
      last_validation: new Date().toISOString(),
      violation_count: 0,
      validation_mode: this.config.VALIDATION_MODE
    };
  }

  private extractIP(request: any): string {
    return request.header?.('CF-Connecting-IP') || 
           request.header?.('X-Forwarded-For') || 
           request.header?.('X-Real-IP') || 
           'unknown';
  }

  private extractUserAgent(request: any): string {
    return request.header?.('User-Agent') || 'unknown';
  }

  private extractDeviceFingerprint(request: any): string | undefined {
    return request.header?.('X-Device-Fingerprint');
  }
}
```

## 🔄 **Integration Points**

### **1. Enhanced User Cache Integration**

The validation mode will integrate with the existing LRU cache system by:

1. **Wrapping existing cache methods** with validation logic
2. **Adding validation metadata** to cached entries
3. **Implementing smart invalidation** based on security violations
4. **Maintaining backward compatibility** with existing cache API

### **2. Middleware Integration**

The validation mode will enhance the existing auth middleware by:

1. **Adding validation checks** before cache lookups
2. **Enriching user context** with validation metadata
3. **Implementing violation tracking** across requests
4. **Providing audit trails** for security events

### **3. Performance Optimization**

To minimize performance impact:

1. **Lazy validation** - Only validate when necessary
2. **Cached validation results** - Avoid redundant checks
3. **Configurable intervals** - Balance security vs performance
4. **Smart caching strategies** - Adapt cache behavior to validation mode

---

*This technical specification provides the foundation for implementing the validation mode system while maintaining full compatibility with existing bridge-payments infrastructure.*
