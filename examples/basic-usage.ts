/**
 * Basic Usage Example
 * Demonstrates the most common use cases for the Strava API Client
 */

import { StravaClient } from "../index";

async function basicUsage() {
  // Initialize the client
  const client = new StravaClient({
    clientId: process.env.STRAVA_CLIENT_ID!,
    clientSecret: process.env.STRAVA_CLIENT_SECRET!,
    redirectUri: process.env.REDIRECT_URI || "http://localhost:3000/callback",
  });

  console.log("Strava API Client - Basic Usage Example\n");

  // Step 1: Get authorization URL (redirect user to this URL)
  const authUrl = client.getAuthorizationUrl("activity:read_all");
  console.log("1. Authorization URL:");
  console.log(authUrl);
  console.log("\nRedirect the user to this URL to authorize your app.\n");

  // Step 2: After user authorizes, you'll receive a code
  // Exchange it for tokens (this is simulated here)
  const authCode = "YOUR_AUTH_CODE_HERE"; // You'll get this from the callback

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
    console.log("3. Fetching athlete information...");
    const athlete = await client.getAthlete();
    console.log(`   Name: ${athlete.firstname} ${athlete.lastname}`);
    console.log(`   Location: ${athlete.city}, ${athlete.country}`);
    console.log(`   Premium: ${athlete.premium ? "Yes" : "No"}\n`);

    // Step 4: Get recent activities
    console.log("4. Fetching recent activities...");
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
    console.log("5. Fetching athlete stats...");
    const stats = await client.getAthleteStats(athlete.id);
    if (stats.all_run_totals) {
      const totalDistanceKm = (stats.all_run_totals.distance / 1000).toFixed(2);
      const totalHours = (stats.all_run_totals.moving_time / 3600).toFixed(1);
      console.log(`   All-time running stats:`);
      console.log(`      Total runs: ${stats.all_run_totals.count}`);
      console.log(`      Total distance: ${totalDistanceKm} km`);
      console.log(`      Total time: ${totalHours} hours\n`);
    }

    // Step 6: Check rate limits
    const rateLimits = client.getRateLimitInfo();
    if (rateLimits) {
      console.log("6. Rate Limit Status:");
      console.log(`   15-min: ${rateLimits.shortTerm.usage}/${rateLimits.shortTerm.limit}`);
      console.log(`   Daily: ${rateLimits.longTerm.usage}/${rateLimits.longTerm.limit}\n`);
    }

    // Step 7: Get detailed activity with streams
    if (activities.length > 0) {
      const firstActivity = activities[0];
      console.log("7. Fetching detailed activity data...");
      const detailedActivity = await client.getActivity(firstActivity.id, true);
      console.log(`   Activity: ${detailedActivity.name}`);
      console.log(`   Elevation gain: ${detailedActivity.total_elevation_gain}m`);
      console.log(`   Average HR: ${detailedActivity.average_heartrate || "N/A"}`);
      console.log(`   Calories: ${detailedActivity.calories || "N/A"}\n`);

      // Get streams data
      console.log("8. Fetching activity streams...");
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
    }

    console.log("✅ Example completed successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Run the example
if (require.main === module) {
  basicUsage();
}

export default basicUsage;
