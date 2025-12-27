/**
 * Segments and Routes Example
 * Demonstrates how to explore segments, manage starred segments,
 * work with routes, and export route data.
 */

import { StravaClient } from "../index";
import * as fs from "fs";
import * as path from "path";

// Initialize the client
const client = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
});

// Set tokens (in production, load these from your database)
client.setTokens({
  accessToken: process.env.STRAVA_ACCESS_TOKEN!,
  refreshToken: process.env.STRAVA_REFRESH_TOKEN!,
  expiresAt: parseInt(process.env.STRAVA_EXPIRES_AT || "0"),
});

// ============================================================================
// Segment Exploration
// ============================================================================

/**
 * Explore segments in a geographic area.
 * Useful for finding popular climbs or segments in a region.
 */
async function exploreSegmentsInArea() {
  console.log("=== Exploring Segments in an Area ===\n");

  // Define a bounding box (southwest lat, southwest lng, northeast lat, northeast lng)
  // This example covers part of the Alps near Alpe d'Huez
  const bounds: [number, number, number, number] = [
    45.0, // Southwest latitude
    6.0, // Southwest longitude
    45.2, // Northeast latitude
    6.2, // Northeast longitude
  ];

  // Explore cycling segments
  console.log("Searching for cycling segments...");
  const cyclingSegments = await client.exploreSegments({
    bounds,
    activity_type: "riding",
    min_cat: 1, // Minimum climb category (1 = hardest)
    max_cat: 4, // Maximum climb category
  });

  console.log(`Found ${cyclingSegments.segments.length} cycling segments:\n`);
  cyclingSegments.segments.forEach((segment, index) => {
    console.log(`${index + 1}. ${segment.name}`);
    console.log(`   ID: ${segment.id}`);
    console.log(`   Distance: ${(segment.distance / 1000).toFixed(2)} km`);
    console.log(`   Avg Grade: ${segment.avg_grade}%`);
    console.log(`   Climb Category: ${segment.climb_category || "N/A"}`);
    console.log(`   Elevation: ${segment.elev_difference}m gain\n`);
  });

  // Explore running segments
  console.log("\nSearching for running segments...");
  const runningSegments = await client.exploreSegments({
    bounds,
    activity_type: "running",
  });

  console.log(`Found ${runningSegments.segments.length} running segments.\n`);

  return cyclingSegments.segments;
}

/**
 * Get detailed information about a specific segment
 */
async function getSegmentDetails(segmentId: number) {
  console.log(`\n=== Segment Details (ID: ${segmentId}) ===\n`);

  const segment = await client.getSegment(segmentId);

  console.log(`Name: ${segment.name}`);
  console.log(`Distance: ${(segment.distance / 1000).toFixed(2)} km`);
  console.log(`Average Grade: ${segment.average_grade}%`);
  console.log(`Maximum Grade: ${segment.maximum_grade}%`);
  console.log(`Elevation High: ${segment.elevation_high}m`);
  console.log(`Elevation Low: ${segment.elevation_low}m`);
  console.log(`Total Elevation Gain: ${segment.total_elevation_gain}m`);
  console.log(`Climb Category: ${segment.climb_category}`);
  console.log(`Starred: ${segment.starred ? "Yes" : "No"}`);
  console.log(`Effort Count: ${segment.effort_count}`);
  console.log(`Athlete Count: ${segment.athlete_count}`);

  if (segment.local_legend) {
    console.log(`\nLocal Legend: ${segment.local_legend.title}`);
  }

  return segment;
}

/**
 * Get segment streams (elevation profile, etc.)
 */
async function getSegmentElevationProfile(segmentId: number) {
  console.log(`\n=== Segment Elevation Profile (ID: ${segmentId}) ===\n`);

  const streams = await client.getSegmentStreams(segmentId, {
    keys: ["distance", "altitude"],
  });

  if (streams.altitude && streams.distance) {
    const altitudeData = streams.altitude.data as number[];
    const distanceData = streams.distance.data as number[];

    console.log(`Data points: ${altitudeData.length}`);
    console.log(`Start elevation: ${altitudeData[0]}m`);
    console.log(`End elevation: ${altitudeData[altitudeData.length - 1]}m`);
    console.log(`Total distance: ${(distanceData[distanceData.length - 1] / 1000).toFixed(2)} km`);

    // Calculate elevation gain/loss
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < altitudeData.length; i++) {
      const diff = altitudeData[i] - altitudeData[i - 1];
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }
    console.log(`Calculated elevation gain: ${gain.toFixed(0)}m`);
    console.log(`Calculated elevation loss: ${loss.toFixed(0)}m`);
  }

  return streams;
}

