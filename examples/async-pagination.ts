/**
 * Async Pagination Example
 * Demonstrates memory-efficient iteration through large datasets using
 * async generators and various pagination patterns.
 *
 * This is particularly useful when you have:
 * - Thousands of activities to process
 * - Large club memberships
 * - Many starred segments
 * - Any scenario where loading all data into memory is impractical
 */

import { StravaClient, StravaActivity } from "../index";

// Initialize the client
const client = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
});

// Set tokens
client.setTokens({
  accessToken: process.env.STRAVA_ACCESS_TOKEN!,
  refreshToken: process.env.STRAVA_REFRESH_TOKEN!,
  expiresAt: parseInt(process.env.STRAVA_EXPIRES_AT || "0"),
});

// ============================================================================
// Pattern 1: Basic Async Iterator
// ============================================================================

/**
 * Iterate through all activities one by one.
 * Activities are fetched page by page, but processed individually.
 * Memory usage stays constant regardless of total activity count.
 */
async function basicIteratorExample() {
  console.log("=== Basic Async Iterator ===\n");

  let count = 0;
  let totalDistance = 0;

  // The iterator fetches pages on-demand
  for await (const activity of client.iterateActivities()) {
    count++;
    totalDistance += activity.distance;

    // Only log every 10th activity to reduce output
    if (count % 10 === 0) {
      console.log(`Processed ${count} activities...`);
    }
  }

  console.log(`\nTotal: ${count} activities`);
  console.log(`Total distance: ${(totalDistance / 1000).toFixed(0)} km\n`);
}

// ============================================================================
// Pattern 2: Early Termination
// ============================================================================

/**
 * Stop iteration early when a condition is met.
 * Unlike getAllActivities(), this won't fetch unnecessary pages.
 */
async function earlyTerminationExample() {
  console.log("=== Early Termination ===\n");

  console.log("Finding your first marathon (42.195km+)...\n");

  for await (const activity of client.iterateActivities()) {
    // Check if this is a marathon
    if (activity.type === "Run" && activity.distance >= 42195) {
      console.log(`Found it! "${activity.name}"`);
      console.log(`   Date: ${activity.start_date_local}`);
      console.log(`   Distance: ${(activity.distance / 1000).toFixed(2)} km`);
      console.log(
        `   Time: ${Math.floor(activity.moving_time / 3600)}h ${Math.round((activity.moving_time % 3600) / 60)}m`
      );
      return activity; // Stop fetching more pages
    }
  }

  console.log("No marathon found in your activities.");
  return null;
}

// ============================================================================
// Pattern 3: Filtered Iteration with Date Range
// ============================================================================

/**
 * Iterate through activities within a specific date range.
 * The API handles the filtering, reducing data transfer.
 */
async function dateRangeExample() {
  console.log("=== Date Range Filtering ===\n");

  // Get activities from the last 30 days
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  let count = 0;
  let totalTime = 0;

  for await (const activity of client.iterateActivities({ after: thirtyDaysAgo })) {
    count++;
    totalTime += activity.moving_time;
    console.log(
      `${activity.start_date_local.split("T")[0]}: ${activity.name} (${Math.round(activity.moving_time / 60)} min)`
    );
  }

  console.log(`\nLast 30 days: ${count} activities, ${(totalTime / 3600).toFixed(1)} hours\n`);
}

// ============================================================================
// Pattern 4: Collecting with Transform
// ============================================================================

/**
 * Collect and transform activities on-the-fly.
 * Useful for extracting specific data without storing full activity objects.
 */
