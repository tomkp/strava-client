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

    it("should return a copy of tokens to prevent external mutation", () => {
      const originalTokens = {
        accessToken: "access-123",
        refreshToken: "refresh-456",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      client.setTokens(originalTokens);
      const retrievedTokens = client.getTokens();

      // Mutate the retrieved tokens
      retrievedTokens!.accessToken = "mutated-token";

      // Internal tokens should remain unchanged
      const internalTokens = client.getTokens();
      expect(internalTokens!.accessToken).toBe("access-123");
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

  describe("Request/Response Logging Hooks", () => {
    it("should call onRequest hook before each request", async () => {
      const onRequest = vi.fn();
      const clientWithHooks = new StravaClient({
        clientId: "test",
        clientSecret: "test",
        onRequest,
      });

      clientWithHooks.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 123 }),
        headers: new Headers(),
      });

      await clientWithHooks.getAthlete();

      expect(onRequest).toHaveBeenCalledWith({
        method: "GET",
        url: "https://www.strava.com/api/v3/athlete",
        headers: expect.objectContaining({
          Authorization: "Bearer [REDACTED]",
        }),
      });
    });

    it("should call onResponse hook after each response", async () => {
      const onResponse = vi.fn();
      const clientWithHooks = new StravaClient({
        clientId: "test",
        clientSecret: "test",
        onResponse,
      });

      clientWithHooks.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 123 }),
        headers: new Headers(),
      });

      await clientWithHooks.getAthlete();

      expect(onResponse).toHaveBeenCalledWith({
        method: "GET",
        url: "https://www.strava.com/api/v3/athlete",
        status: 200,
        duration: expect.any(Number),
      });
    });

    it("should include duration in response hook", async () => {
      const onResponse = vi.fn();
      const clientWithHooks = new StravaClient({
        clientId: "test",
        clientSecret: "test",
        onResponse,
      });

      clientWithHooks.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      // Mock a 50ms delay
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  json: () => Promise.resolve({ id: 123 }),
                  headers: new Headers(),
                }),
              50
            );
          })
      );

      await clientWithHooks.getAthlete();

      expect(onResponse).toHaveBeenCalled();
      const callArg = onResponse.mock.calls[0][0];
      expect(callArg.duration).toBeGreaterThanOrEqual(50);
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

  describe("Generic Pagination Helper", () => {
    beforeEach(() => {
      client.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
    });

    it("should paginate club members with getAllClubMembers", async () => {
      // First page returns 2 members, second page returns 1 (less than perPage)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { firstname: "Alice", lastname: "A" },
              { firstname: "Bob", lastname: "B" },
            ]),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ firstname: "Charlie", lastname: "C" }]),
          headers: new Headers(),
        });

      const members = await client.getAllClubMembers(12345, { per_page: 2 });
      expect(members).toHaveLength(3);
      expect(members[0].firstname).toBe("Alice");
      expect(members[2].firstname).toBe("Charlie");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should paginate starred segments with getAllStarredSegments", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 1, name: "Segment 1" },
              { id: 2, name: "Segment 2" },
            ]),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        });

      const segments = await client.getAllStarredSegments({ per_page: 2 });
      expect(segments).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should iterate over club members with iterateClubMembers", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { firstname: "Alice", lastname: "A" },
              { firstname: "Bob", lastname: "B" },
            ]),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ firstname: "Charlie", lastname: "C" }]),
          headers: new Headers(),
        });

      const members: { firstname: string }[] = [];
      for await (const member of client.iterateClubMembers(12345, { per_page: 2 })) {
        members.push(member as { firstname: string });
      }

      expect(members).toHaveLength(3);
    });

    it("should allow early termination of club member iteration", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([{ firstname: "Alice" }, { firstname: "Bob" }, { firstname: "Charlie" }]),
        headers: new Headers(),
      });

      const members: { firstname: string }[] = [];
      for await (const member of client.iterateClubMembers(12345)) {
        members.push(member as { firstname: string });
        if (members.length >= 2) break;
      }

      expect(members).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should handle empty first page gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      });

      const members = await client.getAllClubMembers(12345);
      expect(members).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Webhook Support", () => {
    it("should create a webhook subscription", async () => {
      const subscriptionResponse = {
        id: 123456,
        application_id: 12345,
        callback_url: "https://example.com/webhook",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(subscriptionResponse),
        headers: new Headers(),
      });

      const subscription = await client.createWebhookSubscription({
        callbackUrl: "https://example.com/webhook",
        verifyToken: "my-secret-token",
      });

      expect(subscription).toEqual(subscriptionResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.strava.com/api/v3/push_subscriptions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        })
      );
    });

    it("should get webhook subscription", async () => {
      const subscriptionResponse = [
        {
          id: 123456,
          application_id: 12345,
          callback_url: "https://example.com/webhook",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(subscriptionResponse),
        headers: new Headers(),
      });

      const subscription = await client.getWebhookSubscription();

      expect(subscription).toEqual(subscriptionResponse[0]);
    });

    it("should return null when no webhook subscription exists", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      });

      const subscription = await client.getWebhookSubscription();

      expect(subscription).toBeNull();
    });

    it("should delete webhook subscription", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(undefined),
        headers: new Headers(),
      });

      await client.deleteWebhookSubscription(123456);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.strava.com/api/v3/push_subscriptions/123456",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-HTTP-Method-Override": "DELETE",
          }),
        })
      );
    });

    it("should validate webhook verification request", () => {
      const validRequest = {
        "hub.mode": "subscribe",
        "hub.verify_token": "my-secret-token",
        "hub.challenge": "abc123",
      };

      const challenge = client.validateWebhookVerification(validRequest, "my-secret-token");
      expect(challenge).toBe("abc123");
    });

    it("should reject invalid verify token", () => {
      const invalidRequest = {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "abc123",
      };

      const challenge = client.validateWebhookVerification(invalidRequest, "my-secret-token");
      expect(challenge).toBeNull();
    });

    it("should reject invalid hub mode", () => {
      const invalidRequest = {
        "hub.mode": "unsubscribe",
        "hub.verify_token": "my-secret-token",
        "hub.challenge": "abc123",
      };

      const challenge = client.validateWebhookVerification(invalidRequest, "my-secret-token");
      expect(challenge).toBeNull();
    });

    it("should parse valid webhook event with updates", () => {
      const payload = {
        object_type: "activity",
        object_id: 12345678,
        aspect_type: "update",
        updates: { title: "Morning Run" },
        owner_id: 123456,
        subscription_id: 789,
        event_time: 1704067200,
      };

      const event = client.parseWebhookEvent(payload);
      expect(event).toEqual(payload);
    });

    it("should parse webhook event without updates field (create/delete events)", () => {
      const payload = {
        object_type: "activity",
        object_id: 12345678,
        aspect_type: "create",
        owner_id: 123456,
        subscription_id: 789,
        event_time: 1704067200,
      };

      const event = client.parseWebhookEvent(payload);
      expect(event).toEqual(payload);
      expect(event.updates).toBeUndefined();
    });

    it("should throw on invalid webhook event", () => {
      const invalidPayload = {
        object_type: "activity",
        // missing other fields
      };

      expect(() => client.parseWebhookEvent(invalidPayload)).toThrow(
        "Invalid webhook event payload"
      );
    });

    it("should throw on invalid object_type", () => {
      const invalidPayload = {
        object_type: "invalid_type",
        object_id: 12345678,
        aspect_type: "create",
        owner_id: 123456,
        subscription_id: 789,
        event_time: 1704067200,
      };

      expect(() => client.parseWebhookEvent(invalidPayload)).toThrow(
        "Invalid webhook event payload"
      );
    });

    it("should throw on invalid aspect_type", () => {
      const invalidPayload = {
        object_type: "activity",
        object_id: 12345678,
        aspect_type: "invalid_aspect",
        owner_id: 123456,
        subscription_id: 789,
        event_time: 1704067200,
      };

      expect(() => client.parseWebhookEvent(invalidPayload)).toThrow(
        "Invalid webhook event payload"
      );
    });
  });

  describe("AbortController Support", () => {
    beforeEach(() => {
      client.setTokens({
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
    });

    it("should cancel request when AbortController is aborted", async () => {
      const controller = new AbortController();

      // Pre-abort the controller before making the request
      controller.abort();

      // Mock fetch to check the signal is aborted
      mockFetch.mockImplementationOnce((_url: string, options: { signal?: AbortSignal }) => {
        // If signal is already aborted, reject immediately
        if (options.signal?.aborted) {
          const error = new Error("Aborted");
          error.name = "AbortError";
          return Promise.reject(error);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        });
      });

      // Should throw AbortError (not StravaNetworkError)
      await expect(client.getActivities({ signal: controller.signal })).rejects.toThrow();
    });

    it("should throw AbortError for user-initiated abort", async () => {
      const controller = new AbortController();
      controller.abort();

      mockFetch.mockImplementationOnce((_url: string, options: { signal?: AbortSignal }) => {
        if (options.signal?.aborted) {
          const error = new Error("Aborted");
          error.name = "AbortError";
          return Promise.reject(error);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        });
      });

      try {
        await client.getActivities({ signal: controller.signal });
        expect.fail("Should have thrown");
      } catch (error) {
        // User abort should throw AbortError, not StravaNetworkError
        expect((error as Error).name).toBe("AbortError");
      }
    });

    it("should pass signal through to fetch", async () => {
      const controller = new AbortController();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      });

      await client.getActivities({ signal: controller.signal });

      // Verify fetch was called with signal
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });
});
