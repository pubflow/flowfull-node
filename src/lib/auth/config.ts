// Authentication Configuration
export interface AuthConfig {
  // Backend URLs
  FLOWLESS_API_URL: string;
  BRIDGE_VALIDATION_SECRET: string;
  
  // Cache settings
  USER_CACHE_TTL: number;
  USER_CACHE_REVALIDATE: number;
  USER_CACHE_MAX_ENTRIES: number;
  CACHE_SECRET_KEY?: string;
  
  // Security settings
  REQUEST_TIMEOUT: number;
  MAX_AUTH_ATTEMPTS: number;
  
  // User type restrictions
  ADMIN_USER_TYPES: string[];
  USER_USER_TYPES: string[];
  GUEST_USER_TYPES: string[];
}

/**
 * Get authentication configuration from environment variables
 */
export function getAuthConfig(): AuthConfig {
  const config: AuthConfig = {
    // Backend URLs
    FLOWLESS_API_URL: process.env.FLOWLESS_API_URL || '',
    BRIDGE_VALIDATION_SECRET: process.env.BRIDGE_VALIDATION_SECRET || '',
    
    // Cache settings (in milliseconds)
    USER_CACHE_TTL: parseInt(process.env.USER_CACHE_TTL || '600000'), // 10 minutes
    USER_CACHE_REVALIDATE: parseInt(process.env.USER_CACHE_REVALIDATE || '180000'), // 3 minutes
    USER_CACHE_MAX_ENTRIES: parseInt(process.env.USER_CACHE_MAX_ENTRIES || '500'),
    CACHE_SECRET_KEY: process.env.CACHE_SECRET_KEY,
    
    // Security settings
    REQUEST_TIMEOUT: parseInt(process.env.AUTH_REQUEST_TIMEOUT || '5000'), // 5 seconds
    MAX_AUTH_ATTEMPTS: parseInt(process.env.MAX_AUTH_ATTEMPTS || '5'),
    
    // User type restrictions
    ADMIN_USER_TYPES: (process.env.ADMIN_USER_TYPES || 'admin').split(',').map(s => s.trim()),
    USER_USER_TYPES: (process.env.USER_USER_TYPES || 'admin,user,premium').split(',').map(s => s.trim()),
    GUEST_USER_TYPES: (process.env.GUEST_USER_TYPES || 'admin,user,guest').split(',').map(s => s.trim())
  };

  // Validate required configuration
  if (!config.FLOWLESS_API_URL) {
    throw new Error('FLOWLESS_API_URL environment variable is required');
  }
  
  if (!config.BRIDGE_VALIDATION_SECRET) {
    throw new Error('BRIDGE_VALIDATION_SECRET environment variable is required');
  }

  return config;
}

/**
 * Route permission configuration
 */
export interface RoutePermission {
  allowedUserTypes: string[];
  requireAuth: boolean;
  ownershipCheck?: boolean;
  adminOnly?: boolean;
}

/**
 * Default route permissions
 */
export const DEFAULT_ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  // Admin routes
  '/bridge-payment/admin/*': {
    allowedUserTypes: ['admin', 'super_admin'],
    requireAuth: true,
    adminOnly: true
  },
  
  // User routes (own resources)
  '/bridge-payment/payments': {
    allowedUserTypes: ['admin', 'user', 'guest'],
    requireAuth: false, // Optional auth
    ownershipCheck: true
  },
  
  '/bridge-payment/payments/:id': {
    allowedUserTypes: ['admin', 'user', 'guest'],
    requireAuth: true,
    ownershipCheck: true
  },
  
  // Public routes
  '/bridge-payment/payments/intents': {
    allowedUserTypes: ['admin', 'user', 'guest', 'anonymous'],
    requireAuth: false
  },
  
  '/bridge-payment/webhooks/*': {
    allowedUserTypes: ['anonymous'],
    requireAuth: false
  },
  
  '/health': {
    allowedUserTypes: ['anonymous'],
    requireAuth: false
  }
};

/**
 * Get route permission for a given path
 */
export function getRoutePermission(path: string): RoutePermission | null {
  // Exact match first
  if (DEFAULT_ROUTE_PERMISSIONS[path]) {
    return DEFAULT_ROUTE_PERMISSIONS[path];
  }
  
  // Pattern matching
  for (const [pattern, permission] of Object.entries(DEFAULT_ROUTE_PERMISSIONS)) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
      if (regex.test(path)) {
        return permission;
      }
    }
  }
  
  return null;
}

/**
 * Rate limiting configuration by user type
 */
export const RATE_LIMITS = {
  admin: { requests: 1000, window: 15 * 60 * 1000 }, // 1000 req/15min
  user: { requests: 500, window: 15 * 60 * 1000 },   // 500 req/15min
  guest: { requests: 100, window: 15 * 60 * 1000 },  // 100 req/15min
  anonymous: { requests: 50, window: 15 * 60 * 1000 } // 50 req/15min
};

/**
 * Security audit configuration
 */
export const SECURITY_CONFIG = {
  // Maximum cache entries before triggering cleanup
  MAX_CACHE_SIZE_WARNING: 400,
  
  // Maximum hit count before flagging as suspicious
  MAX_HIT_COUNT_WARNING: 1000,
  
  // Audit interval (in milliseconds)
  AUDIT_INTERVAL: 5 * 60 * 1000, // 5 minutes
  
  // Log security events
  LOG_SECURITY_EVENTS: process.env.LOG_SECURITY_EVENTS !== 'false',
  
  // Enable security monitoring
  ENABLE_SECURITY_MONITORING: process.env.ENABLE_SECURITY_MONITORING !== 'false'
};

export default {
  getAuthConfig,
  DEFAULT_ROUTE_PERMISSIONS,
  getRoutePermission,
  RATE_LIMITS,
  SECURITY_CONFIG
};
