// Response Formatter - Standardized API Response Format
export interface ResponseMeta {
  query?: string;
  page: number;
  limit: number;
  total: number;
  hasMore?: boolean;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export interface UserContext {
  authenticated: boolean;
  user_id?: string;
  user_type?: string;
  user_email?: string;
  search_method?: string;
  guest_access?: boolean;
  guest_email?: string;
  token_provided?: boolean;
  access_method?: string;
  is_owner?: boolean;
  is_admin?: boolean;
  message?: string;
}

export interface StandardResponse<T> {
  success: boolean;
  data: T | { rows: T };
  meta: ResponseMeta;
  user_context?: UserContext;
}

export interface ErrorResponse {
  error: string;
  details: string;
}

/**
 * Format successful response with standard structure
 */
export function formatResponse<T>(
  data: T,
  meta: ResponseMeta,
  userContext?: UserContext
): StandardResponse<T> {
  const isRowMode = process.env.ROW_MODE === 'true';
  
  // Calculate hasMore if not provided
  const hasMore = meta.hasMore !== undefined 
    ? meta.hasMore 
    : meta.page * meta.limit < meta.total;
  
  const response: StandardResponse<T> = {
    success: true,
    data: isRowMode ? { rows: data } : data,
    meta: {
      query: meta.query || '',
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      hasMore,
      ...(meta.orderBy && { orderBy: meta.orderBy }),
      ...(meta.orderDir && { orderDir: meta.orderDir })
    }
  };

  // Only include user_context if provided
  if (userContext) {
    response.user_context = userContext;
  }

  return response;
}

/**
 * Format error response with standard structure
 */
export function formatError(error: string, details: string): ErrorResponse {
  return {
    error,
    details
  };
}

/**
 * Validate and sanitize order parameters
 */
export function validateOrderParams(
  orderBy?: string,
  orderDir?: string,
  validFields: string[] = ['created_at', 'amount_cents', 'status']
): { orderBy: string; orderDir: 'asc' | 'desc' } {
  const validOrderBy = validFields.includes(orderBy || '') ? orderBy! : 'created_at';
  const validOrderDir = orderDir === 'asc' ? 'asc' : 'desc';
  
  return {
    orderBy: validOrderBy,
    orderDir: validOrderDir
  };
}

/**
 * Validate and sanitize pagination parameters
 */
export function validatePaginationParams(
  page?: string,
  limit?: string,
  maxLimit: number = 50
): { page: number; limit: number } {
  const validPage = Math.max(1, parseInt(page || '1') || 1);
  const validLimit = Math.min(maxLimit, Math.max(1, parseInt(limit || '10') || 10));
  
  return {
    page: validPage,
    limit: validLimit
  };
}
