# Strava API Client - Quick Start Guide

Get up and running with the Strava API Client in 5 minutes.

## 1. Copy the Module

Copy the entire `strava-client` directory to your project:

```bash
cp -r lib/strava-client /path/to/your/project/lib/
```

## 2. Requirements

- Node.js 18+ (uses native fetch)
- No additional dependencies required

## 3. Get Strava API Credentials

1. Go to https://www.strava.com/settings/api
2. Create a new application
3. Note your **Client ID** and **Client Secret**
4. Set your **Authorization Callback Domain** (e.g., `localhost` for development)

## 4. Create Environment Variables

Create a `.env` file in your project root:

```env
STRAVA_CLIENT_ID=your_client_id_here
STRAVA_CLIENT_SECRET=your_client_secret_here
REDIRECT_URI=http://localhost:3000/auth/callback
```

## 5. Basic Implementation

### Simple Script Example

```typescript
import { StravaClient } from "./lib/strava-client";

async function main() {
  // Initialize client
  const client = new StravaClient({
    clientId: process.env.STRAVA_CLIENT_ID!,
    clientSecret: process.env.STRAVA_CLIENT_SECRET!,
  });

  // Set tokens (you'll get these from OAuth flow)
  client.setTokens({
    accessToken: "your_access_token",
    refreshToken: "your_refresh_token",
    expiresAt: 1234567890, // Unix timestamp
  });

  // Fetch athlete data
  const athlete = await client.getAthlete();
  console.log(`Welcome ${athlete.firstname}!`);

  // Fetch activities
  const activities = await client.getActivities({ per_page: 10 });
  console.log(`You have ${activities.length} recent activities`);
}

main();
```

### Express Server Example

```typescript
import express from "express";
import { StravaClient } from "./lib/strava-client";

const app = express();
const client = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
  redirectUri: "http://localhost:3000/auth/callback",
});

// Step 1: Redirect user to Strava
app.get("/auth", (req, res) => {
  const authUrl = client.getAuthorizationUrl("activity:read_all");
  res.redirect(authUrl);
});

// Step 2: Handle callback from Strava
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;

  // Exchange code for tokens
  const tokenResponse = await client.exchangeAuthorizationCode(code as string);

  // Save tokens to your database
  await db.saveTokens(tokenResponse.athlete.id, {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: tokenResponse.expires_at,
  });

  res.redirect("/dashboard");
});

// Step 3: Use the API
app.get("/api/activities", async (req, res) => {
  // Load tokens from database
  const tokens = await db.getTokens(userId);
  client.setTokens(tokens);

  // Fetch activities
  const activities = await client.getActivities();
  res.json(activities);
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

## 6. OAuth Flow Overview

The OAuth flow has 3 steps:

### Step 1: Get Authorization URL

```typescript
const authUrl = client.getAuthorizationUrl("activity:read_all");
// Redirect user to: authUrl
```

### Step 2: User Authorizes

User logs into Strava and authorizes your app. Strava redirects back to your callback URL with a `code` parameter.

### Step 3: Exchange Code for Tokens

```typescript
const tokenResponse = await client.exchangeAuthorizationCode(code);
// Save these tokens to your database!
```

## 7. Token Storage

**Important**: You must store tokens in your database!

```typescript
// Example token storage structure
interface UserTokens {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  createdAt: Date;
  updatedAt: Date;
}

// Save tokens after OAuth
async function saveTokens(athleteId: number, tokens: StravaTokens) {
  await database.upsert("user_tokens", {
    userId: athleteId.toString(),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    updatedAt: new Date(),
  });
}

// Load tokens before API calls
async function loadTokens(athleteId: number): Promise<StravaTokens> {
  const record = await database.findOne("user_tokens", { userId: athleteId.toString() });
  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    expiresAt: record.expiresAt,
  };
}
```

## 8. Automatic Token Refresh

Enable automatic token refresh with the `onTokenRefresh` callback:

```typescript
const client = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
  autoRefresh: true, // Enable auto-refresh (default: true)
  onTokenRefresh: async (tokens) => {
    // Update tokens in your database
    console.log("Tokens refreshed!");
    await database.updateTokens(userId, tokens);
  },
});
```

## 9. Common API Calls

### Get Athlete Info

```typescript
const athlete = await client.getAthlete();
console.log(`${athlete.firstname} ${athlete.lastname}`);
```

### Get Activities

```typescript
// Get recent activities (paginated)
const activities = await client.getActivities({ per_page: 50 });

