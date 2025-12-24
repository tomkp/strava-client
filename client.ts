/**
 * Strava API Client
 * A complete, type-safe client for the Strava API v3
 *
 * Features:
 * - Full TypeScript support with comprehensive type definitions
 * - Automatic token refresh when tokens expire
 * - Rate limit tracking and headers
 * - Error handling with specific error types
 * - Support for all major Strava API endpoints
 * - Zero dependencies - uses native fetch
 */

import {
  StravaTokenResponse,
  StravaTokens,
  StravaAthlete,
  StravaAthleteStats,
  StravaAthleteZones,
  StravaActivity,
  StravaActivityZones,
  StravaLap,
  StravaComment,
  StravaKudoser,
  StravaClub,
  StravaClubActivity,
  StravaClubMember,
  StravaClubAdmin,
  StravaGear,
  StravaRoute,
  StravaSegment,
  StravaSegmentEffort,
  StravaExplorerResponse,
  StravaUpload,
  StravaStreams,
  StravaStreamType,
  StravaRateLimitInfo,
  StravaClientConfig,
  GetActivitiesOptions,
  GetActivityStreamsOptions,
  CreateActivityOptions,
  UpdateActivityOptions,
  UpdateAthleteOptions,
  PaginationOptions,
  ExploreSegmentsOptions,
  GetSegmentEffortsOptions,
  UploadActivityOptions,
} from "./types";
import {
  parseStravaError,
  StravaTokenRefreshError,
  StravaValidationError,
  StravaNetworkError,
} from "./errors";

const STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_BASE_URL = "https://www.strava.com/oauth";
const DEFAULT_REFRESH_BUFFER = 600; // 10 minutes
const DEFAULT_TIMEOUT = 30000; // 30 seconds

export class StravaClient {
  private config: Required<StravaClientConfig>;
  private tokens: StravaTokens | null = null;
  private rateLimitInfo: StravaRateLimitInfo | null = null;
  private refreshPromise: Promise<StravaTokenResponse> | null = null;

