/**
 * Activity Management Example
 * Demonstrates creating, updating, and uploading activities,
 * as well as working with activity details like comments and kudos.
 */

import { StravaClient, StravaRateLimitError } from "../index";
import * as fs from "fs";
import * as path from "path";

// Initialize the client
const client = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
  onTokenRefresh: async (tokens) => {
    console.log("[Tokens refreshed - save to database in production]");
  },
});

// Set tokens (in production, load these from your database)
client.setTokens({
  accessToken: process.env.STRAVA_ACCESS_TOKEN!,
  refreshToken: process.env.STRAVA_REFRESH_TOKEN!,
  expiresAt: parseInt(process.env.STRAVA_EXPIRES_AT || "0"),
});

// ============================================================================
// Create Manual Activities
// ============================================================================

/**
 * Create a manual activity (e.g., for activities not recorded with GPS)
 */
async function createManualActivity() {
  console.log("=== Creating Manual Activity ===\n");

  const activity = await client.createActivity({
    name: "Morning Gym Session",
    type: "WeightTraining",
    sport_type: "WeightTraining",
    start_date_local: new Date().toISOString(),
    elapsed_time: 3600, // 1 hour in seconds
    description: "Upper body workout: bench press, rows, shoulder press",
    // Optional fields:
    // distance: 0, // in meters
    // trainer: true, // indoor activity
    // commute: false,
  });

  console.log(`Activity created successfully!`);
  console.log(`   ID: ${activity.id}`);
  console.log(`   Name: ${activity.name}`);
  console.log(`   Type: ${activity.type}`);
  console.log(`   Duration: ${activity.elapsed_time / 60} minutes`);
  console.log(`   URL: https://www.strava.com/activities/${activity.id}\n`);

  return activity;
}

/**
 * Create a run activity with distance
 */
async function createRunActivity() {
  console.log("=== Creating Run Activity ===\n");

  const activity = await client.createActivity({
    name: "Treadmill Run",
    type: "Run",
    sport_type: "Run",
    start_date_local: new Date().toISOString(),
    elapsed_time: 1800, // 30 minutes
    distance: 5000, // 5 km in meters
    description: "Easy recovery run on the treadmill",
    trainer: true, // Indoor activity
  });

  console.log(`Run activity created!`);
  console.log(`   Distance: ${(activity.distance / 1000).toFixed(2)} km`);
  console.log(
    `   Pace: ${(activity.elapsed_time / 60 / (activity.distance / 1000)).toFixed(2)} min/km`
  );

  return activity;
}

// ============================================================================
// Update Activities
// ============================================================================

/**
 * Update an existing activity's details
 */
async function updateActivity(activityId: number) {
  console.log(`\n=== Updating Activity ${activityId} ===\n`);

  const updatedActivity = await client.updateActivity(activityId, {
    name: "Updated Activity Name",
    description: "Updated description with more details",
    // You can also update:
    // type: "Ride",
    // sport_type: "Ride",
    // gear_id: "g12345", // Assign gear
    // trainer: false,
    // commute: true,
    // hide_from_home: false,
  });

  console.log(`Activity updated!`);
  console.log(`   New name: ${updatedActivity.name}`);
  console.log(`   Description: ${updatedActivity.description}`);

  return updatedActivity;
}

/**
 * Mark an activity as a commute
 */
async function markAsCommute(activityId: number) {
  console.log(`\nMarking activity ${activityId} as commute...`);

  const activity = await client.updateActivity(activityId, {
    commute: true,
  });

  console.log(`Activity marked as commute: ${activity.commute ? "Yes" : "No"}`);
  return activity;
}

/**
 * Assign gear to an activity
 */
async function assignGear(activityId: number, gearId: string) {
  console.log(`\nAssigning gear ${gearId} to activity ${activityId}...`);

  const activity = await client.updateActivity(activityId, {
    gear_id: gearId,
  });

  console.log(`Gear assigned: ${activity.gear_id}`);
  return activity;
}

// ============================================================================
// Upload Activities
// ============================================================================

/**
 * Upload an activity file (GPX, TCX, FIT)
 */
async function uploadActivityFile(filepath: string) {
  console.log(`\n=== Uploading Activity File ===\n`);
  console.log(`File: ${filepath}`);

  // Determine file type from extension
  const ext = path.extname(filepath).toLowerCase();
  let dataType: "fit" | "fit.gz" | "tcx" | "tcx.gz" | "gpx" | "gpx.gz";
  switch (ext) {
    case ".fit":
      dataType = "fit";
      break;
    case ".tcx":
      dataType = "tcx";
      break;
    case ".gpx":
      dataType = "gpx";
      break;
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }

  // Read the file
  const fileBuffer = fs.readFileSync(filepath);
  const file = new Blob([fileBuffer], { type: "application/octet-stream" });

  // Upload the file
  const upload = await client.uploadActivity({
    file,
    data_type: dataType,
    name: "Uploaded Activity", // Optional, Strava will use file data if not provided
    description: "Uploaded via API",
    // trainer: false,
    // commute: false,
    // external_id: "unique-id-123", // Your unique ID for deduplication
  });

  console.log(`Upload initiated!`);
  console.log(`   Upload ID: ${upload.id}`);
  console.log(`   Status: ${upload.status}`);

  if (upload.activity_id) {
    console.log(`   Activity ID: ${upload.activity_id}`);
  } else {
    console.log(`   Processing... Check status with getUpload(${upload.id})`);
  }

  return upload;
}