// Get all activities (auto-pagination)
const allActivities = await client.getAllActivities();

// Get activities after a specific date
const after = new Date("2024-01-01").getTime() / 1000;
const recentActivities = await client.getAllActivities({ after });
```

### Get Activity Details

```typescript
// Get detailed activity
const activity = await client.getActivity(activityId, true);

// Get time-series data (streams)
const streams = await client.getActivityStreams(activityId);

// Access specific stream data
if (streams.heartrate) {
  console.log("Heart rate data:", streams.heartrate.data);
}
```

### Get Athlete Stats

```typescript
const athlete = await client.getAthlete();
const stats = await client.getAthleteStats(athlete.id);

console.log("All-time runs:", stats.all_run_totals?.count);
console.log("YTD distance:", stats.ytd_run_totals?.distance);
```

## 10. Error Handling

Always wrap API calls in try-catch blocks:

```typescript
import { StravaRateLimitError, StravaAuthenticationError } from "./lib/strava-client";

try {
  const activities = await client.getActivities();
} catch (error) {
  if (error instanceof StravaRateLimitError) {
    console.error("Rate limit exceeded!");
    console.error(`Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof StravaAuthenticationError) {
    console.error("Authentication failed - re-authenticate user");
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## 11. Monitor Rate Limits

Strava has rate limits:

- **Short-term**: 200 requests per 15 minutes
- **Daily**: 2,000 requests per day

```typescript
// Check rate limit status after API calls
const rateLimits = client.getRateLimitInfo();
if (rateLimits) {
  console.log("15-min usage:", rateLimits.shortTerm.usage, "/", rateLimits.shortTerm.limit);
  console.log("Daily usage:", rateLimits.longTerm.usage, "/", rateLimits.longTerm.limit);
}
```

## 12. TypeScript Benefits

The client is fully typed:

```typescript
import { StravaActivity, StravaAthlete } from './lib/strava-client';

// TypeScript knows the exact structure
const activity: StravaActivity = await client.getActivity(123);
console.log(activity.distance); // ✅ Type-safe
console.log(activity.invalidField); // ❌ TypeScript error

// Auto-completion in your IDE
athlete.
  // Your IDE will show: firstname, lastname, city, country, etc.
```

## Complete Minimal Example

Here's a complete, minimal working example:

```typescript
import express from "express";
import cookieParser from "cookie-parser";
import { StravaClient } from "./lib/strava-client";

const app = express();
app.use(cookieParser());

const client = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
  redirectUri: "http://localhost:3000/callback",
});

// In-memory token storage (use database in production!)
const tokens = new Map();

app.get("/auth", (req, res) => {
  res.redirect(client.getAuthorizationUrl("activity:read_all"));
});

app.get("/callback", async (req, res) => {
  const tokenResponse = await client.exchangeAuthorizationCode(req.query.code as string);
  tokens.set("user", {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: tokenResponse.expires_at,
  });
  res.cookie("user", "user");
  res.redirect("/dashboard");
});

app.get("/dashboard", async (req, res) => {
  client.setTokens(tokens.get(req.cookies.user));
  const athlete = await client.getAthlete();
  const activities = await client.getActivities({ per_page: 5 });

  res.send(`
    <h1>Welcome ${athlete.firstname}!</h1>
    <h2>Recent Activities:</h2>
    <ul>
      ${activities.map((a) => `<li>${a.name} - ${(a.distance / 1000).toFixed(2)}km</li>`).join("")}
    </ul>
  `);
});

app.listen(3000, () => console.log("Running on http://localhost:3000"));
```

## Next Steps

- Read the full [README.md](./README.md) for comprehensive documentation
- Check out the [examples/](./examples/) directory for more examples
- Review the [types.ts](./types.ts) file for all available types
- Visit [Strava API Docs](https://developers.strava.com/docs/reference/) for API details

## Need Help?

- Check the [README.md](./README.md) for detailed documentation
- Review error messages - they're designed to be helpful
- Ensure your tokens are being stored and loaded correctly
- Verify your Strava API credentials are correct
- Check that your callback URL matches in both your code and Strava settings

## Common Issues

### "Not authenticated" error

→ Make sure you're calling `client.setTokens()` before API calls

### "Token refresh failed" error

→ Your refresh token may be invalid - user needs to re-authenticate

### Rate limit errors

→ You've exceeded Strava's rate limits - implement backoff and caching

### CORS errors (in browser)

→ Strava API must be called from server-side code, not browser JavaScript

---

You're now ready to build amazing Strava integrations! 🚀