// ============================================================================
// Starred Segments Management
// ============================================================================

/**
 * Get all starred segments with auto-pagination
 */
async function getAllStarredSegments() {
  console.log("\n=== Starred Segments ===\n");

  const starredSegments = await client.getAllStarredSegments();
  console.log(`You have ${starredSegments.length} starred segments:\n`);

  starredSegments.slice(0, 10).forEach((segment, index) => {
    console.log(`${index + 1}. ${segment.name}`);
    console.log(`   Distance: ${(segment.distance / 1000).toFixed(2)} km`);
    console.log(`   Avg Grade: ${segment.average_grade}%\n`);
  });

  if (starredSegments.length > 10) {
    console.log(`... and ${starredSegments.length - 10} more starred segments`);
  }

  return starredSegments;
}

/**
 * Star or unstar a segment
 */
async function toggleStarSegment(segmentId: number, starred: boolean) {
  console.log(`\n${starred ? "Starring" : "Unstarring"} segment ${segmentId}...`);

  const segment = await client.starSegment(segmentId, starred);
  console.log(`Segment "${segment.name}" is now ${segment.starred ? "starred" : "unstarred"}`);

  return segment;
}

// ============================================================================
// Segment Efforts
// ============================================================================

/**
 * Get your efforts on a specific segment
 */
async function getMySegmentEfforts(segmentId: number) {
  console.log(`\n=== My Efforts on Segment ${segmentId} ===\n`);

  // Get efforts from the last year
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const efforts = await client.getSegmentEfforts(segmentId, {
    start_date_local: oneYearAgo.toISOString(),
    end_date_local: new Date().toISOString(),
    per_page: 10,
  });

  console.log(`Found ${efforts.length} efforts in the last year:\n`);

  efforts.forEach((effort, index) => {
    const minutes = Math.floor(effort.elapsed_time / 60);
    const seconds = effort.elapsed_time % 60;
    console.log(`${index + 1}. ${effort.name}`);
    console.log(`   Time: ${minutes}:${seconds.toString().padStart(2, "0")}`);
    console.log(`   Date: ${effort.start_date_local}`);
    console.log(`   Segment: ${effort.segment.name}`);
    if (effort.pr_rank) {
      console.log(`   PR Rank: #${effort.pr_rank}`);
    }
    console.log();
  });

  return efforts;
}

/**
 * Get detailed streams for a segment effort (for analysis/comparison)
 */
