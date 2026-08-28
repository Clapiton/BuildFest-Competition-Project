import { startServer } from "./server.js";
import { startWorkers, closeWorkers } from "./worker.js";

console.log("\n🏗️  BuildFest 2026 — Customer Complaint Automation\n");

// Start workers first (they need to be ready to process jobs)
startWorkers();

// Start Express server
startServer();

// Graceful shutdown
const shutdown = async () => {
  console.log("\n🛑 Shutting down...");
  await closeWorkers();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
