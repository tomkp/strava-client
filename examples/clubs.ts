/**
 * Clubs Example
 * Demonstrates how to work with Strava clubs: listing clubs,
 * viewing club details, members, and activities.
 */

import { StravaClient } from "../index";

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
// List Athlete's Clubs
// ============================================================================

/**
 * Get all clubs the authenticated athlete is a member of
 */
async function getMyClubs() {
  console.log("=== My Clubs ===\n");

  const clubs = await client.getAthleteClubs({ per_page: 30 });
  console.log(`You are a member of ${clubs.length} clubs:\n`);

  clubs.forEach((club, index) => {
    console.log(`${index + 1}. ${club.name}`);
    console.log(`   ID: ${club.id}`);
    console.log(`   Sport: ${club.sport_type}`);
    console.log(`   Members: ${club.member_count}`);
    console.log(`   Location: ${club.city}, ${club.country}`);
    console.log(`   Private: ${club.private ? "Yes" : "No"}`);
    console.log(`   Verified: ${club.verified ? "Yes" : "No"}\n`);
  });

  return clubs;
}

// ============================================================================
// Club Details
// ============================================================================

/**
 * Get detailed information about a specific club
 */
async function getClubDetails(clubId: number) {
  console.log(`\n=== Club Details (ID: ${clubId}) ===\n`);

  const club = await client.getClub(clubId);

  console.log(`Name: ${club.name}`);
  console.log(`Description: ${club.description || "N/A"}`);
  console.log(`Sport: ${club.sport_type}`);
  console.log(`Location: ${club.city}, ${club.state}, ${club.country}`);
  console.log(`Member Count: ${club.member_count}`);
  console.log(`Following Count: ${club.following_count || "N/A"}`);
  console.log(`Private: ${club.private ? "Yes" : "No"}`);
  console.log(`Verified: ${club.verified ? "Yes" : "No"}`);
  console.log(`URL: ${club.url || "N/A"}`);

  if (club.membership) {
    console.log(`\nYour membership: ${club.membership}`);
  }
  if (club.admin) {
    console.log("You are an admin of this club");
  }
  if (club.owner) {
    console.log("You are the owner of this club");
  }

  return club;
}

// ============================================================================
// Club Members
// ============================================================================

/**
 * Get club members (paginated)
 */
async function getClubMembers(clubId: number, page: number = 1) {
  console.log(`\n=== Club Members (Page ${page}) ===\n`);

  const members = await client.getClubMembers(clubId, { page, per_page: 30 });
  console.log(`Found ${members.length} members on this page:\n`);

  members.forEach((member, index) => {
    const number = (page - 1) * 30 + index + 1;
    console.log(`${number}. ${member.firstname} ${member.lastname}`);
    console.log(`   Admin: ${member.admin ? "Yes" : "No"}`);
    console.log(`   Owner: ${member.owner ? "Yes" : "No"}\n`);
  });

  return members;
}

/**
 * Get all club members using auto-pagination
 */
async function getAllClubMembers(clubId: number) {
  console.log(`\n=== All Club Members ===\n`);

  const allMembers = await client.getAllClubMembers(clubId);
  console.log(`Total members: ${allMembers.length}\n`);

  // Show first 10
  allMembers.slice(0, 10).forEach((member, index) => {
    console.log(`${index + 1}. ${member.firstname} ${member.lastname}`);
  });

  if (allMembers.length > 10) {
    console.log(`... and ${allMembers.length - 10} more members`);
  }

  return allMembers;
}

/**
 * Iterate through club members using async generator (memory-efficient)
 */
async function iterateClubMembersExample(clubId: number) {
  console.log(`\n=== Iterating Club Members (Memory-Efficient) ===\n`);

  let count = 0;
  let adminCount = 0;

  // This is memory-efficient: members are fetched page by page
  // and processed one at a time
  for await (const member of client.iterateClubMembers(clubId)) {
    count++;
    if (member.admin) {
      adminCount++;
      console.log(`Admin: ${member.firstname} ${member.lastname}`);
    }

    // You can break early without fetching all pages
    if (count >= 100) {
      console.log("\n(Stopped after 100 members for demo)");
      break;
    }
  }

  console.log(`\nProcessed ${count} members, found ${adminCount} admins`);
}

/**
 * Get club admins
 */