  constructor(config: StravaClientConfig) {
    this.config = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri || "",
      autoRefresh: config.autoRefresh ?? true,
      refreshBuffer: config.refreshBuffer ?? DEFAULT_REFRESH_BUFFER,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      onTokenRefresh: config.onTokenRefresh ?? (() => {}),
    };
  }

  // ============================================================================
  // HTTP Helpers
  // ============================================================================

  /**
   * Make an authenticated request to the Strava API
   */
  private async request<T, B extends object = Record<string, unknown>>(
    method: "GET" | "POST" | "PUT",
    path: string,
    options: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: B;
      headers?: Record<string, string>;
      baseUrl?: string;
      skipAuth?: boolean;
    } = {}
  ): Promise<T> {
    // Auto-refresh token if needed
    if (this.config.autoRefresh && this.tokens && !options.skipAuth) {
      await this.refreshTokenIfNeeded();
    }

    const baseUrl = options.baseUrl ?? STRAVA_API_BASE_URL;
    let url = `${baseUrl}${path}`;

    // Add query parameters
    if (options.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (!options.skipAuth) {
      const authHeaders = this.getAuthHeaders();
      Object.assign(headers, authHeaders);
    }

    // Setup timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Update rate limit info from headers
      this.updateRateLimitInfo(response.headers);

      // Handle non-OK responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw parseStravaError({
          status: response.status,
          data: errorData,
          headers: response.headers,
        });
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new StravaNetworkError("Request timed out");
      }

      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new StravaNetworkError("Network error - unable to reach Strava");
      }

      throw error;
    }
  }

  /**
   * Make an authenticated request that returns text (for XML exports)
   */
  private async requestText(
    method: "GET" | "POST",
    path: string,
    options: {
      baseUrl?: string;
      headers?: Record<string, string>;
    } = {}
  ): Promise<string> {
    if (this.config.autoRefresh && this.tokens) {
      await this.refreshTokenIfNeeded();
    }

    const baseUrl = options.baseUrl ?? STRAVA_API_BASE_URL;
    const url = `${baseUrl}${path}`;

    return this.fetchWithTimeout(url, {
      method,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      parseResponse: (response) => response.text(),
    });
  }

  /**
   * Make a request with custom body (for FormData uploads, OAuth requests)
   */
  private async requestRaw<T>(
    method: "GET" | "POST",
    url: string,
    options: {
      headers?: Record<string, string>;
      body?: string | FormData;
      parseResponse?: (response: Response) => Promise<T>;
      context?: string;
      skipRateLimit?: boolean;
    } = {}
  ): Promise<T> {
    return this.fetchWithTimeout(url, {
      method,
      headers: options.headers,
      body: options.body,
      parseResponse: options.parseResponse ?? ((r) => r.json() as Promise<T>),
      context: options.context,
      skipRateLimit: options.skipRateLimit,
    });
  }

  /**
   * Core fetch wrapper with timeout, error handling, and rate limit tracking
   */
  private async fetchWithTimeout<T>(
    url: string,
    options: {
      method: "GET" | "POST" | "PUT";
      headers?: Record<string, string>;
      body?: string | FormData;
      parseResponse: (response: Response) => Promise<T>;
      context?: string;
      skipRateLimit?: boolean;
      timeout?: number;
    }
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = options.timeout ?? this.config.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!options.skipRateLimit) {
        this.updateRateLimitInfo(response.headers);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw parseStravaError({
          status: response.status,
          data: errorData,
          headers: response.headers,
          context: options.context,
        });
      }

      return await options.parseResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new StravaNetworkError("Request timed out");
      }

      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new StravaNetworkError("Network error - unable to reach Strava");
      }

      throw error;
    }
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.tokens?.accessToken) {
      throw new StravaValidationError("No access token available. Please authenticate first.");
    }

    return {
      Authorization: `Bearer ${this.tokens.accessToken}`,
    };
  }

  /**
   * Update rate limit info from response headers
   */
  private updateRateLimitInfo(headers: Headers): void {
    const limitHeader = headers.get("x-ratelimit-limit");
    const usageHeader = headers.get("x-ratelimit-usage");

    if (limitHeader && usageHeader) {
      const [shortTermLimit, longTermLimit] = limitHeader.split(",").map(Number);
      const [shortTermUsage, longTermUsage] = usageHeader.split(",").map(Number);

      this.rateLimitInfo = {
        shortTerm: {
          usage: shortTermUsage,
          limit: shortTermLimit,
        },
        longTerm: {
          usage: longTermUsage,
          limit: longTermLimit,
        },
      };
    }
  }

  // ============================================================================
  // Token Management
  // ============================================================================

  /**
   * Set authentication tokens
   */
  public setTokens(tokens: StravaTokens): void {
    this.tokens = tokens;
  }

  /**
   * Get current tokens
   */
  public getTokens(): StravaTokens | null {
    return this.tokens;
  }

  /**
   * Clear tokens (logout)
   */
  public clearTokens(): void {
    this.tokens = null;
  }

  /**
   * Check if client has valid tokens
   */
  public hasValidTokens(): boolean {
    if (!this.tokens) return false;

    const now = Math.floor(Date.now() / 1000);
    return this.tokens.expiresAt > now;
  }

  /**
   * Get authorization URL for OAuth flow
   * @param scope OAuth scopes (default: 'activity:read_all')
   * @param options Optional settings for the authorization URL
   */
  public getAuthorizationUrl(
    scope: string = "activity:read_all",
    options?: { state?: string; approvalPrompt?: "auto" | "force" }
  ): string {
    if (!this.config.redirectUri) {
      throw new StravaValidationError("Redirect URI is required for OAuth flow");
    }

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      approval_prompt: options?.approvalPrompt ?? "auto",
      scope,
    });

    if (options?.state) {
      params.append("state", options.state);
    }

    return `${STRAVA_OAUTH_BASE_URL}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  public async exchangeAuthorizationCode(code: string): Promise<StravaTokenResponse> {
    const data = await this.requestRaw<StravaTokenResponse>(
      "POST",
      `${STRAVA_OAUTH_BASE_URL}/token`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          grant_type: "authorization_code",
        }),
        context: "Exchange Authorization Code",
        skipRateLimit: true,
      }
    );

    // Store tokens
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
    };

    return data;
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshAccessToken(refreshToken?: string): Promise<StravaTokenResponse> {
    const tokenToRefresh = refreshToken || this.tokens?.refreshToken;

    if (!tokenToRefresh) {
      throw new StravaTokenRefreshError("No refresh token available");
    }

    const data = await this.requestRaw<StravaTokenResponse>(
      "POST",
      `${STRAVA_OAUTH_BASE_URL}/token`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: "refresh_token",
          refresh_token: tokenToRefresh,
        }),
        context: "Refresh Access Token",
        skipRateLimit: true,
      }
    );

    // Update stored tokens
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
    };

    // Call onTokenRefresh callback
    await this.config.onTokenRefresh(this.tokens);

    return data;
  }

  /**
   * Automatically refresh token if it's expired or expiring soon.
   * Uses a mutex pattern to prevent multiple concurrent refresh requests.
   */
  private async refreshTokenIfNeeded(): Promise<void> {
    if (!this.tokens) return;

    const now = Math.floor(Date.now() / 1000);
    const shouldRefresh = this.tokens.expiresAt < now + this.config.refreshBuffer;

    if (shouldRefresh) {
      // If a refresh is already in progress, wait for it
      if (this.refreshPromise) {
        await this.refreshPromise;
        return;
      }

      // Start a new refresh and store the promise
      this.refreshPromise = this.refreshAccessToken();
      try {
        await this.refreshPromise;
      } finally {
        this.refreshPromise = null;
      }
    }
  }

  /**
   * Deauthorize the application (revoke access)
   */
  public async deauthorize(): Promise<void> {
    if (this.config.autoRefresh && this.tokens) {
      await this.refreshTokenIfNeeded();
    }

    await this.requestRaw<unknown>("POST", `${STRAVA_OAUTH_BASE_URL}/deauthorize`, {
      headers: this.getAuthHeaders(),
      context: "Deauthorize",
      skipRateLimit: true,
    });

    this.clearTokens();
  }

  // ============================================================================
  // Rate Limit Info
  // ============================================================================

  /**
   * Get current rate limit information
   */
  public getRateLimitInfo(): StravaRateLimitInfo | null {
    return this.rateLimitInfo;
  }

  // ============================================================================
  // Athlete Endpoints
  // ============================================================================

  /**
   * Get the currently authenticated athlete
   */
  public async getAthlete(): Promise<StravaAthlete> {
    return this.request<StravaAthlete>("GET", "/athlete");
  }

  /**
   * Get athlete stats
   */
  public async getAthleteStats(athleteId: number): Promise<StravaAthleteStats> {
    return this.request<StravaAthleteStats>("GET", `/athletes/${athleteId}/stats`);
  }

  // ============================================================================
  // Activity Endpoints
  // ============================================================================

  /**
   * Get athlete activities
   */
  public async getActivities(options: GetActivitiesOptions = {}): Promise<StravaActivity[]> {
    return this.request<StravaActivity[]>("GET", "/athlete/activities", {
      params: {
        before: options.before,
        after: options.after,
        page: options.page || 1,
        per_page: options.per_page || 30,
      },
    });
  }

  /**
   * Get all athlete activities (handles pagination automatically)
   */
  public async getAllActivities(
    options: Omit<GetActivitiesOptions, "page"> = {}
  ): Promise<StravaActivity[]> {
    const allActivities: StravaActivity[] = [];
    for await (const activity of this.iterateActivities(options)) {
      allActivities.push(activity);
    }
    return allActivities;
  }

  /**
   * Iterate over athlete activities using async generator.
   * Memory-efficient alternative to getAllActivities that yields activities one at a time.
   *
   * @example
   * for await (const activity of client.iterateActivities()) {
   *   console.log(activity.name);
   *   if (someCondition) break; // Stop fetching more pages
   * }
   */
  public async *iterateActivities(
    options: Omit<GetActivitiesOptions, "page"> = {}
  ): AsyncGenerator<StravaActivity, void, undefined> {
    const perPage = options.per_page || 200;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const activities = await this.getActivities({
        ...options,
        page,
        per_page: perPage,
      });

      if (activities.length === 0) {
        hasMore = false;
      } else {
        for (const activity of activities) {
          yield activity;
        }
        page++;

        if (activities.length < perPage) {
          hasMore = false;
        }
      }
    }
  }

  /**
   * Get activity by ID
   */
  public async getActivity(
    activityId: number,
    includeAllEfforts: boolean = false
  ): Promise<StravaActivity> {
    return this.request<StravaActivity>("GET", `/activities/${activityId}`, {
      params: {
        include_all_efforts: includeAllEfforts,
      },
    });
  }

  /**
   * Get activity streams (time-series data)
   */
  public async getActivityStreams(
    activityId: number,
    options: GetActivityStreamsOptions = {}
  ): Promise<StravaStreams> {
    const keys =
      options.keys ||
      ([
        "time",
        "distance",
        "altitude",
        "heartrate",
        "cadence",
        "watts",
        "temp",
        "velocity_smooth",
        "grade_smooth",
      ] as StravaStreamType[]);

    return this.request<StravaStreams>("GET", `/activities/${activityId}/streams`, {
      params: {
        keys: keys.join(","),
        key_by_type: options.key_by_type ?? true,
      },
    });
  }

  /**
   * Get activity zones (heart rate and power)
   */
  public async getActivityZones(activityId: number): Promise<StravaActivityZones> {
    return this.request<StravaActivityZones>("GET", `/activities/${activityId}/zones`);
  }

  /**
   * Get activity laps
   */
  public async getActivityLaps(activityId: number): Promise<StravaLap[]> {
    return this.request<StravaLap[]>("GET", `/activities/${activityId}/laps`);
  }

  /**
   * Create a manual activity
   */
  public async createActivity(options: CreateActivityOptions): Promise<StravaActivity> {
    return this.request<StravaActivity, CreateActivityOptions>("POST", "/activities", {
      body: options,
    });
  }

  /**
   * Update an activity
   */
  public async updateActivity(
    activityId: number,
    options: UpdateActivityOptions
  ): Promise<StravaActivity> {
    return this.request<StravaActivity, UpdateActivityOptions>("PUT", `/activities/${activityId}`, {
      body: options,
    });
  }

  /**
   * Get activity comments
   */
  public async getActivityComments(
    activityId: number,
    options: PaginationOptions = {}
  ): Promise<StravaComment[]> {
    return this.request<StravaComment[]>("GET", `/activities/${activityId}/comments`, {
      params: {
        page: options.page || 1,
        per_page: options.per_page || 30,
      },
    });
  }

  /**
   * Get activity kudoers
   */
  public async getActivityKudoers(
    activityId: number,
    options: PaginationOptions = {}
  ): Promise<StravaKudoser[]> {
    return this.request<StravaKudoser[]>("GET", `/activities/${activityId}/kudos`, {
      params: {
        page: options.page || 1,
        per_page: options.per_page || 30,
      },
    });
  }

  // ============================================================================
  // Athlete Endpoints (Extended)
  // ============================================================================

  /**
   * Get athlete zones
   */
  public async getAthleteZones(): Promise<StravaAthleteZones> {
    return this.request<StravaAthleteZones>("GET", "/athlete/zones");
  }

  /**
   * Update authenticated athlete
   */
  public async updateAthlete(options: UpdateAthleteOptions): Promise<StravaAthlete> {
    return this.request<StravaAthlete, UpdateAthleteOptions>("PUT", "/athlete", {
      body: options,
    });
  }

  // ============================================================================
  // Club Endpoints
  // ============================================================================

  /**
   * Get club by ID
   */
  public async getClub(clubId: number): Promise<StravaClub> {
    return this.request<StravaClub>("GET", `/clubs/${clubId}`);
  }

  /**
   * Get clubs the authenticated athlete is a member of
   */
  public async getAthleteClubs(options: PaginationOptions = {}): Promise<StravaClub[]> {
    return this.request<StravaClub[]>("GET", "/athlete/clubs", {
      params: {
        page: options.page || 1,
        per_page: options.per_page || 30,
      },
    });
  }

  /**
   * Get club activities
   */
  public async getClubActivities(
    clubId: number,
    options: PaginationOptions = {}
  ): Promise<StravaClubActivity[]> {
    return this.request<StravaClubActivity[]>("GET", `/clubs/${clubId}/activities`, {
      params: {
        page: options.page || 1,
        per_page: options.per_page || 30,
      },
    });
  }

  /**
   * Get club members
   */
  public async getClubMembers(
    clubId: number,
    options: PaginationOptions = {}
  ): Promise<StravaClubMember[]> {
    return this.request<StravaClubMember[]>("GET", `/clubs/${clubId}/members`, {
      params: {
        page: options.page || 1,
        per_page: options.per_page || 30,
      },
    });
  }

  /**
   * Get club admins
   */
  public async getClubAdmins(
    clubId: number,
    options: PaginationOptions = {}
  ): Promise<StravaClubAdmin[]> {
    return this.request<StravaClubAdmin[]>("GET", `/clubs/${clubId}/admins`, {
      params: {
        page: options.page || 1,
        per_page: options.per_page || 30,
      },
    });
  }

  // ============================================================================
  // Gear Endpoints
  // ============================================================================

  /**
   * Get gear by ID
   */
  public async getGear(gearId: string): Promise<StravaGear> {
    return this.request<StravaGear>("GET", `/gear/${gearId}`);
  }

  // ============================================================================
  // Route Endpoints
  // ============================================================================

  /**
   * Get route by ID
   */
  public async getRoute(routeId: number): Promise<StravaRoute> {
    return this.request<StravaRoute>("GET", `/routes/${routeId}`);
  }

  /**
   * Get athlete routes
   */
  public async getAthleteRoutes(
    athleteId: number,
    options: PaginationOptions = {}
  ): Promise<StravaRoute[]> {
    return this.request<StravaRoute[]>("GET", `/athletes/${athleteId}/routes`, {
      params: {
        page: options.page || 1,
        per_page: options.per_page || 30,
      },
    });
  }

  /**
   * Export route as GPX
   */
  public async exportRouteGPX(routeId: number): Promise<string> {
    return this.requestText("GET", `/routes/${routeId}/export_gpx`);
  }

  /**
   * Export route as TCX
   */
  public async exportRouteTCX(routeId: number): Promise<string> {
    return this.requestText("GET", `/routes/${routeId}/export_tcx`);
  }

  /**
   * Get route streams
   */
  public async getRouteStreams(routeId: number): Promise<StravaStreams> {
    return this.request<StravaStreams>("GET", `/routes/${routeId}/streams`);
  }

  // ============================================================================
  // Segment Endpoints
  // ============================================================================

  /**
   * Get segment by ID
   */
  public async getSegment(segmentId: number): Promise<StravaSegment> {
    return this.request<StravaSegment>("GET", `/segments/${segmentId}`);
  }

  /**
   * Explore segments in a given area
   */
  public async exploreSegments(options: ExploreSegmentsOptions): Promise<StravaExplorerResponse> {
    const bounds = options.bounds.join(",");
    return this.request<StravaExplorerResponse>("GET", "/segments/explore", {
      params: {
        bounds,
        activity_type: options.activity_type,
        min_cat: options.min_cat,
        max_cat: options.max_cat,
      },
    });
  }

  /**
   * Get starred segments for the authenticated athlete
   */
  public async getStarredSegments(options: PaginationOptions = {}): Promise<StravaSegment[]> {
    return this.request<StravaSegment[]>("GET", "/segments/starred", {
      params: {
        page: options.page || 1,
        per_page: options.per_page || 30,
      },
    });
  }

  /**
   * Star or unstar a segment
   */
  public async starSegment(segmentId: number, starred: boolean): Promise<StravaSegment> {
    return this.request<StravaSegment>("PUT", `/segments/${segmentId}/starred`, {
      body: { starred },
    });
  }

  /**
   * Get segment streams
   */
  public async getSegmentStreams(
    segmentId: number,
    options: GetActivityStreamsOptions = {}
  ): Promise<StravaStreams> {
    const keys = options.keys || ["distance", "altitude"];
    return this.request<StravaStreams>("GET", `/segments/${segmentId}/streams`, {
      params: {
        keys: keys.join(","),
        key_by_type: options.key_by_type ?? true,
      },
    });
  }

  // ============================================================================
  // Segment Effort Endpoints
  // ============================================================================

  /**
   * Get segment effort by ID
   */
  public async getSegmentEffort(effortId: number): Promise<StravaSegmentEffort> {
    return this.request<StravaSegmentEffort>("GET", `/segment_efforts/${effortId}`);
  }

  /**
   * Get segment efforts for a segment
   */
  public async getSegmentEfforts(
    segmentId: number,
    options: GetSegmentEffortsOptions = {}
  ): Promise<StravaSegmentEffort[]> {
    return this.request<StravaSegmentEffort[]>("GET", "/segment_efforts", {
      params: {
        segment_id: segmentId,
        start_date_local: options.start_date_local,
        end_date_local: options.end_date_local,
        per_page: options.per_page || 30,
      },
    });
  }

  /**
   * Get segment effort streams
   */
  public async getSegmentEffortStreams(
    effortId: number,
    options: GetActivityStreamsOptions = {}
  ): Promise<StravaStreams> {
    const keys = options.keys || ["distance", "altitude"];
    return this.request<StravaStreams>("GET", `/segment_efforts/${effortId}/streams`, {
      params: {
        keys: keys.join(","),
        key_by_type: options.key_by_type ?? true,
      },
    });
  }

  // ============================================================================
  // Upload Endpoints
  // ============================================================================

  /**
   * Upload an activity file
   */
  public async uploadActivity(options: UploadActivityOptions): Promise<StravaUpload> {
    const formData = new FormData();
    formData.append("file", options.file as Blob);
    formData.append("data_type", options.data_type);

    if (options.name) formData.append("name", options.name);
    if (options.description) formData.append("description", options.description);
    if (options.trainer !== undefined) formData.append("trainer", String(options.trainer));
    if (options.commute !== undefined) formData.append("commute", String(options.commute));
    if (options.external_id) formData.append("external_id", options.external_id);

    if (this.config.autoRefresh && this.tokens) {
      await this.refreshTokenIfNeeded();
    }

    return this.requestRaw<StravaUpload>("POST", `${STRAVA_API_BASE_URL}/uploads`, {
      headers: this.getAuthHeaders(),
      body: formData,
    });
  }

  /**
   * Get upload status by ID
   */
  public async getUpload(uploadId: number): Promise<StravaUpload> {
    return this.request<StravaUpload>("GET", `/uploads/${uploadId}`);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Test the connection with a simple API call
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.getAthlete();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a summary of the client's current state
   */
  public getClientInfo(): {
    hasTokens: boolean;
    isAuthenticated: boolean;
    tokenExpiresAt: Date | null;
    rateLimitInfo: StravaRateLimitInfo | null;
  } {
    return {
      hasTokens: this.tokens !== null,
      isAuthenticated: this.hasValidTokens(),
      tokenExpiresAt: this.tokens ? new Date(this.tokens.expiresAt * 1000) : null,
      rateLimitInfo: this.rateLimitInfo,
    };
  }
}
