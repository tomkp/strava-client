# @tomkp/strava

A complete, type-safe TypeScript client for the Strava API v3.

## Features

- Full TypeScript support with comprehensive type definitions
- Automatic token refresh when tokens expire
- Rate limit tracking
- Specific error types for different failure scenarios
- Zero runtime dependencies - uses native fetch
- Database agnostic - works with any storage solution
- Framework agnostic - use with Express, Fastify, Next.js, or any Node.js app

## Installation

```bash
npm install @tomkp/strava
# or
yarn add @tomkp/strava
# or
pnpm add @tomkp/strava
```

> **Note**: Requires Node.js 18+ (uses native fetch)

## Quick Start

### 1. Initialize the Client

```typescript
import { StravaClient } from "@tomkp/strava";

const client = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
  redirectUri: "http://localhost:3000/auth/callback",
});
```

### 2. OAuth Flow

```typescript
// Redirect user to Strava authorization
const authUrl = client.getAuthorizationUrl("activity:read_all");
// Redirect to: authUrl

// After user authorizes, exchange code for tokens
const tokenResponse = await client.exchangeAuthorizationCode(code);

// Tokens are automatically stored in the client
// You should also save them to your database
await saveTokensToDatabase(tokenResponse);
```

### 3. Make API Calls

```typescript
// Get athlete info
const athlete = await client.getAthlete();
console.log(`Welcome ${athlete.firstname} ${athlete.lastname}!`);

// Get activities
const activities = await client.getActivities({ per_page: 50 });
console.log(`You have ${activities.length} activities`);

// Get detailed activity with streams
const activity = await client.getActivity(activityId);
const streams = await client.getActivityStreams(activityId);
```

## Complete Examples

### Express.js Integration

```typescript
import express from "express";
import { StravaClient, StravaTokens } from "@tomkp/strava";

const app = express();

// Initialize client
const stravaClient = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
  redirectUri: "http://localhost:3000/auth/callback",
  onTokenRefresh: async (tokens) => {
    // Save refreshed tokens to database
    await db.updateTokens(userId, tokens);
  },
});

// OAuth routes
app.get("/auth/strava", (req, res) => {
  const authUrl = stravaClient.getAuthorizationUrl("activity:read_all");
  res.redirect(authUrl);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const tokenResponse = await stravaClient.exchangeAuthorizationCode(code as string);

    // Save tokens to database
    await db.saveUser({
      stravaId: tokenResponse.athlete.id,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_at,
    });

    res.redirect("/dashboard");
  } catch (error) {
    console.error("OAuth error:", error);
    res.redirect("/error");
  }
});

// API routes
app.get("/api/activities", async (req, res) => {
  try {
    // Load tokens from database
    const tokens = await db.getUserTokens(userId);
    stravaClient.setTokens(tokens);

    // Fetch activities
    const activities = await stravaClient.getActivities();
    res.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});
```

### With Automatic Token Refresh

```typescript
import { StravaClient } from "@tomkp/strava";

const client = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
  autoRefresh: true, // Enable automatic refresh (default: true)
  refreshBuffer: 600, // Refresh 10 minutes before expiry (default: 600)
  onTokenRefresh: async (tokens) => {
    // This callback is called whenever tokens are refreshed
    console.log("Tokens refreshed!");
    await database.updateTokens(userId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
  },
});

// Load tokens from database
const storedTokens = await database.getTokens(userId);
client.setTokens(storedTokens);

// The client will automatically refresh tokens if needed
// No need to manually check expiration!
const athlete = await client.getAthlete();
```

### Fetching All Activities with Pagination

```typescript
// Fetch all activities (handles pagination automatically)
const allActivities = await client.getAllActivities();
console.log(`Total activities: ${allActivities.length}`);

// Fetch activities after a specific date
const after = new Date("2024-01-01").getTime() / 1000;
const recentActivities = await client.getAllActivities({ after });

// Fetch with manual pagination control
let page = 1;
let hasMore = true;
const activities = [];

while (hasMore) {
  const pageActivities = await client.getActivities({
    page,
    per_page: 200, // Max allowed by Strava
  });

  if (pageActivities.length === 0) {
    hasMore = false;
  } else {
    activities.push(...pageActivities);
    page++;
  }
}
```

### Error Handling

```typescript
import {
  StravaClient,
  StravaRateLimitError,
  StravaAuthenticationError,
  StravaNotFoundError,
  isStravaErrorType,
} from "@tomkp/strava";

try {
  const activities = await client.getActivities();
} catch (error) {
  // Handle specific error types
  if (isStravaErrorType(error, StravaRateLimitError)) {
    console.error("Rate limit exceeded!");
    console.error(`Retry after: ${error.retryAfter} seconds`);
    console.error(`Current usage: ${error.usage}`);
  } else if (isStravaErrorType(error, StravaAuthenticationError)) {
    console.error("Authentication failed - tokens may be invalid");
    // Redirect user to re-authenticate
  } else if (isStravaErrorType(error, StravaNotFoundError)) {
    console.error("Resource not found");
  } else {
    console.error("Unexpected error:", error);
  }
}
```

### Monitoring Rate Limits