async function getClubAdmins(clubId: number) {
  console.log(`\n=== Club Admins ===\n`);

  const admins = await client.getClubAdmins(clubId, { per_page: 30 });
  console.log(`Found ${admins.length} admins:\n`);

  admins.forEach((admin, index) => {
    console.log(`${index + 1}. ${admin.firstname} ${admin.lastname}`);
    console.log(`   Owner: ${admin.owner ? "Yes" : "No"}\n`);
  });

  return admins;
}

// ============================================================================
// Club Activities
// ============================================================================

/**
 * Get recent club activities
 */
async function getClubActivities(clubId: number) {
  console.log(`\n=== Recent Club Activities ===\n`);

  const activities = await client.getClubActivities(clubId, { per_page: 20 });
  console.log(`Found ${activities.length} recent activities:\n`);

  activities.forEach((activity, index) => {
    const distanceKm = (activity.distance / 1000).toFixed(2);
    const durationMin = Math.round(activity.moving_time / 60);

    console.log(`${index + 1}. ${activity.name}`);
    console.log(`   Athlete: ${activity.athlete.firstname} ${activity.athlete.lastname}`);
    console.log(`   Type: ${activity.type}`);
    console.log(`   Distance: ${distanceKm} km`);
    console.log(`   Duration: ${durationMin} minutes`);
    console.log(`   Elevation: ${activity.total_elevation_gain}m\n`);
  });

  return activities;
}

/**
 * Calculate club statistics from recent activities
 */
async function calculateClubStats(clubId: number) {
  console.log(`\n=== Club Statistics (Last 100 Activities) ===\n`);

  // Get last 100 activities (adjust as needed)
  const allActivities = [];
  let page = 1;
  while (allActivities.length < 100) {
    const activities = await client.getClubActivities(clubId, { page, per_page: 30 });
    if (activities.length === 0) break;
    allActivities.push(...activities);
    page++;
  }

  // Calculate stats
  const stats = {
    totalActivities: allActivities.length,
    totalDistance: 0,
    totalElevation: 0,
    totalTime: 0,
    byType: {} as Record<string, { count: number; distance: number }>,
    uniqueAthletes: new Set<string>(),
  };

  allActivities.forEach((activity) => {
    stats.totalDistance += activity.distance;
    stats.totalElevation += activity.total_elevation_gain;
    stats.totalTime += activity.moving_time;
    stats.uniqueAthletes.add(`${activity.athlete.firstname} ${activity.athlete.lastname}`);

    if (!stats.byType[activity.type]) {
      stats.byType[activity.type] = { count: 0, distance: 0 };
    }
    stats.byType[activity.type].count++;
    stats.byType[activity.type].distance += activity.distance;
  });

  console.log(`Total Activities: ${stats.totalActivities}`);
  console.log(`Unique Athletes: ${stats.uniqueAthletes.size}`);
  console.log(`Total Distance: ${(stats.totalDistance / 1000).toFixed(0)} km`);
  console.log(`Total Elevation: ${stats.totalElevation.toFixed(0)} m`);
  console.log(`Total Time: ${(stats.totalTime / 3600).toFixed(1)} hours`);
  console.log(`\nBreakdown by Activity Type:`);

  Object.entries(stats.byType)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([type, data]) => {
      console.log(`   ${type}: ${data.count} activities, ${(data.distance / 1000).toFixed(0)} km`);
    });

  return stats;
}

// ============================================================================
// Main Example
// ============================================================================

async function main() {
  console.log("Strava Clubs Example\n");
  console.log("=".repeat(50) + "\n");

  try {
    // Get all clubs the athlete belongs to
    const clubs = await getMyClubs();

    if (clubs.length === 0) {
      console.log("You are not a member of any clubs.");
      return;
    }

    // Pick the first club for demonstration
    const clubId = clubs[0].id;
    console.log(`\nUsing club: ${clubs[0].name} (ID: ${clubId})`);

    // Get club details
    await getClubDetails(clubId);

    // Get club members
    await getClubMembers(clubId);

    // Get club admins
    await getClubAdmins(clubId);

    // Get recent club activities
    await getClubActivities(clubId);

    // Calculate club statistics
    await calculateClubStats(clubId);

    // Demonstrate memory-efficient iteration
    // Uncomment for clubs with many members:
    // await iterateClubMembersExample(clubId);

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
  getMyClubs,
  getClubDetails,
  getClubMembers,
  getAllClubMembers,
  iterateClubMembersExample,
  getClubAdmins,
  getClubActivities,
  calculateClubStats,
};
