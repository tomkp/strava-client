/**
 * Strava API Error Classes
 * Comprehensive error handling for Strava API operations
 */

// ============================================================================
// Error Response Interface
// ============================================================================

/**
 * Represents an error response from the Strava API
 */
export interface StravaErrorResponse {
  status: number;
  data?: { message?: string; errors?: unknown };
  headers: Headers;
  context?: string;
}

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Base error class for all Strava API errors
 */
export class StravaError extends Error {
  public readonly statusCode?: number;
  public readonly code: string;
  public readonly context?: string;

  constructor(message: string, code: string = "STRAVA_ERROR", statusCode?: number) {
    super(message);
    this.name = "StravaError";
    this.code = code;
    this.statusCode = statusCode;
    // Capture stack trace if available (V8 engines like Node.js)
    const errorConstructor = Error as typeof Error & {
      captureStackTrace?: (
        target: object,
        constructor: new (...args: unknown[]) => unknown
      ) => void;
    };
    if (typeof errorConstructor.captureStackTrace === "function") {
      errorConstructor.captureStackTrace(this, this.constructor);
    }
  }
}

// ============================================================================
// Specific Error Classes
// ============================================================================

/**
 * Authentication error (401)
 */
export class StravaAuthenticationError extends StravaError {
  constructor(message: string = "Authentication failed") {
    super(message, "STRAVA_AUTH_ERROR", 401);
  }
}

/**
 * Authorization error (403)
 */
export class StravaAuthorizationError extends StravaError {
  constructor(message: string = "Access denied - insufficient permissions") {
    super(message, "STRAVA_AUTHORIZATION_ERROR", 403);
  }
}

/**
 * Resource not found error (404)
 */
export class StravaNotFoundError extends StravaError {
  constructor(message: string = "Resource not found") {
    super(message, "STRAVA_NOT_FOUND", 404);
  }
}

/**
 * Rate limit exceeded error (429)
 */
export class StravaRateLimitError extends StravaError {
  public readonly retryAfter?: number;
  public readonly limit?: string;
  public readonly usage?: string;

  constructor(
    message: string = "Rate limit exceeded",
    retryAfter?: number,
    limit?: string,
    usage?: string
  ) {
    super(message, "STRAVA_RATE_LIMIT", 429);
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.usage = usage;
  }
}

/**
 * Token refresh error
 */
export class StravaTokenRefreshError extends StravaError {
  constructor(message: string = "Failed to refresh access token") {
    super(message, "STRAVA_TOKEN_REFRESH_ERROR", 401);
  }
}

/**
 * Validation error (400)
 */
export class StravaValidationError extends StravaError {
  constructor(message: string = "Invalid request parameters") {
    super(message, "STRAVA_VALIDATION_ERROR", 400);
  }
}

/**
 * Network error
 */
export class StravaNetworkError extends StravaError {
  constructor(message: string = "Network request failed") {
    super(message, "STRAVA_NETWORK_ERROR");
  }
}

/**
 * API error (5xx)
 */
export class StravaApiError extends StravaError {
  constructor(message: string = "Strava API error", statusCode: number = 500) {
    super(message, "STRAVA_API_ERROR", statusCode);
  }
}

// ============================================================================
// Error Parser
// ============================================================================

/**
 * Parse error response into appropriate StravaError
 */
export function parseStravaError(
  error: StravaErrorResponse | StravaError | Error | unknown
): StravaError {
  // Already a StravaError
  if (error instanceof StravaError) {
    return error;
  }

  // Fetch error response
  if (isStravaErrorResponse(error)) {
    const { status, data, headers, context } = error;
    const message = data?.message || `Request failed with status ${status}`;

    // Rate limit error
    if (status === 429) {
      const retryAfterHeader = headers.get("retry-after");
      return new StravaRateLimitError(
        message,
        retryAfterHeader ? parseInt(retryAfterHeader) : undefined,
        headers.get("x-ratelimit-limit") ?? undefined,
        headers.get("x-ratelimit-usage") ?? undefined
      );
    }

    // Authentication error
    if (status === 401) {
      return new StravaAuthenticationError(message);
    }

    // Authorization error
    if (status === 403) {
      return new StravaAuthorizationError(message);
    }

    // Not found error
    if (status === 404) {
      return new StravaNotFoundError(message);
    }

    // Validation error
    if (status === 400) {
      return new StravaValidationError(message);
    }

    // Server errors
    if (status >= 500) {
      return new StravaApiError(message, status);
    }

    // Other HTTP errors
    return new StravaError(
      context ? `${context}: ${message}` : message,
      "STRAVA_HTTP_ERROR",
      status
    );
  }

  // Standard Error
  if (error instanceof Error) {
    return new StravaError(error.message, "STRAVA_ERROR");
  }

  // Unknown error type
  return new StravaError(String(error), "STRAVA_UNKNOWN_ERROR");
}

/**
 * Type guard for StravaErrorResponse
 */
function isStravaErrorResponse(error: unknown): error is StravaErrorResponse {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as StravaErrorResponse).status === "number" &&
    "headers" in error &&
    (error as StravaErrorResponse).headers instanceof Headers
  );
}

/**
 * Check if error is a specific type
 */
export function isStravaErrorType<T extends StravaError>(
  error: unknown,
  ErrorClass: new (...args: unknown[]) => T
): error is T {
  return error instanceof ErrorClass;
}
