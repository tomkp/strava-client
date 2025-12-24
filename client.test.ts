import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StravaClient } from "./client";
import {
  StravaAuthenticationError,
  StravaRateLimitError,
  StravaNotFoundError,
  StravaNetworkError,
} from "./errors";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("StravaClient", () => {
  let client: StravaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new StravaClient({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000/callback",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Token Management", () => {
    it("should store and retrieve tokens", () => {
      const tokens = {
        accessToken: "access-123",
        refreshToken: "refresh-456",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      client.setTokens(tokens);
      expect(client.getTokens()).toEqual(tokens);
    });

    it("should clear tokens", () => {
      client.setTokens({
        accessToken: "access-123",
        refreshToken: "refresh-456",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      client.clearTokens();
      expect(client.getTokens()).toBeNull();
    });

    it("should validate tokens correctly", () => {
      // No tokens
      expect(client.hasValidTokens()).toBe(false);

      // Expired token
      client.setTokens({
        accessToken: "access-123",
        refreshToken: "refresh-456",
        expiresAt: Math.floor(Date.now() / 1000) - 100,
      });
      expect(client.hasValidTokens()).toBe(false);

      // Valid token
      client.setTokens({
        accessToken: "access-123",
        refreshToken: "refresh-456",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
      expect(client.hasValidTokens()).toBe(true);
    });
  });

  describe("OAuth URL Generation", () => {
    it("should generate authorization URL with default scope", () => {
      const url = client.getAuthorizationUrl();

      expect(url).toContain("https://www.strava.com/oauth/authorize");
      expect(url).toContain("client_id=test-client-id");
      expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback");
      expect(url).toContain("response_type=code");
      expect(url).toContain("scope=activity%3Aread_all");
    });

    it("should generate authorization URL with custom scope", () => {
      const url = client.getAuthorizationUrl("read,activity:write");

      expect(url).toContain("scope=read%2Cactivity%3Awrite");
    });

    it("should include state parameter when provided", () => {
      const url = client.getAuthorizationUrl("activity:read_all", {
        state: "my-state-123",
      });

      expect(url).toContain("state=my-state-123");
    });

    it("should throw error if redirectUri not configured", () => {
      const clientWithoutRedirect = new StravaClient({
        clientId: "test",
        clientSecret: "test",
      });

      expect(() => clientWithoutRedirect.getAuthorizationUrl()).toThrow("Redirect URI is required");
    });
  });

  describe("API Requests", () => {
    beforeEach(() => {
      client.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
    });

    it("should make authenticated GET request", async () => {
      const mockAthlete = { id: 123, firstname: "John", lastname: "Doe" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAthlete),
        headers: new Headers(),
      });

      const result = await client.getAthlete();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.strava.com/api/v3/athlete",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer valid-token",
          }),
        })
      );
      expect(result).toEqual(mockAthlete);
    });

    it("should include query parameters in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      });

      await client.getActivities({ page: 2, per_page: 50 });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("page=2"), expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("per_page=50"),
        expect.any(Object)
      );
    });

    it("should throw error when no token available", async () => {
      client.clearTokens();

      await expect(client.getAthlete()).rejects.toThrow("No access token available");
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      client.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
    });

    it("should throw StravaAuthenticationError on 401", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: "Unauthorized" }),
        headers: new Headers(),
      });

      await expect(client.getAthlete()).rejects.toThrow(StravaAuthenticationError);
    });

    it("should throw StravaNotFoundError on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: "Not found" }),
        headers: new Headers(),
      });

      await expect(client.getActivity(99999)).rejects.toThrow(StravaNotFoundError);
    });

    it("should throw StravaRateLimitError on 429", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ message: "Rate limit exceeded" }),
        headers: new Headers({
          "retry-after": "900",
          "x-ratelimit-limit": "100,1000",
          "x-ratelimit-usage": "100,500",
        }),
      });

      await expect(client.getAthlete()).rejects.toThrow(StravaRateLimitError);
    });

    it("should throw StravaNetworkError on timeout", async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          })
      );

      await expect(client.getAthlete()).rejects.toThrow(StravaNetworkError);
    });

    it("should use custom timeout from config", async () => {
      const customTimeoutClient = new StravaClient({
        clientId: "test",
        clientSecret: "test",
        timeout: 5000, // 5 seconds
      });

      customTimeoutClient.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      // Mock a slow response that takes 10ms
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ id: 123 }),
                  headers: new Headers(),
                }),
              10
            );
          })
      );

      // Should succeed with 5000ms timeout
      const result = await customTimeoutClient.getAthlete();
      expect(result).toEqual({ id: 123 });
    });
  });

  describe("Rate Limit Tracking", () => {
    beforeEach(() => {
      client.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
    });

    it("should track rate limit info from headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 123 }),
        headers: new Headers({
          "x-ratelimit-limit": "100,1000",
          "x-ratelimit-usage": "50,200",
        }),
      });

      await client.getAthlete();

      const rateLimitInfo = client.getRateLimitInfo();
      expect(rateLimitInfo).toEqual({
        shortTerm: { limit: 100, usage: 50 },
        longTerm: { limit: 1000, usage: 200 },
      });
    });

    it("should return null when no rate limit headers", async () => {
      expect(client.getRateLimitInfo()).toBeNull();
    });
  });

  describe("Token Refresh", () => {
    it("should only refresh token once when multiple concurrent requests need refresh", async () => {
      // Set token that needs refresh (within refresh buffer)
      client.setTokens({
        accessToken: "expiring-token",
        refreshToken: "refresh-token",
        expiresAt: Math.floor(Date.now() / 1000) + 60, // Expires in 60s, within 10min buffer
      });

      const tokenResponse = {
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "Bearer",
        expires_in: 3600,
        athlete: { id: 123 },
      };

      // Track how many times refresh endpoint is called
      let refreshCallCount = 0;
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/oauth/token")) {
          refreshCallCount++;
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(tokenResponse),
            headers: new Headers(),
          });
        }
        // API calls
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 123 }),
          headers: new Headers(),
        });
      });

      // Fire 5 concurrent requests that all need token refresh
      await Promise.all([
        client.getAthlete(),
        client.getAthlete(),
        client.getAthlete(),
        client.getAthlete(),
        client.getAthlete(),
      ]);

      // Should only have refreshed once, not 5 times
      expect(refreshCallCount).toBe(1);
    });

    it("should exchange authorization code for tokens", async () => {
      const tokenResponse = {
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "Bearer",
        expires_in: 3600,
        athlete: { id: 123 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(tokenResponse),
        headers: new Headers(),
      });

      const result = await client.exchangeAuthorizationCode("auth-code");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.strava.com/oauth/token",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("authorization_code"),
        })
      );
      expect(result).toEqual(tokenResponse);
      expect(client.getTokens()?.accessToken).toBe("new-access");
    });

    it("should refresh access token", async () => {
      client.setTokens({
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: Math.floor(Date.now() / 1000) + 100,
      });

      const tokenResponse = {
        access_token: "refreshed-access",
        refresh_token: "refreshed-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "Bearer",
        expires_in: 3600,
        athlete: { id: 123 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(tokenResponse),
        headers: new Headers(),
      });

      await client.refreshAccessToken();

      expect(client.getTokens()?.accessToken).toBe("refreshed-access");
    });

    it("should call onTokenRefresh callback after refresh", async () => {
      const onTokenRefresh = vi.fn();
      const clientWithCallback = new StravaClient({
        clientId: "test",
        clientSecret: "test",
        onTokenRefresh,
      });

      clientWithCallback.setTokens({
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: Math.floor(Date.now() / 1000) + 100,
      });

      const tokenResponse = {
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "Bearer",
        expires_in: 3600,
        athlete: { id: 123 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(tokenResponse),
        headers: new Headers(),
      });

      await clientWithCallback.refreshAccessToken();

      expect(onTokenRefresh).toHaveBeenCalledWith({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresAt: tokenResponse.expires_at,
      });
    });
  });

  describe("Client Info", () => {
    it("should return client info summary", () => {
      const info = client.getClientInfo();

      expect(info).toEqual({
        hasTokens: false,
        isAuthenticated: false,
        tokenExpiresAt: null,
        rateLimitInfo: null,
      });
    });

    it("should reflect authenticated state", () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      client.setTokens({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt,
      });

      const info = client.getClientInfo();

      expect(info.hasTokens).toBe(true);
      expect(info.isAuthenticated).toBe(true);
      expect(info.tokenExpiresAt).toEqual(new Date(expiresAt * 1000));
    });
  });

  describe("Test Connection", () => {
    it("should return true on successful connection", async () => {
      client.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 123 }),
        headers: new Headers(),
      });

      const result = await client.testConnection();
      expect(result).toBe(true);
    });

    it("should return false on failed connection", async () => {
      client.setTokens({
        accessToken: "invalid-token",
        refreshToken: "refresh",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: "Unauthorized" }),
        headers: new Headers(),
      });

      const result = await client.testConnection();
      expect(result).toBe(false);
    });
  });

  describe("Async Iterator Pagination", () => {
    beforeEach(() => {
      client.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
    });

    it("should iterate over activities one at a time", async () => {
      // First page returns 2 activities, second page returns 1, third page empty
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 1, name: "Activity 1" },
              { id: 2, name: "Activity 2" },
            ]),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ id: 3, name: "Activity 3" }]),
          headers: new Headers(),
        });

      const activities: { id: number; name: string }[] = [];
      for await (const activity of client.iterateActivities({ per_page: 2 })) {
        activities.push(activity as { id: number; name: string });
      }

      expect(activities).toHaveLength(3);
      expect(activities[0].id).toBe(1);
      expect(activities[2].id).toBe(3);
    });

    it("should allow early termination with break", async () => {
      // Return 5 activities per page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]),
        headers: new Headers(),
      });

      const activities: { id: number }[] = [];
      for await (const activity of client.iterateActivities({ per_page: 5 })) {
        activities.push(activity as { id: number });
        if (activities.length >= 2) break; // Stop after 2
      }

      expect(activities).toHaveLength(2);
      // Should only have made 1 API call since we broke early
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should work with getAllActivities", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ id: 1 }, { id: 2 }]),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        });

      const activities = await client.getAllActivities({ per_page: 2 });
      expect(activities).toHaveLength(2);
    });
  });
});
