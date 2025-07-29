// Session Security Validator (Simplified)

export interface SessionSecurityData {
  ipAddress: string;
  userAgent?: string;
  userDevice?: string;
}

export interface SecurityViolation {
  type: 'IP_MISMATCH' | 'USER_AGENT_MISMATCH' | 'DEVICE_MISMATCH';
  expected: string;
  actual: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: string;
}

export class SessionSecurityValidator {

  static validateSession(
    storedSession: SessionSecurityData,
    currentRequest: SessionSecurityData,
    ipValidation: boolean,
    userAgentValidation: boolean,
    deviceValidation: boolean
  ): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    // 1. Validación de IP
    if (ipValidation && storedSession.ipAddress !== currentRequest.ipAddress) {
      violations.push({
        type: 'IP_MISMATCH',
        expected: storedSession.ipAddress,
        actual: currentRequest.ipAddress,
        severity: 'HIGH',
        timestamp: new Date().toISOString()
      });
    }

    // 2. Validación de User-Agent
    if (userAgentValidation &&
        storedSession.userAgent &&
        currentRequest.userAgent &&
        storedSession.userAgent !== currentRequest.userAgent) {
      violations.push({
        type: 'USER_AGENT_MISMATCH',
        expected: storedSession.userAgent,
        actual: currentRequest.userAgent,
        severity: 'MEDIUM',
        timestamp: new Date().toISOString()
      });
    }

    // 3. Validación de Device
    if (deviceValidation &&
        storedSession.userDevice &&
        currentRequest.userDevice &&
        storedSession.userDevice !== currentRequest.userDevice) {
      violations.push({
        type: 'DEVICE_MISMATCH',
        expected: storedSession.userDevice,
        actual: currentRequest.userDevice,
        severity: 'MEDIUM',
        timestamp: new Date().toISOString()
      });
    }

    return violations;
  }
  
  static shouldInvalidateSession(violations: SecurityViolation[], autoInvalidate: boolean): boolean {
    if (!autoInvalidate || violations.length === 0) return false;

    // Solo violaciones HIGH invalidan la sesión
    return violations.some(v => v.severity === 'HIGH');
  }
  
  static formatViolationsForLog(violations: SecurityViolation[]): string[] {
    return violations.map(v => 
      `${v.type}: expected=${v.expected}, actual=${v.actual} (${v.severity})`
    );
  }
  
  static logViolations(violations: SecurityViolation[], sessionId: string, logViolations: boolean): void {
    if (!logViolations || violations.length === 0) return;

    const formattedViolations = this.formatViolationsForLog(violations);
    console.warn(`🚨 Security violations for session ${sessionId.substring(0, 8)}...:`);
    formattedViolations.forEach(violation => {
      console.warn(`  - ${violation}`);
    });
  }
  
  /**
   * Extract security data from request context
   */
  static extractSecurityData(request: any): SessionSecurityData {
    const ipAddress = this.extractClientIP(request);
    const userAgent = request.header?.('user-agent') || request.headers?.['user-agent'] || 'unknown';
    const userDevice = request.header?.('sec-ch-ua') || request.headers?.['sec-ch-ua'] || 'unknown';
    
    return {
      ipAddress,
      userAgent,
      userDevice
    };
  }
  
  /**
   * Extract client IP address from request
   */
  private static extractClientIP(request: any): string {
    // Try various headers for IP address
    const headers = request.headers || {};
    
    // Check common proxy headers
    const forwardedFor = headers['x-forwarded-for'];
    if (forwardedFor) {
      // Take the first IP in the chain
      return forwardedFor.split(',')[0].trim();
    }
    
    const realIP = headers['x-real-ip'];
    if (realIP) {
      return realIP;
    }
    
    const clientIP = headers['x-client-ip'];
    if (clientIP) {
      return clientIP;
    }
    
    // Fallback to connection remote address
    return request.ip || request.connection?.remoteAddress || 'unknown';
  }
}
