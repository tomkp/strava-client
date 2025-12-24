/**
 * Strava API Type Definitions
 * Complete type definitions for Strava API responses
 */

// ============================================================================
// OAuth Types
// ============================================================================

export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: StravaAthlete;
}

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// ============================================================================
// Athlete Types
// ============================================================================

export interface StravaAthlete {
  id: number;
  username?: string | null;
  resource_state?: number;
  firstname?: string;
  lastname?: string;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  sex?: "M" | "F" | null;
  premium?: boolean;
  summit?: boolean;
  created_at?: string;
  updated_at?: string;
  badge_type_id?: number;
  weight?: number;
  profile_medium?: string;
  profile?: string;
  friend?: string | null;
  follower?: string | null;
}

export interface StravaAthleteStats {
  biggest_ride_distance?: number;
  biggest_climb_elevation_gain?: number;
  recent_ride_totals?: StravaActivityTotals;
  recent_run_totals?: StravaActivityTotals;
  recent_swim_totals?: StravaActivityTotals;
  ytd_ride_totals?: StravaActivityTotals;
  ytd_run_totals?: StravaActivityTotals;
  ytd_swim_totals?: StravaActivityTotals;
  all_ride_totals?: StravaActivityTotals;
  all_run_totals?: StravaActivityTotals;
  all_swim_totals?: StravaActivityTotals;
}

export interface StravaActivityTotals {
  count: number;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  elevation_gain: number;
  achievement_count?: number;
}

// ============================================================================
// Activity Types
// ============================================================================

export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type?: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  utc_offset?: number;
  location_city?: string;
  location_state?: string;
  location_country?: string;
  achievement_count?: number;
  kudos_count?: number;
  comment_count?: number;
  athlete_count?: number;
  photo_count?: number;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
  private?: boolean;
  visibility?: string;
  flagged?: boolean;
  gear_id?: string;
  start_latlng?: [number, number];
  end_latlng?: [number, number];
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  elev_high?: number;
  elev_low?: number;
  average_cadence?: number;
  average_temp?: number;
  has_heartrate: boolean;
  heartrate_opt_out?: boolean;
  display_hide_heartrate_option?: boolean;
  upload_id?: number;
  upload_id_str?: string;
  external_id?: string;
  from_accepted_tag?: boolean;
  pr_count?: number;
  total_photo_count?: number;
  has_kudoed?: boolean;
  map?: StravaMap;
  resource_state?: number;
  athlete?: {
    id: number;
    resource_state?: number;
  };
  // Detailed activity fields
  calories?: number;
  description?: string;
  photos?: {
    primary?: {
      id?: number;
      unique_id?: string;
      urls?: Record<string, string>;
      source?: number;
    };
    count?: number;
  };
  gear?: {
    id: string;
    primary: boolean;
    name: string;
    distance: number;
  };
  laps?: StravaLap[];
  splits_metric?: StravaSplit[];
  splits_standard?: StravaSplit[];
  best_efforts?: StravaBestEffort[];
  segment_efforts?: StravaSegmentEffort[];
}

export interface StravaMap {
  id: string;
  summary_polyline?: string;
  polyline?: string;
  resource_state?: number;
}

export interface StravaLap {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  lap_index: number;
  split: number;
  start_index: number;
  end_index: number;
  total_elevation_gain: number;
  average_cadence?: number;
  device_watts?: boolean;
  average_watts?: number;
  pace_zone?: number;
}

export interface StravaSplit {
  distance: number;
  elapsed_time: number;
  elevation_difference: number;
  moving_time: number;
  split: number;
  average_speed: number;
  average_heartrate?: number;
  pace_zone?: number;
}

export interface StravaBestEffort {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  start_index: number;
  end_index: number;
  pr_rank?: number | null;
  achievements?: StravaAchievement[];
}

export interface StravaAchievement {
  type_id: number;
  type: string;
  rank: number;
}

// ============================================================================
// Comment Types
// ============================================================================

export interface StravaComment {
  id: number;
  activity_id: number;
  text: string;
  athlete: StravaAthlete;
  created_at: string;
}

// ============================================================================
// Kudos Types
// ============================================================================

export interface StravaKudoser {
  firstname: string;
  lastname: string;
}

// ============================================================================
// Club Types
// ============================================================================

