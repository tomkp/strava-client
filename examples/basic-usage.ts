/**
 * Basic Usage Example
 * Demonstrates the most common use cases for the Strava API Client
 * including proper error handling for different error types.
 */

import { StravaClient, StravaError, StravaRateLimitError } from "../index";

async function basicUsage() {
  // Initialize the client with optional callbacks
  const client = new StravaClient({
    clientId: process.env.STRAVA_CLIENT_ID!,
    clientSecret: process.env.STRAVA_CLIENT_SECRET!,
    redirectUri: process.env.REDIRECT_URI || "http://localhost:3000/callback",
    // Callback when tokens are automatically refreshed
    onTokenRefresh: async (tokens) => {
      console.log("   [Token refreshed, save to database]");
      // In production: await database.saveTokens(userId, tokens);
    },
  });

  console.log("Strava API Client - Basic Usage Example\n");

  // Step 1: Get authorization URL (redirect user to this URL)
  const authUrl = client.getAuthorizationUrl("activity:read_all,profile:read_all");
  console.log("1. Authorization URL:");
  console.log(authUrl);
  console.log("\nRedirect the user to this URL to authorize your app.\n");

  // Step 2: After user authorizes, you'll receive a code
  // Exchange it for tokens (this is simulated here)
  // const authCode = "YOUR_AUTH_CODE_HERE"; // You'll get this from the callback

  try {
    // Uncomment the following when you have a real auth code:
    // const tokenResponse = await client.exchangeAuthorizationCode(authCode);
    // console.log('2. Tokens received:');
    // console.log(`   Access Token: ${tokenResponse.access_token.substring(0, 20)}...`);
    // console.log(`   Expires At: ${new Date(tokenResponse.expires_at * 1000).toISOString()}`);
    // console.log(`   Athlete: ${tokenResponse.athlete.firstname} ${tokenResponse.athlete.lastname}\n`);

    // For this example, set tokens manually (replace with your actual tokens)
    client.setTokens({
      accessToken: process.env.STRAVA_ACCESS_TOKEN || "",
      refreshToken: process.env.STRAVA_REFRESH_TOKEN || "",
      expiresAt: parseInt(process.env.STRAVA_EXPIRES_AT || "0"),
    });

    // Step 3: Get athlete information
    console.log("2. Fetching athlete information...");
    const athlete = await client.getAthlete();
    console.log(`   Name: ${athlete.firstname} ${athlete.lastname}`);
    console.log(`   Location: ${athlete.city}, ${athlete.country}`);
    console.log(`   Premium: ${athlete.premium ? "Yes" : "No"}\n`);

    // Step 4: Get recent activities
    console.log("3. Fetching recent activities...");
    const activities = await client.getActivities({ per_page: 5 });
    console.log(`   Found ${activities.length} recent activities:\n`);

    activities.forEach((activity, index) => {
      const distanceKm = (activity.distance / 1000).toFixed(2);
      const durationMin = Math.round(activity.moving_time / 60);
      console.log(`   ${index + 1}. ${activity.name}`);
      console.log(`      Type: ${activity.type}`);
      console.log(`      Distance: ${distanceKm} km`);
      console.log(`      Duration: ${durationMin} minutes`);
      console.log(`      Date: ${activity.start_date_local}\n`);
    });

    // Step 5: Get athlete stats
    console.log("4. Fetching athlete stats...");
    const stats = await client.getAthleteStats(athlete.id);
    if (stats.all_run_totals) {
      const totalDistanceKm = (stats.all_run_totals.distance / 1000).toFixed(2);
      const totalHours = (stats.all_run_totals.moving_time / 3600).toFixed(1);
      console.log(`   All-time running stats:`);
      console.log(`      Total runs: ${stats.all_run_totals.count}`);
      console.log(`      Total distance: ${totalDistanceKm} km`);
      console.log(`      Total time: ${totalHours} hours\n`);
    }
    if (stats.all_ride_totals) {
      const totalDistanceKm = (stats.all_ride_totals.distance / 1000).toFixed(2);
      const totalHours = (stats.all_ride_totals.moving_time / 3600).toFixed(1);
      console.log(`   All-time cycling stats:`);
      console.log(`      Total rides: ${stats.all_ride_totals.count}`);
      console.log(`      Total distance: ${totalDistanceKm} km`);
      console.log(`      Total time: ${totalHours} hours\n`);
    }

    // Step 6: Check rate limits
    const rateLimits = client.getRateLimitInfo();
    if (rateLimits) {
      console.log("5. Rate Limit Status:");
      console.log(`   15-min: ${rateLimits.shortTerm.usage}/${rateLimits.shortTerm.limit}`);
      console.log(`   Daily: ${rateLimits.longTerm.usage}/${rateLimits.longTerm.limit}\n`);
    }

    // Step 7: Get detailed activity with streams
    if (activities.length > 0) {
      const firstActivity = activities[0];
      console.log("6. Fetching detailed activity data...");
      const detailedActivity = await client.getActivity(firstActivity.id, true);
      console.log(`   Activity: ${detailedActivity.name}`);
      console.log(`   Elevation gain: ${detailedActivity.total_elevation_gain}m`);
      console.log(`   Average HR: ${detailedActivity.average_heartrate || "N/A"}`);
      console.log(`   Calories: ${detailedActivity.calories || "N/A"}\n`);

      // Get streams data (time-series data from the activity)
      console.log("7. Fetching activity streams...");
      const streams = await client.getActivityStreams(firstActivity.id, {
        keys: ["time", "distance", "altitude", "heartrate"],
      });

      console.log("   Available streams:");
      Object.keys(streams).forEach((key) => {
        const stream = streams[key as keyof typeof streams];
        if (stream) {
          console.log(`      - ${key}: ${stream.data.length} data points`);
        }
      });
      console.log();

      // Get activity laps
      console.log("8. Fetching activity laps...");
      const laps = await client.getActivityLaps(firstActivity.id);
      console.log(`   Found ${laps.length} laps`);
      laps.slice(0, 3).forEach((lap, index) => {
        console.log(
          `      Lap ${index + 1}: ${(lap.distance / 1000).toFixed(2)} km in ${Math.round(lap.moving_time / 60)} min`
        );
      });
      if (laps.length > 3) {
        console.log(`      ... and ${laps.length - 3} more laps`);
      }
      console.log();
    }

    // Step 8: Get athlete's gear
    if (activities.length > 0 && activities[0].gear_id) {
      console.log("9. Fetching gear information...");
      const gear = await client.getGear(activities[0].gear_id);
      console.log(`   Gear: ${gear.name}`);
      console.log(`   Distance: ${(gear.distance / 1000).toFixed(0)} km`);
      console.log(`   Primary: ${gear.primary ? "Yes" : "No"}\n`);
    }

    // Step 9: Get athlete zones (heart rate / power)
    console.log("10. Fetching athlete zones...");
    try {
      const zones = await client.getAthleteZones();
      if (zones.heart_rate) {
        console.log("   Heart rate zones:");
        zones.heart_rate.zones.forEach((zone, i) => {
          console.log(`      Zone ${i + 1}: ${zone.min}-${zone.max} bpm`);
        });
      }
    } catch (err) {
      // Zones require specific permissions
      console.log("   Zones not available (requires profile:read_all scope)");
    }
    console.log();

    console.log("Example completed successfully!");
  } catch (error) {
    if (error instanceof StravaError) {
      switch (error.code) {
        case "STRAVA_RATE_LIMIT":
          const rateLimitError = error as StravaRateLimitError;
          console.error(`Rate limit exceeded. Retry after: ${rateLimitError.retryAfter}s`);
          break;
        case "STRAVA_AUTH_ERROR":
          console.error("Authentication failed. Re-authenticate via OAuth.");
          break;
        case "STRAVA_NOT_FOUND":
          console.error(`Resource not found: ${error.message}`);
          break;
        case "STRAVA_VALIDATION_ERROR":
          console.error(`Validation error: ${error.message}`);
          break;
        case "STRAVA_NETWORK_ERROR":
          console.error("Network error. Check your connection.");
          break;
        default:
          console.error(`Strava error [${error.code}]: ${error.message}`);
      }
    } else {
      console.error("Unexpected error:", error);
    }
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  basicUsage();
}

export default basicUsage;
