// Validation Mode System (Simplified)
import type { ValidationModeType } from './config';
import { getAuthConfig } from './config';
import { SessionSecurityValidator, type SessionSecurityData, type SecurityViolation } from './session-security';
import type { CachedUser } from './user-cache';

export interface ValidationContext {
  sessionId: string;
  request: any;
  cachedUser?: CachedUser;
  securityData: SessionSecurityData;
}

export interface ValidationResult {
  valid: boolean;
  violations: SecurityViolation[];
  action: 'allow' | 'deny' | 'invalidate' | 'revalidate';
  metadata: ValidationMetadata;
}

export interface ValidationMetadata {
  mode: ValidationModeType;
  timestamp: string;
  validationDuration: number;
  securityChecks: string[];
  cacheHit: boolean;
}

export class ValidationMode {
  private config: ReturnType<typeof getAuthConfig>;

  constructor() {
    this.config = getAuthConfig();
  }

  /**
   * Check if validation mode is enabled
   */
  isEnabled(): boolean {
    return this.config.ENABLE_VALIDATION_MODE && this.config.VALIDATION_MODE !== 'DISABLED';
  }

  /**
   * Get current validation mode
   */
  getMode(): ValidationModeType {
    return this.config.VALIDATION_MODE;
  }

  /**
   * Validate session based on current validation mode
   */
  async validateSession(context: ValidationContext): Promise<ValidationResult> {
    const startTime = Date.now();
    
    if (!this.isEnabled()) {
      return {
        valid: true,
        violations: [],
        action: 'allow',
        metadata: this.createMetadata(startTime, [], false)
      };
    }

    const violations: SecurityViolation[] = [];
    const securityChecks: string[] = [];

    try {
      // Apply validation based on mode
      violations.push(...this.validateByMode(context, securityChecks));

      // Determine action based on violations
      const action = this.determineAction(violations);

      // Log violations if configured
      if (violations.length > 0) {
        SessionSecurityValidator.logViolations(violations, context.sessionId, this.config.LOG_VIOLATIONS);
      }

      return {
        valid: action === 'allow',
        violations,
        action,
        metadata: this.createMetadata(startTime, securityChecks, !!context.cachedUser)
      };

    } catch (error) {
      console.error('Validation error:', error);
      return {
        valid: false,
        violations: [],
        action: 'deny',
        metadata: this.createMetadata(startTime, securityChecks, false)
      };
    }
  }

  /**
   * Validate by mode (Simplified)
   */
  private validateByMode(context: ValidationContext, securityChecks: string[]): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    if (!context.cachedUser) return violations;

    // Extract stored security data from cached user
    const storedSecurity: SessionSecurityData = {
      ipAddress: (context.cachedUser as any).ipAddress || 'unknown',
      userAgent: (context.cachedUser as any).userAgent,
      userDevice: (context.cachedUser as any).userDevice
    };

    // Determine validation settings based on mode
    let ipValidation = false;
    let userAgentValidation = false;
    let deviceValidation = false;

    switch (this.config.VALIDATION_MODE) {
      case 'DISABLED':
        // No validations
        break;
      case 'STANDARD':
        ipValidation = this.config.IP_VALIDATION;
        securityChecks.push('ip_validation');
        break;
      case 'ADVANCED':
        ipValidation = this.config.IP_VALIDATION;
        userAgentValidation = this.config.USER_AGENT_VALIDATION;
        deviceValidation = this.config.DEVICE_VALIDATION;
        securityChecks.push('ip_validation', 'user_agent_validation', 'device_validation');
        break;
      case 'STRICT':
        ipValidation = this.config.IP_VALIDATION;
        userAgentValidation = this.config.USER_AGENT_VALIDATION;
        deviceValidation = this.config.DEVICE_VALIDATION;
        securityChecks.push('ip_validation', 'user_agent_validation', 'device_validation', 'strict_mode');
        break;
    }

    // Apply validations
    const securityViolations = SessionSecurityValidator.validateSession(
      storedSecurity,
      context.securityData,
      ipValidation,
      userAgentValidation,
      deviceValidation
    );
    violations.push(...securityViolations);

    return violations;
  }

  /**
   * Determine action based on violations and configuration
   */
  private determineAction(violations: SecurityViolation[]): 'allow' | 'deny' | 'invalidate' | 'revalidate' {
    if (violations.length === 0) {
      return 'allow';
    }

    // Check if should auto-invalidate
    if (SessionSecurityValidator.shouldInvalidateSession(violations, this.config.AUTO_INVALIDATE)) {
      return 'invalidate';
    }

    // In strict mode, any violation denies access
    if (this.config.VALIDATION_MODE === 'STRICT') {
      return 'deny';
    }

    // For other modes, allow but log violations
    return 'allow';
  }

  /**
   * Create validation metadata
   */
  private createMetadata(startTime: number, securityChecks: string[], cacheHit: boolean): ValidationMetadata {
    return {
      mode: this.config.VALIDATION_MODE,
      timestamp: new Date().toISOString(),
      validationDuration: Date.now() - startTime,
      securityChecks,
      cacheHit
    };
  }
}

// Export singleton instance
export const validationMode = new ValidationMode();
