/**
 * Strava API Client
 * A complete, reusable TypeScript client for the Strava API v3
 *
 * @packageDocumentation
 */

// Main client
export { StravaClient } from "./client";

// Type definitions
export type {
  // OAuth
  StravaTokenResponse,
  StravaTokens,
  // Athlete
  StravaAthlete,
  StravaAthleteStats,
  StravaAthleteZones,
  StravaActivityTotals,
  // Activities
  StravaActivity,
  StravaMap,
  StravaLap,
  StravaSplit,
  StravaBestEffort,
  StravaAchievement,
  // Comments & Kudos
  StravaComment,
  StravaKudoser,
  // Clubs
  StravaClub,
  StravaClubActivity,
  StravaClubMember,
  StravaClubAdmin,
  // Gear
  StravaGear,
  // Routes
  StravaRoute,
  StravaWaypoint,
  // Segments
  StravaSegmentEffort,
  StravaSegment,
  StravaExplorerSegment,
  StravaExplorerResponse,
  // Zones
  StravaZone,
  StravaHeartRateZones,
  StravaPowerZones,
  StravaActivityZones,
  // Streams
  StravaStreamType,
  StravaStream,
  StravaStreams,
  // Uploads
  StravaUpload,
  // Options
  GetActivitiesOptions,
  GetActivityStreamsOptions,
  CreateActivityOptions,
  UpdateActivityOptions,
  UpdateAthleteOptions,
  PaginationOptions,
  ExploreSegmentsOptions,
  GetSegmentEffortsOptions,
  UploadActivityOptions,
  // Config
  StravaRateLimitInfo,
  StravaClientConfig,
  // Logging
  StravaRequestInfo,
  StravaResponseInfo,
} from "./types";

// Error classes
export {
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
