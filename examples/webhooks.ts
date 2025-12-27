/**
 * Webhooks Example
 * Demonstrates how to set up and handle Strava webhooks for real-time activity notifications.
 *
 * Strava webhooks notify your application when:
 * - An athlete creates, updates, or deletes an activity
 * - An athlete updates their profile
 * - An athlete deauthorizes your app
 *
 * Note: Each app can only have one webhook subscription at a time.
 *
 * Required dependencies (install separately):
 *   npm install express
 *   npm install -D @types/express
 */

import express, { Request, Response } from "express";
import {
  StravaClient,
  validateWebhookVerification,
  parseWebhookEvent,
  StravaWebhookEvent,
  StravaValidationError,
} from "../index";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "my-secret-token";
const CALLBACK_URL = process.env.CALLBACK_URL || `https://your-domain.com/webhooks/strava`;

// Initialize the client (only needs clientId and clientSecret for webhooks)
const client = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID!,
  clientSecret: process.env.STRAVA_CLIENT_SECRET!,
});

// ============================================================================
// Webhook Subscription Management
// ============================================================================

/**
 * Create a new webhook subscription.
 * Run this once to register your webhook endpoint with Strava.
 */
async function createSubscription() {
  console.log("Creating webhook subscription...\n");

  // First, check if a subscription already exists
  const existing = await client.getWebhookSubscription();
  if (existing) {
    console.log("Subscription already exists:");
    console.log(`   ID: ${existing.id}`);
    console.log(`   Callback URL: ${existing.callback_url}`);
    return existing;
  }

  // Create new subscription
  // Note: Strava will make a GET request to your callback URL to verify it
  const subscription = await client.createWebhookSubscription({
    callbackUrl: CALLBACK_URL,
    verifyToken: WEBHOOK_VERIFY_TOKEN,
  });

  console.log("Subscription created successfully!");
  console.log(`   ID: ${subscription.id}`);
  console.log(`   Callback URL: ${subscription.callback_url}`);

  return subscription;
}

/**
 * View the current webhook subscription
 */
async function viewSubscription() {
  const subscription = await client.getWebhookSubscription();

  if (subscription) {
    console.log("Current subscription:");
    console.log(`   ID: ${subscription.id}`);
    console.log(`   Callback URL: ${subscription.callback_url}`);
  } else {
    console.log("No active subscription");
  }

  return subscription;
}

/**
 * Delete the webhook subscription
 */
async function deleteSubscription(subscriptionId: number) {
  console.log(`Deleting subscription ${subscriptionId}...`);
  await client.deleteWebhookSubscription(subscriptionId);
  console.log("Subscription deleted successfully!");
}

// ============================================================================
// Webhook Endpoint Handlers
// ============================================================================

/**
 * Webhook verification endpoint (GET)
 * Strava sends a GET request to verify your callback URL when you create a subscription.
 */
app.get("/webhooks/strava", (req: Request, res: Response) => {
  console.log("Received webhook verification request");

  // The validateWebhookVerification function is a pure function that can be
  // used without a StravaClient instance
  const challenge = validateWebhookVerification(
    {
      "hub.mode": req.query["hub.mode"] as string,
      "hub.verify_token": req.query["hub.verify_token"] as string,
      "hub.challenge": req.query["hub.challenge"] as string,
    },
    WEBHOOK_VERIFY_TOKEN
  );

  if (challenge) {
    console.log("Verification successful!");
    // Must respond with the challenge in JSON format
    res.json({ "hub.challenge": challenge });
  } else {
    console.log("Verification failed - token mismatch");
    res.status(403).send("Verification failed");
  }
});

/**
 * Webhook event handler (POST)
 * Strava sends POST requests with event data when activities are created/updated/deleted.
 */
app.post("/webhooks/strava", async (req: Request, res: Response) => {
  // Respond immediately with 200 OK - Strava expects this within 2 seconds
  // Process the event asynchronously
  res.status(200).send("EVENT_RECEIVED");

  try {
    // Parse and validate the webhook event
    const event = parseWebhookEvent(req.body);
    await handleWebhookEvent(event);
  } catch (error) {
    if (error instanceof StravaValidationError) {
      console.error("Invalid webhook payload:", error.message);
    } else {
      console.error("Error processing webhook:", error);
    }
  }
});

