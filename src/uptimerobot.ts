import { config } from "./config.js";

/**
 * Script to automatically set up an UptimeRobot HTTP monitor for keeping
 * the Render web service awake 24/7.
 */
export async function setupUptimeRobot(): Promise<void> {
  console.log("\n🤖 UptimeRobot Automated Setup Tool\n");

  const apiKey = config.uptimeRobotApiKey || process.env.UPTIMEROBOT_API_KEY;
  const rawUrl = config.appUrl;
  const healthUrl = rawUrl.endsWith("/health") ? rawUrl : `${rawUrl.replace(/\/$/, "")}/health`;

  console.log(`📍 Target Monitor URL: ${healthUrl}`);

  if (!apiKey) {
    console.log("\n⚠️  No UPTIMEROBOT_API_KEY found in your environment.\n");
    console.log("To set up UptimeRobot automatically:");
    console.log("  1. Sign up / Log in at https://uptimerobot.com");
    console.log("  2. Go to Account Settings > API Settings > Main API Key");
    console.log("  3. Add UPTIMEROBOT_API_KEY=your_key to your .env file or environment variables");
    console.log("  4. Re-run: npm run setup:uptimerobot\n");
    console.log("Or set up manually in the UptimeRobot Dashboard:");
    console.log("  • Monitor Type:  HTTP(s)");
    console.log(`  • Friendly Name: BuildFest Render App`);
    console.log(`  • URL (or IP):   ${healthUrl}`);
    console.log("  • Monitoring Interval: 5 minutes\n");
    return;
  }

  try {
    console.log("⏳ Contacting UptimeRobot API...");

    const bodyParams: Record<string, string> = {
      api_key: apiKey,
      friendly_name: "BuildFest Render App Keep-Alive",
      url: healthUrl,
      type: "1", // 1 = HTTP(s)
    };

    const body = new URLSearchParams(bodyParams);

    const response = await fetch("https://api.uptimerobot.com/v2/newMonitor", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: body.toString(),
    });

    const data = (await response.json()) as {
      stat: string;
      monitor?: { id: number; status: number };
      error?: { message: string; code: number };
    };

    if (data.stat === "ok" && data.monitor) {
      console.log(`\n✅ UptimeRobot monitor successfully created!`);
      console.log(`   Monitor ID: ${data.monitor.id}`);
      console.log(`   Interval: 5 minutes`);
      console.log(`   Target: ${healthUrl}`);
      console.log(`\n🎉 Your Render service will now stay awake forever!\n`);
    } else if (data.error?.message?.includes("already exists") || data.error?.code === 98) {
      console.log(`\nℹ️  UptimeRobot monitor already exists for ${healthUrl}.`);
      console.log(`   Your Render service is already being kept awake!\n`);
    } else {
      console.error(`\n❌ Failed to create UptimeRobot monitor:`, data.error?.message || data);
    }
  } catch (err) {
    console.error("\n❌ Error communicating with UptimeRobot API:", err);
  }
}

// Execute if run directly via CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("uptimerobot.ts")) {
  setupUptimeRobot();
}