export interface StravaClub {
  id: number;
  resource_state: number;
  name: string;
  profile_medium?: string;
  profile?: string;
  cover_photo?: string;
  cover_photo_small?: string;
  activity_types?: string[];
  activity_types_icon?: string;
  dimensions?: string[];
  sport_type?: string;
  city?: string;
  state?: string;
  country?: string;
  private?: boolean;
  member_count?: number;
  featured?: boolean;
  verified?: boolean;
  url?: string;
  membership?: "member" | "pending" | null;
  admin?: boolean;
  owner?: boolean;
  description?: string;
  club_type?: string;
  post_count?: number;
  owner_id?: number;
  following_count?: number;
}

export interface StravaClubActivity {
  resource_state: number;
  athlete: {
    firstname: string;
    lastname: string;
  };
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type?: string;
  workout_type?: number | null;
}

export interface StravaClubMember {
  firstname: string;
  lastname: string;
  membership: string;
  admin: boolean;
  owner: boolean;
}

export interface StravaClubAdmin {
  firstname: string;
  lastname: string;
  membership: string;
  admin: boolean;
  owner: boolean;
}

// ============================================================================
// Gear Types
// ============================================================================

export interface StravaGear {
  id: string;
  primary: boolean;
  name: string;
  distance: number;
  resource_state: number;
  brand_name?: string;
  model_name?: string;
  frame_type?: number;
  description?: string;
  nickname?: string;
  retired?: boolean;
  weight?: number;
}

// ============================================================================
// Route Types
// ============================================================================

export interface StravaRoute {
  id: number;
  resource_state: number;
  name: string;
  description?: string;
  athlete: {
    id: number;
    resource_state: number;
  };
  distance: number;
  elevation_gain: number;
  map: StravaMap;
  type: number;
  sub_type: number;
  private: boolean;
  starred: boolean;
  timestamp: number;
  segments?: StravaSegment[];
  created_at: string;
  updated_at: string;
  estimated_moving_time: number;
  waypoints?: StravaWaypoint[];
}

export interface StravaWaypoint {
  latlng: [number, number];
  target_latlng?: [number, number];
  categories?: string[];
  title?: string;
  description?: string;
  distance_into_route?: number;
}

// ============================================================================
// Segment Types
// ============================================================================

export interface StravaSegmentEffort {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  start_index: number;
  end_index: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  device_watts?: boolean;
  average_watts?: number;
  segment: StravaSegment;
  kom_rank?: number | null;
  pr_rank?: number | null;
  achievements?: StravaAchievement[];
  hidden: boolean;
}

export interface StravaSegment {
  id: number;
  name: string;
  activity_type: string;
  distance: number;
  average_grade: number;
  maximum_grade: number;
  elevation_high: number;
  elevation_low: number;
  start_latlng: [number, number];
  end_latlng: [number, number];
  climb_category: number;
  city: string;
  state: string;
  country: string;
  private: boolean;
  hazardous: boolean;
  starred: boolean;
  // Detailed segment fields
  resource_state?: number;
  created_at?: string;
  updated_at?: string;
  total_elevation_gain?: number;
  map?: StravaMap;
  effort_count?: number;
  athlete_count?: number;
  star_count?: number;
  athlete_segment_stats?: {
    pr_elapsed_time?: number;
    pr_date?: string;
    pr_activity_id?: number;
    effort_count?: number;
  };
  xoms?: {
    kom?: string;
    qom?: string;
    overall?: string;
  };
  local_legend?: {
    athlete_id?: number;
    title?: string;
    profile?: string;
    effort_description?: string;
    effort_count?: string;
    effort_counts?: {
      overall?: string;
      female?: string;
    };
    destination?: string;
  };
}

export interface StravaExplorerSegment {
  id: number;
  name: string;
  climb_category: number;
  climb_category_desc: string;
  avg_grade: number;
  start_latlng: [number, number];
  end_latlng: [number, number];
  elev_difference: number;
  distance: number;
  points: string;
  starred: boolean;
  resource_state: number;
}

export interface StravaExplorerResponse {
  segments: StravaExplorerSegment[];
}

// ============================================================================
// Upload Types
// ============================================================================

export interface StravaUpload {
  id: number;
  id_str: string;
  external_id: string;
  error: string | null;
  status: string;
  activity_id: number | null;
}

// ============================================================================
// Athlete Zones Types
// ============================================================================

