import { describe, it, expect } from "vitest";
import {
  StravaError,
  StravaAuthenticationError,
  StravaAuthorizationError,
  StravaNotFoundError,
  StravaRateLimitError,
  StravaTokenRefreshError,
  StravaValidationError,
  StravaNetworkError,
  StravaApiError,
  parseStravaError,
  isStravaErrorType,
} from "./errors";

describe("Error Classes", () => {
  describe("StravaError", () => {
    it("should create base error with message and code", () => {
      const error = new StravaError("Test error", "TEST_CODE", 500);

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe("StravaError");
    });

    it("should use default code when not provided", () => {
      const error = new StravaError("Test error");

      expect(error.code).toBe("STRAVA_ERROR");
    });
  });

  describe("StravaAuthenticationError", () => {
    it("should have correct properties", () => {
      const error = new StravaAuthenticationError();

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe("STRAVA_AUTH_ERROR");
      expect(error.message).toBe("Authentication failed");
    });

    it("should accept custom message", () => {
      const error = new StravaAuthenticationError("Token expired");

      expect(error.message).toBe("Token expired");
    });
  });

  describe("StravaAuthorizationError", () => {
    it("should have correct properties", () => {
      const error = new StravaAuthorizationError();

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("STRAVA_AUTHORIZATION_ERROR");
    });
  });

  describe("StravaNotFoundError", () => {
    it("should have correct properties", () => {
      const error = new StravaNotFoundError();

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("STRAVA_NOT_FOUND");
    });
  });

  describe("StravaRateLimitError", () => {
    it("should have correct properties", () => {
      const error = new StravaRateLimitError("Rate exceeded", 900, "100,1000", "100,500");

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe("STRAVA_RATE_LIMIT");
      expect(error.retryAfter).toBe(900);
      expect(error.limit).toBe("100,1000");
      expect(error.usage).toBe("100,500");
    });
  });

  describe("StravaTokenRefreshError", () => {
    it("should have correct properties", () => {
      const error = new StravaTokenRefreshError();

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe("STRAVA_TOKEN_REFRESH_ERROR");
    });
  });

  describe("StravaValidationError", () => {
    it("should have correct properties", () => {
      const error = new StravaValidationError();

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("STRAVA_VALIDATION_ERROR");
    });
  });

  describe("StravaNetworkError", () => {
    it("should have correct properties", () => {
      const error = new StravaNetworkError();

      expect(error.statusCode).toBeUndefined();
      expect(error.code).toBe("STRAVA_NETWORK_ERROR");
    });
  });

  describe("StravaApiError", () => {
    it("should have correct properties", () => {
      const error = new StravaApiError("Server error", 503);

      expect(error.statusCode).toBe(503);
      expect(error.code).toBe("STRAVA_API_ERROR");
    });
  });
});

describe("parseStravaError", () => {
  it("should return StravaError as-is", () => {
    const original = new StravaAuthenticationError("Original");
    const parsed = parseStravaError(original);

    expect(parsed).toBe(original);
  });

  it("should parse 401 response", () => {
    const response = {
      status: 401,
      data: { message: "Invalid token" },
      headers: new Headers(),
    };

    const error = parseStravaError(response);

    expect(error).toBeInstanceOf(StravaAuthenticationError);
    expect(error.message).toBe("Invalid token");
  });

  it("should parse 403 response", () => {
    const response = {
      status: 403,
      data: { message: "Access denied" },
      headers: new Headers(),
    };

    const error = parseStravaError(response);

    expect(error).toBeInstanceOf(StravaAuthorizationError);
  });

  it("should parse 404 response", () => {
    const response = {
      status: 404,
      data: { message: "Activity not found" },
      headers: new Headers(),
    };

    const error = parseStravaError(response);

    expect(error).toBeInstanceOf(StravaNotFoundError);
  });

  it("should parse 429 response with rate limit headers", () => {
    const headers = new Headers({
      "retry-after": "900",
      "x-ratelimit-limit": "100,1000",
      "x-ratelimit-usage": "100,500",
    });

    const response = {
      status: 429,
      data: { message: "Rate limit exceeded" },
      headers,
    };

    const error = parseStravaError(response) as StravaRateLimitError;

    expect(error).toBeInstanceOf(StravaRateLimitError);
    expect(error.retryAfter).toBe(900);
    expect(error.limit).toBe("100,1000");
    expect(error.usage).toBe("100,500");
  });

  it("should parse 400 response", () => {
    const response = {
      status: 400,
      data: { message: "Invalid parameters" },
      headers: new Headers(),
    };

    const error = parseStravaError(response);

    expect(error).toBeInstanceOf(StravaValidationError);
  });

  it("should parse 5xx response", () => {
    const response = {
      status: 503,
      data: { message: "Service unavailable" },
      headers: new Headers(),
    };

    const error = parseStravaError(response);

    expect(error).toBeInstanceOf(StravaApiError);
    expect(error.statusCode).toBe(503);
  });

  it("should wrap standard Error", () => {
    const original = new Error("Something went wrong");
    const error = parseStravaError(original);

    expect(error).toBeInstanceOf(StravaError);
    expect(error.message).toBe("Something went wrong");
  });

  it("should handle unknown error types", () => {
    const error = parseStravaError("string error");

    expect(error).toBeInstanceOf(StravaError);
    expect(error.message).toBe("string error");
    expect(error.code).toBe("STRAVA_UNKNOWN_ERROR");
  });
});

describe("isStravaErrorType", () => {
  it("should correctly identify error types", () => {
    const authError = new StravaAuthenticationError();
    const networkError = new StravaNetworkError();

    expect(isStravaErrorType(authError, StravaAuthenticationError)).toBe(true);
    expect(isStravaErrorType(authError, StravaNetworkError)).toBe(false);
    expect(isStravaErrorType(networkError, StravaNetworkError)).toBe(true);
  });

  it("should return false for non-StravaError", () => {
    expect(isStravaErrorType(new Error("test"), StravaAuthenticationError)).toBe(false);
    expect(isStravaErrorType(null, StravaAuthenticationError)).toBe(false);
  });
});