async function getSegmentEffortStreams(effortId: number) {
  console.log(`\n=== Segment Effort Streams (ID: ${effortId}) ===\n`);

  const streams = await client.getSegmentEffortStreams(effortId, {
    keys: ["time", "distance", "altitude", "heartrate", "watts"],
  });

  console.log("Available streams:");
  Object.keys(streams).forEach((key) => {
    const stream = streams[key as keyof typeof streams];
    if (stream) {
      console.log(`   - ${key}: ${stream.data.length} data points`);
    }
  });

  return streams;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Get all routes created by the athlete
 */
async function getAthleteRoutes() {
  console.log("\n=== My Routes ===\n");

  const athlete = await client.getAthlete();
  const routes = await client.getAthleteRoutes(athlete.id, { per_page: 30 });

  console.log(`Found ${routes.length} routes:\n`);

  routes.forEach((route, index) => {
    console.log(`${index + 1}. ${route.name}`);
    console.log(`   ID: ${route.id}`);
    console.log(`   Distance: ${(route.distance / 1000).toFixed(2)} km`);
    console.log(`   Elevation Gain: ${route.elevation_gain.toFixed(0)}m`);
    console.log(`   Type: ${route.type === 1 ? "Ride" : "Run"}`);
    console.log(`   Created: ${route.created_at}\n`);
  });

  return routes;
}

/**
 * Get route details and streams
 */
async function getRouteDetails(routeId: number) {
  console.log(`\n=== Route Details (ID: ${routeId}) ===\n`);

  const route = await client.getRoute(routeId);

  console.log(`Name: ${route.name}`);
  console.log(`Description: ${route.description || "N/A"}`);
  console.log(`Distance: ${(route.distance / 1000).toFixed(2)} km`);
  console.log(`Elevation Gain: ${route.elevation_gain.toFixed(0)}m`);
  console.log(`Type: ${route.type === 1 ? "Ride" : "Run"}`);
  console.log(`Starred: ${route.starred ? "Yes" : "No"}`);
  console.log(`Private: ${route.private ? "Yes" : "No"}`);
  console.log(`Estimated Moving Time: ${Math.round(route.estimated_moving_time / 60)} minutes`);

  // Get route streams for elevation profile
  console.log("\nFetching route streams...");
  const streams = await client.getRouteStreams(routeId);

  if (streams.altitude) {
    console.log(`Elevation data points: ${streams.altitude.data.length}`);
    const altData = streams.altitude.data as number[];
    console.log(`Min elevation: ${Math.min(...altData).toFixed(0)}m`);
    console.log(`Max elevation: ${Math.max(...altData).toFixed(0)}m`);
  }

  return route;
}

/**
 * Export a route to GPX format
 */
async function exportRouteToGPX(routeId: number, outputDir: string = "./exports") {
  console.log(`\n=== Exporting Route ${routeId} to GPX ===\n`);

  // Get route info for filename
  const route = await client.getRoute(routeId);
  const gpxContent = await client.exportRouteGPX(routeId);

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create a safe filename
  const safeFilename = route.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filepath = path.join(outputDir, `${safeFilename}_${routeId}.gpx`);

  fs.writeFileSync(filepath, gpxContent);
  console.log(`GPX exported to: ${filepath}`);
  console.log(`File size: ${(gpxContent.length / 1024).toFixed(2)} KB`);

  return filepath;
}

/**
 * Export a route to TCX format
 */
async function exportRouteToTCX(routeId: number, outputDir: string = "./exports") {
  console.log(`\n=== Exporting Route ${routeId} to TCX ===\n`);

  const route = await client.getRoute(routeId);
  const tcxContent = await client.exportRouteTCX(routeId);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const safeFilename = route.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filepath = path.join(outputDir, `${safeFilename}_${routeId}.tcx`);

  fs.writeFileSync(filepath, tcxContent);
  console.log(`TCX exported to: ${filepath}`);
  console.log(`File size: ${(tcxContent.length / 1024).toFixed(2)} KB`);

  return filepath;
}

// ============================================================================
// Main Example
// ============================================================================

async function main() {
  console.log("Strava Segments and Routes Example\n");
  console.log("=".repeat(50) + "\n");

  try {
    // Explore segments in an area
    const segments = await exploreSegmentsInArea();

    // Get details of the first segment found
    if (segments.length > 0) {
      await getSegmentDetails(segments[0].id);
      await getSegmentElevationProfile(segments[0].id);
    }

    // Get starred segments
    await getAllStarredSegments();

    // Get athlete routes
    const routes = await getAthleteRoutes();

    // If routes exist, show details and export the first one
    if (routes.length > 0) {
      await getRouteDetails(routes[0].id);

      // Export route to GPX and TCX
      // Uncomment to actually export:
      // await exportRouteToGPX(routes[0].id);
      // await exportRouteToTCX(routes[0].id);
      console.log("\n(Uncomment export lines in code to save GPX/TCX files)");
    }

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
  exploreSegmentsInArea,
  getSegmentDetails,
  getSegmentElevationProfile,
  getAllStarredSegments,
  toggleStarSegment,
  getMySegmentEfforts,
  getSegmentEffortStreams,
  getAthleteRoutes,
  getRouteDetails,
  exportRouteToGPX,
  exportRouteToTCX,
};
