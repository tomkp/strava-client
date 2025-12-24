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
} from './types';
import {
  parseStravaError,
  StravaTokenRefreshError,
  StravaValidationError,
  StravaNetworkError,
} from './errors';

const STRAVA_API_BASE_URL = 'https://www.strava.com/api/v3';
const STRAVA_OAUTH_BASE_URL = 'https://www.strava.com/oauth';
const DEFAULT_REFRESH_BUFFER = 600; // 10 minutes
const DEFAULT_TIMEOUT = 30000; // 30 seconds

export class StravaClient {
  private config: Required<StravaClientConfig>;
  private tokens: StravaTokens | null = null;
  private rateLimitInfo: StravaRateLimitInfo | null = null;

  constructor(config: StravaClientConfig) {
    this.config = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri || '',
      autoRefresh: config.autoRefresh ?? true,
      refreshBuffer: config.refreshBuffer ?? DEFAULT_REFRESH_BUFFER,
      onTokenRefresh: config.onTokenRefresh ?? (() => {}),
    };
  }

  // ============================================================================
  // HTTP Helpers
  // ============================================================================

  /**
   * Make an authenticated request to the Strava API
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: Record<string, unknown>;
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
      'Content-Type': 'application/json',
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

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new StravaNetworkError('Request timed out');
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new StravaNetworkError('Network error - unable to reach Strava');
      }

      throw error;
    }
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.tokens?.accessToken) {
      throw new StravaValidationError('No access token available. Please authenticate first.');
    }

    return {
      Authorization: `Bearer ${this.tokens.accessToken}`,
    };
  }

  /**
   * Update rate limit info from response headers
   */
  private updateRateLimitInfo(headers: Headers): void {
    const limitHeader = headers.get('x-ratelimit-limit');
    const usageHeader = headers.get('x-ratelimit-usage');

    if (limitHeader && usageHeader) {
      const [shortTermLimit, longTermLimit] = limitHeader.split(',').map(Number);
      const [shortTermUsage, longTermUsage] = usageHeader.split(',').map(Number);

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
    scope: string = 'activity:read_all',
    options?: { state?: string; approvalPrompt?: 'auto' | 'force' }
  ): string {
    if (!this.config.redirectUri) {
      throw new StravaValidationError('Redirect URI is required for OAuth flow');
    }

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      approval_prompt: options?.approvalPrompt ?? 'auto',
      scope,
    });

    if (options?.state) {
      params.append('state', options.state);
    }

    return `${STRAVA_OAUTH_BASE_URL}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  public async exchangeAuthorizationCode(code: string): Promise<StravaTokenResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${STRAVA_OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          grant_type: 'authorization_code',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw parseStravaError({
          status: response.status,
          data: errorData,
          headers: response.headers,
          context: 'Exchange Authorization Code',
        });
      }

      const data = await response.json() as StravaTokenResponse;

      // Store tokens
      this.tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
      };

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new StravaNetworkError('Request timed out');
      }

      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshAccessToken(refreshToken?: string): Promise<StravaTokenResponse> {
    const tokenToRefresh = refreshToken || this.tokens?.refreshToken;

    if (!tokenToRefresh) {
      throw new StravaTokenRefreshError('No refresh token available');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${STRAVA_OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: tokenToRefresh,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw parseStravaError({
          status: response.status,
          data: errorData,
          headers: response.headers,
          context: 'Refresh Access Token',
        });
      }

      const data = await response.json() as StravaTokenResponse;

      // Update stored tokens
      this.tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
      };

      // Call onTokenRefresh callback
      await this.config.onTokenRefresh(this.tokens);

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new StravaNetworkError('Request timed out');
      }

      throw error;
    }
  }

  /**
   * Automatically refresh token if it's expired or expiring soon
   */
  private async refreshTokenIfNeeded(): Promise<void> {
    if (!this.tokens) return;

    const now = Math.floor(Date.now() / 1000);
    const shouldRefresh = this.tokens.expiresAt < now + this.config.refreshBuffer;

    if (shouldRefresh) {
      await this.refreshAccessToken();
    }
  }

  /**
   * Deauthorize the application (revoke access)
   */
  public async deauthorize(): Promise<void> {
    // Deauthorize uses the OAuth base URL, not the API base URL
    if (this.config.autoRefresh && this.tokens) {
      await this.refreshTokenIfNeeded();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${STRAVA_OAUTH_BASE_URL}/deauthorize`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw parseStravaError({
          status: response.status,
          data: errorData,
          headers: response.headers,
          context: 'Deauthorize',
        });
      }

      this.clearTokens();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new StravaNetworkError('Request timed out');
      }

      throw error;
    }
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
    return this.request<StravaAthlete>('GET', '/athlete');
  }

  /**
   * Get athlete stats
   */
  public async getAthleteStats(athleteId: number): Promise<StravaAthleteStats> {
    return this.request<StravaAthleteStats>('GET', `/athletes/${athleteId}/stats`);
  }

  // ============================================================================
  // Activity Endpoints
  // ============================================================================

  /**
   * Get athlete activities
   */
  public async getActivities(options: GetActivitiesOptions = {}): Promise<StravaActivity[]> {
    return this.request<StravaActivity[]>('GET', '/athlete/activities', {
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
    options: Omit<GetActivitiesOptions, 'page'> = {}
  ): Promise<StravaActivity[]> {
    const perPage = options.per_page || 200; // Max per page
    let page = 1;
    let allActivities: StravaActivity[] = [];
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
        allActivities = [...allActivities, ...activities];
        page++;

        // Stop if we got fewer results than requested
        if (activities.length < perPage) {
          hasMore = false;
        }
      }
    }

    return allActivities;
  }

  /**
   * Get activity by ID
   */
  public async getActivity(activityId: number, includeAllEfforts: boolean = false): Promise<StravaActivity> {
    return this.request<StravaActivity>('GET', `/activities/${activityId}`, {
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
        'time',
        'distance',
        'altitude',
        'heartrate',
        'cadence',
        'watts',
        'temp',
        'velocity_smooth',
        'grade_smooth',
      ] as StravaStreamType[]);

    return this.request<StravaStreams>('GET', `/activities/${activityId}/streams`, {
      params: {
        keys: keys.join(','),
        key_by_type: options.key_by_type ?? true,
      },
    });
  }

  /**
   * Get activity zones (heart rate and power)
   */
  public async getActivityZones(activityId: number): Promise<StravaActivityZones> {
    return this.request<StravaActivityZones>('GET', `/activities/${activityId}/zones`);
  }

  /**
   * Get activity laps
   */
  public async getActivityLaps(activityId: number): Promise<StravaLap[]> {
    return this.request<StravaLap[]>('GET', `/activities/${activityId}/laps`);
  }

  /**
   * Create a manual activity
   */
  public async createActivity(options: CreateActivityOptions): Promise<StravaActivity> {
    return this.request<StravaActivity>('POST', '/activities', {
      body: options as unknown as Record<string, unknown>,
    });
  }

  /**
   * Update an activity
   */
  public async updateActivity(activityId: number, options: UpdateActivityOptions): Promise<StravaActivity> {
    return this.request<StravaActivity>('PUT', `/activities/${activityId}`, {
      body: options as unknown as Record<string, unknown>,
    });
  }

  /**
   * Get activity comments
   */
  public async getActivityComments(
    activityId: number,
    options: PaginationOptions = {}
  ): Promise<StravaComment[]> {
    return this.request<StravaComment[]>('GET', `/activities/${activityId}/comments`, {
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
    return this.request<StravaKudoser[]>('GET', `/activities/${activityId}/kudos`, {
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
    return this.request<StravaAthleteZones>('GET', '/athlete/zones');
  }

  /**
   * Update authenticated athlete
   */
  public async updateAthlete(options: UpdateAthleteOptions): Promise<StravaAthlete> {
    return this.request<StravaAthlete>('PUT', '/athlete', {
      body: options as unknown as Record<string, unknown>,
    });
  }

  // ============================================================================
  // Club Endpoints
  // ============================================================================

  /**
   * Get club by ID
   */
  public async getClub(clubId: number): Promise<StravaClub> {
    return this.request<StravaClub>('GET', `/clubs/${clubId}`);
  }

  /**
   * Get clubs the authenticated athlete is a member of
   */
  public async getAthleteClubs(options: PaginationOptions = {}): Promise<StravaClub[]> {
    return this.request<StravaClub[]>('GET', '/athlete/clubs', {
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
    return this.request<StravaClubActivity[]>('GET', `/clubs/${clubId}/activities`, {
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
    return this.request<StravaClubMember[]>('GET', `/clubs/${clubId}/members`, {
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
    return this.request<StravaClubAdmin[]>('GET', `/clubs/${clubId}/admins`, {
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
    return this.request<StravaGear>('GET', `/gear/${gearId}`);
  }

  // ============================================================================
  // Route Endpoints
  // ============================================================================

  /**
   * Get route by ID
   */
  public async getRoute(routeId: number): Promise<StravaRoute> {
    return this.request<StravaRoute>('GET', `/routes/${routeId}`);
  }

  /**
   * Get athlete routes
   */
  public async getAthleteRoutes(
    athleteId: number,
    options: PaginationOptions = {}
  ): Promise<StravaRoute[]> {
    return this.request<StravaRoute[]>('GET', `/athletes/${athleteId}/routes`, {
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
    // GPX export returns XML, not JSON
    if (this.config.autoRefresh && this.tokens) {
      await this.refreshTokenIfNeeded();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${STRAVA_API_BASE_URL}/routes/${routeId}/export_gpx`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.updateRateLimitInfo(response.headers);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw parseStravaError({
          status: response.status,
          data: errorData,
          headers: response.headers,
        });
      }

      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new StravaNetworkError('Request timed out');
      }

      throw error;
    }
  }

  /**
   * Export route as TCX
   */
  public async exportRouteTCX(routeId: number): Promise<string> {
    // TCX export returns XML, not JSON
    if (this.config.autoRefresh && this.tokens) {
      await this.refreshTokenIfNeeded();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${STRAVA_API_BASE_URL}/routes/${routeId}/export_tcx`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.updateRateLimitInfo(response.headers);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw parseStravaError({
          status: response.status,
          data: errorData,
          headers: response.headers,
        });
      }

      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new StravaNetworkError('Request timed out');
      }

      throw error;
    }
  }

  /**
   * Get route streams
   */
  public async getRouteStreams(routeId: number): Promise<StravaStreams> {
    return this.request<StravaStreams>('GET', `/routes/${routeId}/streams`);
  }

  // ============================================================================
  // Segment Endpoints
  // ============================================================================

  /**
   * Get segment by ID
   */
  public async getSegment(segmentId: number): Promise<StravaSegment> {
    return this.request<StravaSegment>('GET', `/segments/${segmentId}`);
  }

  /**
   * Explore segments in a given area
   */
  public async exploreSegments(options: ExploreSegmentsOptions): Promise<StravaExplorerResponse> {
    const bounds = options.bounds.join(',');
    return this.request<StravaExplorerResponse>('GET', '/segments/explore', {
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
    return this.request<StravaSegment[]>('GET', '/segments/starred', {
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
    return this.request<StravaSegment>('PUT', `/segments/${segmentId}/starred`, {
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
    const keys = options.keys || ['distance', 'altitude'];
    return this.request<StravaStreams>('GET', `/segments/${segmentId}/streams`, {
      params: {
        keys: keys.join(','),
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
    return this.request<StravaSegmentEffort>('GET', `/segment_efforts/${effortId}`);
  }

  /**
   * Get segment efforts for a segment
   */
  public async getSegmentEfforts(
    segmentId: number,
    options: GetSegmentEffortsOptions = {}
  ): Promise<StravaSegmentEffort[]> {
    return this.request<StravaSegmentEffort[]>('GET', '/segment_efforts', {
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
    const keys = options.keys || ['distance', 'altitude'];
    return this.request<StravaStreams>('GET', `/segment_efforts/${effortId}/streams`, {
      params: {
        keys: keys.join(','),
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
    // For file uploads, we need to use FormData
    const formData = new FormData();
    formData.append('file', options.file as Blob);
    formData.append('data_type', options.data_type);

    if (options.name) formData.append('name', options.name);
    if (options.description) formData.append('description', options.description);
    if (options.trainer !== undefined) formData.append('trainer', String(options.trainer));
    if (options.commute !== undefined) formData.append('commute', String(options.commute));
    if (options.external_id) formData.append('external_id', options.external_id);

    // Auto-refresh token if needed
    if (this.config.autoRefresh && this.tokens) {
      await this.refreshTokenIfNeeded();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${STRAVA_API_BASE_URL}/uploads`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.updateRateLimitInfo(response.headers);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw parseStravaError({
          status: response.status,
          data: errorData,
          headers: response.headers,
        });
      }

      return await response.json() as StravaUpload;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new StravaNetworkError('Request timed out');
      }

      throw error;
    }
  }

  /**
   * Get upload status by ID
   */
  public async getUpload(uploadId: number): Promise<StravaUpload> {
    return this.request<StravaUpload>('GET', `/uploads/${uploadId}`);
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
