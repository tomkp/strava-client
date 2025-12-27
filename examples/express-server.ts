/**
 * Express Server Example
 * Complete example of integrating the Strava API client with Express.js
 *
 * Required dependencies (install separately):
 *   npm install express cookie-parser
 *   npm install -D @types/express @types/cookie-parser
 */

import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import { StravaClient, StravaTokens, StravaRateLimitError } from "../index";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());

// Initialize Strava client
const stravaClient = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
  redirectUri: process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/callback`,
  onTokenRefresh: async (tokens) => {
    // In a real app, save refreshed tokens to your database
    console.log("Tokens refreshed at:", new Date().toISOString());
    // await database.updateTokens(userId, tokens);
  },
});

// In-memory storage (replace with a real database in production)
const userTokens = new Map<string, StravaTokens>();

// ============================================================================
// Authentication Routes
// ============================================================================

/**
 * Initiate OAuth flow
 */
app.get("/auth/strava", (req: Request, res: Response) => {
  const authUrl = stravaClient.getAuthorizationUrl("activity:read_all", { state: "random-state" });
  res.redirect(authUrl);
});

/**
 * OAuth callback
 */
app.get("/auth/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send("Authorization code missing");
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await stravaClient.exchangeAuthorizationCode(code as string);

    // Store tokens (in production, use a database)
    const userId = tokenResponse.athlete.id.toString();
    userTokens.set(userId, {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_at,
    });

    // Set session cookie
    res.cookie("strava_user_id", userId, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.send(`
      <html>
        <body>
          <h1>Authentication Successful!</h1>
          <p>Welcome ${tokenResponse.athlete.firstname} ${tokenResponse.athlete.lastname}!</p>
          <p><a href="/dashboard">Go to Dashboard</a></p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth error:", error);
    res.status(500).send("Authentication failed");
  }
});

/**
 * Logout
 */
app.post("/auth/logout", (req: Request, res: Response) => {
  const userId = req.cookies.strava_user_id;
  if (userId) {
    userTokens.delete(userId);
  }
  res.clearCookie("strava_user_id");
  res.json({ success: true });
});

// ============================================================================
// Protected Routes (require authentication)
// ============================================================================

/**
 * Middleware to check authentication
 */
function requireAuth(req: Request, res: Response, next: express.NextFunction) {
  const userId = req.cookies.strava_user_id;

  if (!userId || !userTokens.has(userId)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Load tokens into client
  const tokens = userTokens.get(userId)!;
  stravaClient.setTokens(tokens);

  next();
}

/**
 * Dashboard page
 */
app.get("/dashboard", requireAuth, (req: Request, res: Response) => {
  res.send(`
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; }
          button { padding: 10px 20px; margin: 5px; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>Strava Dashboard</h1>
        <div id="content"></div>
        <script>
          async function loadData() {
            const response = await fetch('/api/athlete');
            const athlete = await response.json();

            document.getElementById('content').innerHTML = \`
              <h2>Welcome \${athlete.firstname} \${athlete.lastname}!</h2>
              <p>Location: \${athlete.city || 'Unknown'}, \${athlete.country || 'Unknown'}</p>
              <p><a href="/api/activities">View Activities</a></p>
              <p><a href="/api/stats">View Stats</a></p>
              <button onclick="logout()">Logout</button>
            \`;
          }

          async function logout() {
            await fetch('/auth/logout', { method: 'POST' });
            window.location.href = '/';
          }

          loadData();
        </script>
      </body>
    </html>
  `);
});

/**
 * Get athlete info
 */
app.get("/api/athlete", requireAuth, async (req: Request, res: Response) => {
  try {
    const athlete = await stravaClient.getAthlete();
    res.json(athlete);
  } catch (error) {
    console.error("Error fetching athlete:", error);
    res.status(500).json({ error: "Failed to fetch athlete data" });
  }
});

/**
 * Get athlete stats
 */
app.get("/api/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const athlete = await stravaClient.getAthlete();
    const stats = await stravaClient.getAthleteStats(athlete.id);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

/**
 * Get activities
 */
app.get("/api/activities", requireAuth, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 30;

    const activities = await stravaClient.getActivities({
      page,
      per_page: perPage,
    });

    // Include rate limit info in response headers
    const rateLimits = stravaClient.getRateLimitInfo();
    if (rateLimits) {
      res.setHeader(
        "X-RateLimit-Short",
        `${rateLimits.shortTerm.usage}/${rateLimits.shortTerm.limit}`
      );
      res.setHeader(
        "X-RateLimit-Daily",
        `${rateLimits.longTerm.usage}/${rateLimits.longTerm.limit}`
      );
    }

    res.json(activities);
  } catch (error) {
    if (error instanceof StravaRateLimitError) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: error.retryAfter,
      });
    }
    console.error("Error fetching activities:", error);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

/**
 * Get all activities (with pagination handled automatically)
 */
app.get("/api/activities/all", requireAuth, async (req: Request, res: Response) => {
  try {
    const after = req.query.after ? parseInt(req.query.after as string) : undefined;

    const activities = await stravaClient.getAllActivities({ after });
    res.json({
      count: activities.length,
      activities,
    });
  } catch (error) {
    console.error("Error fetching all activities:", error);
    res.status(500).json({ error: "Failed to fetch all activities" });
  }
});

/**
 * Get activity details
 */
app.get("/api/activities/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const activityId = parseInt(req.params.id);
    const activity = await stravaClient.getActivity(activityId, true);
    res.json(activity);
  } catch (error) {
    console.error("Error fetching activity:", error);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

/**
 * Get activity streams
 */
app.get("/api/activities/:id/streams", requireAuth, async (req: Request, res: Response) => {
  try {
    const activityId = parseInt(req.params.id);
    const streams = await stravaClient.getActivityStreams(activityId);
    res.json(streams);
  } catch (error) {
    console.error("Error fetching streams:", error);
    res.status(500).json({ error: "Failed to fetch streams" });
  }
});

/**
 * Get rate limit info
 */
app.get("/api/rate-limits", requireAuth, (req: Request, res: Response) => {
  const rateLimits = stravaClient.getRateLimitInfo();
  res.json(rateLimits || { message: "No rate limit data available yet" });
});

// ============================================================================
// Home Page
// ============================================================================

app.get("/", (req: Request, res: Response) => {
  res.send(`
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 100px auto; text-align: center; }
          a { display: inline-block; padding: 15px 30px; background: #fc4c02; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>Strava API Client Example</h1>
        <p>Connect your Strava account to get started</p>
        <a href="/auth/strava">Connect with Strava</a>
      </body>
    </html>
  `);
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📝 Visit http://localhost:${PORT} to start`);
});

export default app;