export interface StravaAthleteZones {
  heart_rate?: {
    custom_zones: boolean;
    zones: StravaZone[];
  };
  power?: {
    zones: StravaZone[];
  };
}

// ============================================================================
// Zones Types
// ============================================================================

export interface StravaZone {
  min: number;
  max: number;
}

export interface StravaHeartRateZones {
  custom_zones: boolean;
  zones: StravaZone[];
}

export interface StravaPowerZones {
  zones: StravaZone[];
}

export interface StravaActivityZones {
  heart_rate?: StravaHeartRateZones;
  power?: StravaPowerZones;
}

// ============================================================================
// Streams Types
// ============================================================================

export type StravaStreamType =
  | "time"
  | "distance"
  | "latlng"
  | "altitude"
  | "velocity_smooth"
  | "heartrate"
  | "cadence"
  | "watts"
  | "temp"
  | "moving"
  | "grade_smooth";

export interface StravaStream {
  type: StravaStreamType;
  data: number[] | [number, number][];
  series_type: "time" | "distance";
  original_size: number;
  resolution: string;
}

export type StravaStreams = {
  [K in StravaStreamType]?: StravaStream;
};

// ============================================================================
// Request Options
// ============================================================================

/** Base options for all requests */
export interface RequestOptions {
  /** Optional AbortSignal to cancel the request */
  signal?: AbortSignal;
}

export interface GetActivitiesOptions extends RequestOptions {
  /** Epoch timestamp to filter activities that occurred before */
  before?: number;
  /** Epoch timestamp to filter activities that occurred after */
  after?: number;
  /** Page number (default: 1) */
  page?: number;
  /** Number of items per page (default: 30, max: 200) */
  per_page?: number;
}

export interface GetActivityStreamsOptions extends RequestOptions {
  /** List of stream types to retrieve */
  keys?: StravaStreamType[];
  /** Whether to return streams keyed by type (default: true) */
  key_by_type?: boolean;
}

export interface CreateActivityOptions extends RequestOptions {
  /** The name of the activity */
  name: string;
  /** Type of activity (e.g., 'Run', 'Ride', 'Swim') */
  sport_type: string;
  /** ISO 8601 formatted date time */
  start_date_local: string;
  /** In seconds */
  elapsed_time: number;
  /** Type of activity (deprecated, use sport_type) */
  type?: string;
  /** Description of the activity */
  description?: string;
  /** In meters */
  distance?: number;
  /** Set to true to mark as a trainer activity */
  trainer?: boolean;
  /** Set to true to mark as commute */
  commute?: boolean;
}

export interface UpdateActivityOptions extends RequestOptions {
  /** The name of the activity */
  name?: string;
  /** Type of activity (e.g., 'Run', 'Ride', 'Swim') */
  sport_type?: string;
  /** Description of the activity */
  description?: string;
  /** Identifier for the gear associated with the activity */
  gear_id?: string;
  /** Set to true to mark as a trainer activity */
  trainer?: boolean;
  /** Set to true to mark as commute */
  commute?: boolean;
  /** Set to true to mute activity */
  hide_from_home?: boolean;
}

export interface UpdateAthleteOptions extends RequestOptions {
  /** The weight of the athlete in kilograms */
  weight?: number;
}

export interface PaginationOptions extends RequestOptions {
  /** Page number (default: 1) */
  page?: number;
  /** Number of items per page (default: 30, max: 200) */
  per_page?: number;
}

export interface ExploreSegmentsOptions extends RequestOptions {
  /** The bounds of the area to search: [south, west, north, east] */
  bounds: [number, number, number, number];
  /** Activity type: 'running' or 'riding' */
  activity_type?: "running" | "riding";
  /** Minimum climb category */
  min_cat?: number;
  /** Maximum climb category */
  max_cat?: number;
}

export interface GetSegmentEffortsOptions extends RequestOptions {
  /** ISO 8601 formatted date time */
  start_date_local?: string;
  /** ISO 8601 formatted date time */
  end_date_local?: string;
  /** Number of items per page (max: 200) */
  per_page?: number;
}