/**
 * Process a webhook event
 */
async function handleWebhookEvent(event: StravaWebhookEvent) {
  console.log("\n--- Webhook Event Received ---");
  console.log(`Object Type: ${event.object_type}`);
  console.log(`Object ID: ${event.object_id}`);
  console.log(`Aspect Type: ${event.aspect_type}`);
  console.log(`Owner ID (Athlete): ${event.owner_id}`);
  console.log(`Event Time: ${new Date(event.event_time * 1000).toISOString()}`);

  if (event.updates) {
    console.log("Updates:", JSON.stringify(event.updates, null, 2));
  }

  // Handle different event types
  switch (event.object_type) {
    case "activity":
      await handleActivityEvent(event);
      break;
    case "athlete":
      await handleAthleteEvent(event);
      break;
    default:
      console.log(`Unknown object type: ${event.object_type}`);
  }
}

/**
 * Handle activity events (create, update, delete)
 */
async function handleActivityEvent(event: StravaWebhookEvent) {
  const activityId = event.object_id;
  const athleteId = event.owner_id;

  switch (event.aspect_type) {
    case "create":
      console.log(`\nNew activity created! ID: ${activityId}`);
      // In a real app, you would:
      // 1. Look up the athlete's tokens from your database
      // 2. Fetch the full activity details
      // 3. Process/store the activity data
      //
      // Example:
      // const tokens = await database.getTokens(athleteId);
      // client.setTokens(tokens);
      // const activity = await client.getActivity(activityId);
      // await processNewActivity(athleteId, activity);
      break;

    case "update":
      console.log(`\nActivity updated! ID: ${activityId}`);
      if (event.updates) {
        console.log("Changed fields:", Object.keys(event.updates).join(", "));
        // Handle specific updates
        if (event.updates.title) {
          console.log(`   New title: ${event.updates.title}`);
        }
        if (event.updates.type) {
          console.log(`   New type: ${event.updates.type}`);
        }
        if (event.updates.private === "true") {
          console.log("   Activity is now private");
        }
      }
      break;

    case "delete":
      console.log(`\nActivity deleted! ID: ${activityId}`);
      // Remove the activity from your database
      // await database.deleteActivity(athleteId, activityId);
      break;
  }
}

/**
 * Handle athlete events (update, deauthorize)
 */
async function handleAthleteEvent(event: StravaWebhookEvent) {
  const athleteId = event.owner_id;

  switch (event.aspect_type) {
    case "update":
      console.log(`\nAthlete profile updated! ID: ${athleteId}`);
      if (event.updates?.authorized === "false") {
        console.log("Athlete has deauthorized your app!");
        // Remove the athlete's tokens and data from your database
        // await database.removeAthlete(athleteId);
      }
      break;

    case "delete":
      console.log(`\nAthlete deleted! ID: ${athleteId}`);
      // This typically means deauthorization
      // await database.removeAthlete(athleteId);
      break;
  }
}

// ============================================================================
// Example Usage
// ============================================================================

// Start the webhook server
app.listen(PORT, () => {
  console.log(`Webhook server running at http://localhost:${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/strava\n`);
  console.log("For production, use a publicly accessible HTTPS URL.");
  console.log("You can use ngrok for local testing: ngrok http 3000\n");
});

// Management commands (run from command line)
const command = process.argv[2];
if (command === "create") {
  createSubscription().catch(console.error);
} else if (command === "view") {
  viewSubscription().catch(console.error);
} else if (command === "delete") {
  const subscriptionId = parseInt(process.argv[3]);
  if (subscriptionId) {
    deleteSubscription(subscriptionId).catch(console.error);
  } else {
    console.log("Usage: ts-node webhooks.ts delete <subscription_id>");
  }
}

export { app, createSubscription, viewSubscription, deleteSubscription };