/**
 * Check upload status and wait for completion
 */
async function waitForUpload(uploadId: number, maxWaitSeconds: number = 60) {
  console.log(`\n=== Waiting for Upload ${uploadId} ===\n`);

  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;

  while (Date.now() - startTime < maxWaitMs) {
    const upload = await client.getUpload(uploadId);

    console.log(`Status: ${upload.status}`);

    if (upload.activity_id) {
      console.log(`\nUpload complete!`);
      console.log(`   Activity ID: ${upload.activity_id}`);
      console.log(`   URL: https://www.strava.com/activities/${upload.activity_id}`);
      return upload;
    }

    if (upload.error) {
      console.error(`\nUpload failed: ${upload.error}`);
      throw new Error(upload.error);
    }

    // Wait 2 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Upload timed out after ${maxWaitSeconds} seconds`);
}

// ============================================================================
// Activity Details
// ============================================================================

/**
 * Get comprehensive activity details
 */
async function getActivityDetails(activityId: number) {
  console.log(`\n=== Activity Details (ID: ${activityId}) ===\n`);

  // Get detailed activity info with all segment efforts
  const activity = await client.getActivity(activityId, true);

  console.log(`Name: ${activity.name}`);
  console.log(`Type: ${activity.type} (${activity.sport_type})`);
  console.log(`Date: ${activity.start_date_local}`);
  console.log(`Distance: ${(activity.distance / 1000).toFixed(2)} km`);
  console.log(`Moving Time: ${Math.round(activity.moving_time / 60)} min`);
  console.log(`Elapsed Time: ${Math.round(activity.elapsed_time / 60)} min`);
  console.log(`Elevation Gain: ${activity.total_elevation_gain}m`);

  if (activity.average_speed) {
    console.log(`Average Speed: ${(activity.average_speed * 3.6).toFixed(1)} km/h`);
  }
  if (activity.max_speed) {
    console.log(`Max Speed: ${(activity.max_speed * 3.6).toFixed(1)} km/h`);
  }
  if (activity.average_heartrate) {
    console.log(`Average HR: ${activity.average_heartrate} bpm`);
  }
  if (activity.max_heartrate) {
    console.log(`Max HR: ${activity.max_heartrate} bpm`);
  }
  if ((activity as any).average_watts) {
    console.log(`Average Power: ${(activity as any).average_watts}W`);
  }
  if ((activity as any).kilojoules) {
    console.log(`Work: ${(activity as any).kilojoules} kJ`);
  }
  if (activity.calories) {
    console.log(`Calories: ${activity.calories}`);
  }

  console.log(`\nGear: ${activity.gear?.name || "None"}`);
  console.log(`Kudos: ${activity.kudos_count}`);
  console.log(`Comments: ${activity.comment_count}`);

  if (activity.segment_efforts && activity.segment_efforts.length > 0) {
    console.log(`\nSegment Efforts: ${activity.segment_efforts.length}`);
    activity.segment_efforts.slice(0, 5).forEach((effort) => {
      const time = `${Math.floor(effort.elapsed_time / 60)}:${(effort.elapsed_time % 60).toString().padStart(2, "0")}`;
      console.log(`   - ${effort.name}: ${time}`);
      if (effort.pr_rank) {
        console.log(`     PR Rank: #${effort.pr_rank}`);
      }
    });
    if (activity.segment_efforts.length > 5) {
      console.log(`   ... and ${activity.segment_efforts.length - 5} more`);
    }
  }

  return activity;
}

/**
 * Get activity comments
 */
async function getActivityComments(activityId: number) {
  console.log(`\n=== Activity Comments ===\n`);

  const comments = await client.getActivityComments(activityId, { per_page: 30 });
  console.log(`Found ${comments.length} comments:\n`);

  comments.forEach((comment, index) => {
    console.log(`${index + 1}. ${comment.athlete.firstname} ${comment.athlete.lastname}`);
    console.log(`   "${comment.text}"`);
    console.log(`   Posted: ${comment.created_at}\n`);
  });

  return comments;
}

/**
 * Get activity kudoers (who gave kudos)
 */
async function getActivityKudoers(activityId: number) {
  console.log(`\n=== Activity Kudoers ===\n`);

  const kudoers = await client.getActivityKudoers(activityId, { per_page: 30 });
  console.log(`Found ${kudoers.length} kudoers:\n`);

  kudoers.forEach((kudoser, index) => {
    console.log(`${index + 1}. ${kudoser.firstname} ${kudoser.lastname}`);
  });

  return kudoers;
}

/**
 * Get activity laps (auto-laps or manual laps)
 */
async function getActivityLaps(activityId: number) {
  console.log(`\n=== Activity Laps ===\n`);

  const laps = await client.getActivityLaps(activityId);
  console.log(`Found ${laps.length} laps:\n`);

  laps.forEach((lap, index) => {
    const pace = lap.moving_time / 60 / (lap.distance / 1000);
    console.log(`Lap ${index + 1}:`);
    console.log(`   Distance: ${(lap.distance / 1000).toFixed(2)} km`);
    console.log(
      `   Time: ${Math.round(lap.moving_time / 60)}:${(lap.moving_time % 60).toString().padStart(2, "0")}`
    );
    console.log(
      `   Pace: ${Math.floor(pace)}:${Math.round((pace % 1) * 60)
        .toString()
        .padStart(2, "0")} /km`
    );
    if (lap.average_heartrate) {
      console.log(`   Avg HR: ${lap.average_heartrate} bpm`);
    }
    console.log();
  });

  return laps;
}

/**
 * Get activity zones (time in heart rate / power zones)
 */
async function getActivityZones(activityId: number) {
  console.log(`\n=== Activity Zones ===\n`);

  const zones = await client.getActivityZones(activityId);

  if (zones.heart_rate) {
    console.log("Heart Rate Zones:");
    console.log(`   Custom zones: ${zones.heart_rate.custom_zones ? "Yes" : "No"}`);
    console.log("   Zone distribution:");
    zones.heart_rate.zones.forEach((zone, i) => {
      console.log(`      Zone ${i + 1}: ${zone.min}-${zone.max} bpm`);
    });
  }

  if (zones.power) {
    console.log("\nPower Zones:");
    console.log("   Zone distribution:");
    zones.power.zones.forEach((zone, i) => {
      console.log(`      Zone ${i + 1}: ${zone.min}-${zone.max}W`);
    });
  }

  return zones;
}

// ============================================================================
// Bulk Operations with Rate Limit Handling
// ============================================================================

/**
 * Process multiple activities with rate limit handling
 */
async function processActivitiesWithRateLimiting(activityIds: number[]) {
  console.log(`\n=== Processing ${activityIds.length} Activities ===\n`);

  const results = [];

  for (const activityId of activityIds) {
    try {
      const activity = await client.getActivity(activityId);
      console.log(`Processed: ${activity.name}`);
      results.push({ id: activityId, success: true, name: activity.name });

      // Check rate limits proactively
      const rateLimits = client.getRateLimitInfo();
      if (rateLimits) {
        const shortTermRemaining = rateLimits.shortTerm.limit - rateLimits.shortTerm.usage;
        if (shortTermRemaining < 10) {
          console.log(`\nApproaching rate limit (${shortTermRemaining} remaining). Pausing...`);
          // Wait for 15-minute window to reset
          await new Promise((resolve) => setTimeout(resolve, 60000));
        }
      }
    } catch (error) {
      if (error instanceof StravaRateLimitError) {
        console.log(`\nRate limit exceeded. Waiting ${error.retryAfter} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, (error.retryAfter ?? 60) * 1000));
        // Retry this activity
        try {
          const activity = await client.getActivity(activityId);
          results.push({ id: activityId, success: true, name: activity.name });
        } catch (retryError) {
          results.push({ id: activityId, success: false, error: retryError });
        }
      } else {
        results.push({ id: activityId, success: false, error });
      }
    }
  }

  console.log(
    `\nProcessed ${results.filter((r) => r.success).length}/${activityIds.length} successfully`
  );
  return results;
}

// ============================================================================
// Main Example
// ============================================================================

async function main() {
  console.log("Strava Activity Management Example\n");
  console.log("=".repeat(50) + "\n");

  try {
    // Get recent activities to work with
    const activities = await client.getActivities({ per_page: 5 });

    if (activities.length === 0) {
      console.log("No activities found. Creating a manual activity...\n");
      // Uncomment to create a test activity:
      // await createManualActivity();
      return;
    }

    // Get details of the most recent activity
    const activityId = activities[0].id;
    console.log(`Working with activity: ${activities[0].name} (ID: ${activityId})\n`);

    // Get comprehensive details
    await getActivityDetails(activityId);

    // Get laps
    await getActivityLaps(activityId);

    // Get comments and kudos
    await getActivityComments(activityId);
    await getActivityKudoers(activityId);

    // Get zones (if available)
    try {
      await getActivityZones(activityId);
    } catch (error) {
      console.log("\nZones not available for this activity");
    }

    // Demonstration notes
    console.log("\n" + "=".repeat(50));
    console.log("\nTo create/update activities, uncomment the relevant functions:");
    console.log("  - createManualActivity()");
    console.log("  - createRunActivity()");
    console.log("  - updateActivity(activityId)");
    console.log("  - uploadActivityFile('path/to/file.gpx')");

    console.log("\nExample completed successfully!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export {
  createManualActivity,
  createRunActivity,
  updateActivity,
  markAsCommute,
  assignGear,
  uploadActivityFile,
  waitForUpload,
  getActivityDetails,
  getActivityComments,
  getActivityKudoers,
  getActivityLaps,
  getActivityZones,
  processActivitiesWithRateLimiting,
};