export interface UploadActivityOptions extends RequestOptions {
  /** The file to upload */
  file: Blob | Buffer;
  /** The name of the file */
  name?: string;
  /** The description of the activity */
  description?: string;
  /** Set to true to mark as a trainer activity */
  trainer?: boolean;
  /** Set to true to mark as commute */
  commute?: boolean;
  /** The format of the file: 'fit', 'fit.gz', 'tcx', 'tcx.gz', 'gpx', 'gpx.gz' */
  data_type: "fit" | "fit.gz" | "tcx" | "tcx.gz" | "gpx" | "gpx.gz";
  /** External identifier */
  external_id?: string;
}

// ============================================================================
// Rate Limit Info
// ============================================================================

export interface StravaRateLimitInfo {
  /** Current 15-minute usage (requests, daily limit) */
  shortTerm: {
    usage: number;
    limit: number;
  };
  /** Current daily usage (requests, daily limit) */
  longTerm: {
    usage: number;
    limit: number;
  };
}

// ============================================================================
// Logging Types
// ============================================================================

export interface StravaRequestInfo {
  /** HTTP method */
  method: string;
  /** Full URL */
  url: string;
  /** Request headers (excluding Authorization value for security) */
  headers: Record<string, string>;
}

export interface StravaResponseInfo {
  /** HTTP method */
  method: string;
  /** Full URL */
  url: string;
  /** HTTP status code */
  status: number;
  /** Response time in milliseconds */
  duration: number;
}

// ============================================================================
// Webhook Types
// ============================================================================

/** Webhook subscription details */
export interface StravaWebhookSubscription {
  /** Subscription ID */
  id: number;
  /** Application ID */
  application_id: number;
  /** Callback URL where webhook events are sent */
  callback_url: string;
  /** Timestamp when subscription was created */
  created_at: string;
  /** Timestamp when subscription was last updated */
  updated_at: string;
}

/** Valid object types in webhook events (const assertion for runtime validation) */
export const STRAVA_WEBHOOK_OBJECT_TYPES = ["activity", "athlete"] as const;

/** Object type in webhook event */
export type StravaWebhookObjectType = (typeof STRAVA_WEBHOOK_OBJECT_TYPES)[number];

/** Valid aspect types in webhook events (const assertion for runtime validation) */
export const STRAVA_WEBHOOK_ASPECT_TYPES = ["create", "update", "delete"] as const;

/** Aspect type (action) in webhook event */
export type StravaWebhookAspectType = (typeof STRAVA_WEBHOOK_ASPECT_TYPES)[number];

/** Webhook event payload from Strava */
export interface StravaWebhookEvent {
  /** Type of object affected - "activity" or "athlete" */
  object_type: StravaWebhookObjectType;
  /** ID of the affected activity or athlete */
  object_id: number;
  /** Type of action - "create", "update", or "delete" */
  aspect_type: StravaWebhookAspectType;
  /** Hash of updated fields (only present for update events) */
  updates?: Record<string, string>;
  /** Athlete's ID who owns the object */
  owner_id: number;
  /** Push subscription ID */
  subscription_id: number;
  /** Unix timestamp of the event */
  event_time: number;
}

/** Webhook verification challenge request from Strava */
export interface StravaWebhookVerificationRequest {
  /** Challenge string to echo back */
  "hub.challenge": string;
  /** Mode - always "subscribe" */
  "hub.mode": string;
  /** Verification token to validate */
  "hub.verify_token": string;
}

/** Options for creating a webhook subscription */
export interface CreateWebhookSubscriptionOptions {
  /** URL where Strava will send webhook events */
  callbackUrl: string;
  /** Token used to verify the callback URL */
  verifyToken: string;
}

// ============================================================================
// Client Configuration
// ============================================================================

export interface StravaClientConfig {
  /** Strava OAuth client ID */
  clientId: string;
  /** Strava OAuth client secret */
  clientSecret: string;
  /** OAuth redirect URI */
  redirectUri?: string;
  /** Auto-refresh tokens when they expire (default: true) */
  autoRefresh?: boolean;
  /** Buffer time in seconds before expiry to trigger refresh (default: 600 = 10 minutes) */
  refreshBuffer?: number;
  /** Default request timeout in milliseconds (default: 30000 = 30 seconds) */
  timeout?: number;
  /** Optional callback when tokens are refreshed */
  onTokenRefresh?: (tokens: StravaTokens) => void | Promise<void>;
  /** Optional callback before each request (for logging/debugging) */
  onRequest?: (info: StravaRequestInfo) => void;
  /** Optional callback after each response (for logging/debugging) */
  onResponse?: (info: StravaResponseInfo) => void;
}