async function transformExample() {
  console.log("=== Transform on Iteration ===\n");

  interface ActivitySummary {
    id: number;
    name: string;
    date: string;
    distanceKm: number;
    durationMin: number;
    type: string;
  }

  const summaries: ActivitySummary[] = [];
  let processedCount = 0;

  for await (const activity of client.iterateActivities()) {
    // Transform to a lighter summary object
    summaries.push({
      id: activity.id,
      name: activity.name,
      date: activity.start_date_local.split("T")[0],
      distanceKm: Math.round(activity.distance / 100) / 10,
      durationMin: Math.round(activity.moving_time / 60),
      type: activity.type,
    });

    processedCount++;

    // Limit for demo purposes
    if (processedCount >= 100) {
      console.log("(Stopping after 100 activities for demo)\n");
      break;
    }
  }

  // Show type breakdown
  const byType = summaries.reduce(
    (acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log("Activity types:");
  Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

  console.log(`\nStored ${summaries.length} lightweight summaries`);
  return summaries;
}

// ============================================================================
// Pattern 5: Parallel Processing with Batching
// ============================================================================

/**
 * Process activities in batches for parallel operations.
 * Useful when you need to make additional API calls for each activity.
 */
async function batchProcessingExample() {
  console.log("=== Batch Processing ===\n");

  const BATCH_SIZE = 5;
  let batch: StravaActivity[] = [];
  let batchNumber = 0;

  async function processBatch(activities: StravaActivity[]) {
    batchNumber++;
    console.log(`Processing batch ${batchNumber} (${activities.length} activities)...`);

    // Process activities in parallel within the batch
    const results = await Promise.all(
      activities.map(async (activity) => {
        // Simulated processing - in real use, you might fetch streams, etc.
        return {
          id: activity.id,
          name: activity.name,
          hasHeartRate: activity.has_heartrate,
        };
      })
    );

    console.log(`   Completed: ${results.map((r) => r.name).join(", ")}`);
    return results;
  }

  const allResults = [];
  let totalProcessed = 0;

  for await (const activity of client.iterateActivities()) {
    batch.push(activity);

    if (batch.length >= BATCH_SIZE) {
      const results = await processBatch(batch);
      allResults.push(...results);
      batch = [];

      // Limit for demo
      totalProcessed += BATCH_SIZE;
      if (totalProcessed >= 20) {
        console.log("\n(Stopping after 20 activities for demo)");
        break;
      }
    }
  }

  // Process remaining items
  if (batch.length > 0) {
    const results = await processBatch(batch);
    allResults.push(...results);
  }

  console.log(`\nProcessed ${allResults.length} activities in ${batchNumber} batches\n`);
}

// ============================================================================
// Pattern 6: Memory-Efficient Statistics
// ============================================================================

/**
 * Calculate statistics without storing all activities in memory.
 * Uses a single pass through the data with running calculations.
 */
async function streamingStatsExample() {
  console.log("=== Streaming Statistics ===\n");

  // Running statistics - no need to store activities
  const stats = {
    count: 0,
    totalDistance: 0,
    totalTime: 0,
    totalElevation: 0,
    longestActivity: { name: "", distance: 0 },
    fastestPace: { name: "", pace: Infinity }, // for runs
    byYear: {} as Record<number, { count: number; distance: number }>,
    byType: {} as Record<string, { count: number; distance: number; time: number }>,
  };

  console.log("Calculating statistics (this may take a while for large accounts)...\n");

  for await (const activity of client.iterateActivities()) {
    stats.count++;
    stats.totalDistance += activity.distance;
    stats.totalTime += activity.moving_time;
    stats.totalElevation += activity.total_elevation_gain;

    // Track longest activity
    if (activity.distance > stats.longestActivity.distance) {
      stats.longestActivity = { name: activity.name, distance: activity.distance };
    }

    // Track fastest run pace
    if (activity.type === "Run" && activity.distance > 1000) {
      const pace = activity.moving_time / 60 / (activity.distance / 1000);
      if (pace < stats.fastestPace.pace) {
        stats.fastestPace = { name: activity.name, pace };
      }
    }

    // Group by year
    const year = new Date(activity.start_date_local).getFullYear();
    if (!stats.byYear[year]) {
      stats.byYear[year] = { count: 0, distance: 0 };
    }
    stats.byYear[year].count++;
    stats.byYear[year].distance += activity.distance;

    // Group by type
    if (!stats.byType[activity.type]) {
      stats.byType[activity.type] = { count: 0, distance: 0, time: 0 };
    }
    stats.byType[activity.type].count++;
    stats.byType[activity.type].distance += activity.distance;
    stats.byType[activity.type].time += activity.moving_time;

    // Progress update
    if (stats.count % 100 === 0) {
      console.log(`Processed ${stats.count} activities...`);
    }
  }

  // Display results
  console.log(`\n${"=".repeat(40)}`);
  console.log("ALL-TIME STATISTICS");
  console.log("=".repeat(40));

  console.log(`\nTotal activities: ${stats.count}`);
  console.log(`Total distance: ${(stats.totalDistance / 1000).toFixed(0)} km`);
  console.log(`Total time: ${(stats.totalTime / 3600).toFixed(0)} hours`);
  console.log(`Total elevation: ${stats.totalElevation.toFixed(0)} m`);

  console.log(
    `\nLongest activity: "${stats.longestActivity.name}" (${(stats.longestActivity.distance / 1000).toFixed(2)} km)`
  );

  if (stats.fastestPace.pace < Infinity) {
    const paceMin = Math.floor(stats.fastestPace.pace);
    const paceSec = Math.round((stats.fastestPace.pace % 1) * 60);
    console.log(
      `Fastest run pace: ${paceMin}:${paceSec.toString().padStart(2, "0")} /km ("${stats.fastestPace.name}")`
    );
  }

  console.log("\nBy Year:");
  Object.entries(stats.byYear)
    .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
    .forEach(([year, data]) => {
      console.log(`   ${year}: ${data.count} activities, ${(data.distance / 1000).toFixed(0)} km`);
    });

  console.log("\nBy Type:");
  Object.entries(stats.byType)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([type, data]) => {
      console.log(
        `   ${type}: ${data.count} activities, ${(data.distance / 1000).toFixed(0)} km, ${(data.time / 3600).toFixed(0)} hrs`
      );
    });

  return stats;
}

// ============================================================================
// Pattern 7: Club Members Iteration
// ============================================================================

/**
 * Iterate through club members efficiently.
 * Useful for large clubs with hundreds of members.
 */
async function clubMembersIterationExample(clubId: number) {
  console.log(`=== Club Members Iteration (Club ${clubId}) ===\n`);

  let memberCount = 0;
  let adminCount = 0;

  for await (const member of client.iterateClubMembers(clubId)) {
    memberCount++;
    if (member.admin) {
      adminCount++;
      console.log(`Admin: ${member.firstname} ${member.lastname}`);
    }

    // Limit for demo
    if (memberCount >= 50) {
      console.log("\n(Stopping after 50 members for demo)");
      break;
    }
  }

  console.log(`\nProcessed ${memberCount} members, found ${adminCount} admins\n`);
}

// ============================================================================
// Pattern 8: Starred Segments Iteration
// ============================================================================

/**
 * Iterate through starred segments efficiently.
 */
async function starredSegmentsIterationExample() {
  console.log("=== Starred Segments Iteration ===\n");

  let count = 0;
  const climbs = [];

  for await (const segment of client.iterateStarredSegments()) {
    count++;

    // Collect climbing segments
    if (segment.average_grade > 5) {
      climbs.push({
        name: segment.name,
        grade: segment.average_grade,
        distance: segment.distance,
      });
    }

    if (count % 10 === 0) {
      console.log(`Processed ${count} segments...`);
    }
  }

  console.log(`\nTotal starred segments: ${count}`);
  console.log(`Climbing segments (>5% grade): ${climbs.length}`);

  if (climbs.length > 0) {
    console.log("\nTop climbs:");
    climbs
      .sort((a, b) => b.grade - a.grade)
      .slice(0, 5)
      .forEach((climb) => {
        console.log(
          `   ${climb.name}: ${climb.grade.toFixed(1)}% over ${(climb.distance / 1000).toFixed(2)} km`
        );
      });
  }
}

// ============================================================================
// Comparison: getAllActivities vs iterateActivities
// ============================================================================

/**
 * Compare memory usage between the two approaches.
 */
async function comparisonExample() {
  console.log("=== Comparison: getAllActivities vs iterateActivities ===\n");

  console.log("Method 1: getAllActivities()");
  console.log("   - Loads ALL activities into memory at once");
  console.log("   - Simple to use: const activities = await client.getAllActivities()");
  console.log("   - Good for: Small datasets, when you need random access");
  console.log("   - Memory: O(n) where n = number of activities\n");

  console.log("Method 2: iterateActivities()");
  console.log("   - Fetches pages on-demand, processes one activity at a time");
  console.log("   - Usage: for await (const activity of client.iterateActivities()) { ... }");
  console.log("   - Good for: Large datasets, streaming processing, early termination");
  console.log("   - Memory: O(1) constant - only current page in memory\n");

  console.log("Demonstration with first 50 activities:\n");

  // Using iterator (memory-efficient)
  console.log("Using iterateActivities():");
  let iteratorCount = 0;
  const startIterator = Date.now();

  for await (const activity of client.iterateActivities({ per_page: 50 })) {
    iteratorCount++;
    if (iteratorCount >= 50) break;
  }

  console.log(`   Processed ${iteratorCount} activities in ${Date.now() - startIterator}ms`);

  // Using getAllActivities (loads all into memory)
  // Note: For this comparison, we're limiting to recent activities
  console.log("\nUsing getActivities({ per_page: 50 }):");
  const startAll = Date.now();
  const allActivities = await client.getActivities({ per_page: 50 });
  console.log(`   Loaded ${allActivities.length} activities in ${Date.now() - startAll}ms`);

  console.log("\nFor large datasets (1000+ activities), iterateActivities() is recommended.\n");
}

// ============================================================================
// Main Example
// ============================================================================

async function main() {
  console.log("Strava Async Pagination Examples\n");
  console.log("=".repeat(50) + "\n");

  try {
    // Run comparison first
    await comparisonExample();

    // Choose which examples to run (uncomment as needed)

    // Basic patterns
    // await basicIteratorExample();
    // await earlyTerminationExample();
    // await dateRangeExample();

    // Advanced patterns
    // await transformExample();
    // await batchProcessingExample();

    // Full statistics calculation (can take a while for large accounts)
    await streamingStatsExample();

    // Club members (requires a club ID)
    // const clubs = await client.getAthleteClubs({ per_page: 1 });
    // if (clubs.length > 0) {
    //   await clubMembersIterationExample(clubs[0].id);
    // }

    // Starred segments
    // await starredSegmentsIterationExample();

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
  basicIteratorExample,
  earlyTerminationExample,
  dateRangeExample,
  transformExample,
  batchProcessingExample,
  streamingStatsExample,
  clubMembersIterationExample,
  starredSegmentsIterationExample,
  comparisonExample,
};