```typescript
// Make an API call
const activities = await client.getActivities();

// Check rate limit status
const rateLimits = client.getRateLimitInfo();
if (rateLimits) {
  console.log("15-minute limit:", rateLimits.shortTerm);
  console.log("Daily limit:", rateLimits.longTerm);

  // Check if approaching limits
  const shortTermPercent = (rateLimits.shortTerm.usage / rateLimits.shortTerm.limit) * 100;
  if (shortTermPercent > 80) {
    console.warn("Approaching short-term rate limit!");
  }
}
```

### Getting Activity Details and Streams

```typescript
// Get detailed activity information
const activity = await client.getActivity(activityId, true); // includeAllEfforts = true

console.log(`Activity: ${activity.name}`);
console.log(`Distance: ${activity.distance}m`);
console.log(`Moving Time: ${activity.moving_time}s`);

// Get time-series data (streams)
const streams = await client.getActivityStreams(activityId, {
  keys: ["time", "distance", "altitude", "heartrate"],
  key_by_type: true,
});

if (streams.heartrate) {
  console.log("Heart rate data:", streams.heartrate.data);
}

if (streams.altitude) {
  console.log("Elevation data:", streams.altitude.data);
}
```

## API Reference

### StravaClient

#### Constructor

```typescript
new StravaClient(config: StravaClientConfig)
```

**Config Options:**

- `clientId` (required): Your Strava OAuth client ID
- `clientSecret` (required): Your Strava OAuth client secret
- `redirectUri` (optional): OAuth callback URL
- `autoRefresh` (optional): Auto-refresh tokens when expired (default: true)
- `refreshBuffer` (optional): Seconds before expiry to trigger refresh (default: 600)
- `onTokenRefresh` (optional): Callback when tokens are refreshed

#### Methods

**Token Management:**

- `setTokens(tokens)` - Set authentication tokens
- `getTokens()` - Get current tokens
- `clearTokens()` - Clear tokens (logout)
- `hasValidTokens()` - Check if tokens are valid
- `getAuthorizationUrl(scope, state?)` - Get OAuth authorization URL
- `exchangeAuthorizationCode(code)` - Exchange auth code for tokens
- `refreshAccessToken(refreshToken?)` - Manually refresh tokens
- `deauthorize()` - Revoke application access

**Athlete:**

- `getAthlete()` - Get authenticated athlete
- `getAthleteStats(athleteId)` - Get athlete statistics

**Activities:**

- `getActivities(options?)` - Get activities (paginated)
- `getAllActivities(options?)` - Get all activities (auto-pagination)
- `getActivity(activityId, includeAllEfforts?)` - Get activity details
- `getActivityStreams(activityId, options?)` - Get time-series data
- `getActivityZones(activityId)` - Get heart rate/power zones
- `getActivityLaps(activityId)` - Get activity laps

**Utilities:**

- `testConnection()` - Test API connection
- `getClientInfo()` - Get client state summary
- `getRateLimitInfo()` - Get current rate limit info

## Type Definitions

All Strava API types are fully typed. Key types include:

- `StravaAthlete` - Athlete profile
- `StravaActivity` - Activity data
- `StravaStreams` - Time-series data
- `StravaTokens` - OAuth tokens
- `StravaRateLimitInfo` - Rate limit information

## Error Types

The client provides specific error classes for different scenarios:

- `StravaAuthenticationError` - Authentication failed (401)
- `StravaAuthorizationError` - Insufficient permissions (403)
- `StravaNotFoundError` - Resource not found (404)
- `StravaRateLimitError` - Rate limit exceeded (429)
- `StravaValidationError` - Invalid parameters (400)
- `StravaNetworkError` - Network/connection error
- `StravaApiError` - Server error (5xx)
- `StravaError` - Base error class

## Strava Rate Limits

Strava has two rate limits:

- **Short-term**: 200 requests per 15 minutes
- **Long-term**: 2,000 requests per day

Use `client.getRateLimitInfo()` to monitor your usage.

## OAuth Scopes

Common OAuth scopes:

- `read` - Read public data
- `read_all` - Read private data
- `activity:read` - Read activities
- `activity:read_all` - Read all activities (including private)
- `activity:write` - Create/update activities
- `profile:read_all` - Read full profile
- `profile:write` - Update profile

Multiple scopes can be combined: `activity:read_all,profile:read_all`

## Environment Variables

Create a `.env` file with your Strava credentials:

```env
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_REDIRECT_URI=http://localhost:3000/auth/callback
```

Get your credentials at: https://www.strava.com/settings/api

## Best Practices

1. **Store tokens securely** - Never expose tokens in client-side code
2. **Use environment variables** - Keep credentials out of your codebase
3. **Handle rate limits** - Monitor usage and implement backoff strategies
4. **Implement token refresh** - Use the `onTokenRefresh` callback to update your database
5. **Error handling** - Always wrap API calls in try-catch blocks
6. **Test connection** - Use `testConnection()` to verify authentication

## License

MIT

## Resources

- [Strava API Documentation](https://developers.strava.com/docs/reference/)
- [Strava API Settings](https://www.strava.com/settings/api)
- [OAuth 2.0 Flow](https://developers.strava.com/docs/authentication/)
