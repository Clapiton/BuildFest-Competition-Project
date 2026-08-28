import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { createComplaint, getComplaint, listComplaints, updateComplaint, logAuditEvent, getAuditLogs } from "./db.js";
import { complaintQueue, escalationQueue } from "./worker.js";
import { notifyEscalation } from "./notify.js";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Health check endpoints for UptimeRobot & monitoring services
const healthHandler = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: "ok",
    service: "buildfest-competition-project",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

app.get("/health", healthHandler);
app.get("/ping", healthHandler);
app.get("/api/health", healthHandler);

// ── 1. Industry Standard Middleware: express-rate-limit ──
// Limits each IP to max 10 requests per 15 minutes across API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP. Please try again after 15 minutes." },
});

// Strict intake limiter: Max 3 submissions per 3 minutes per IP
const intakeLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Submission rate limit reached for this IP. Please wait 3 minutes before submitting again." },
});

// ── 2. Device Fingerprint & Content Deduplication Layers ──
interface DeviceRecord {
  lastSubmissionMs: number;
}
const deviceSubmissions = new Map<string, DeviceRecord>();
const recentMessages = new Set<string>();
const DEVICE_COOLDOWN_MS = 30 * 1000;

function cleanStaleLimits() {
  const now = Date.now();
  for (const [key, record] of deviceSubmissions.entries()) {
    if (now - record.lastSubmissionMs > DEVICE_COOLDOWN_MS * 4) {
      deviceSubmissions.delete(key);
    }
  }
}
setInterval(cleanStaleLimits, 60000);

const ComplaintInput = z.object({
  customer_name: z.string().min(1, "Customer name is required"),
  customer_email: z.string().email("Valid email is required"),
  raw_message: z.string().min(1, "Complaint message cannot be empty"),
  website_url: z.string().optional(), // Bot honeypot field
});

// Apply standard intake rate limiter + custom device fingerprinting
app.post("/api/complaints", intakeLimiter, async (req, res) => {
  const result = ComplaintInput.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }

  const { customer_name, customer_email, raw_message, website_url } = result.data;

  // Bot Trap: Automated spam scripts fill invisible inputs
  if (website_url && website_url.trim() !== "") {
    console.warn("🛡️ Spam bot trapped via honeypot field. Submission rejected.");
    return res.status(429).json({ error: "Spam detected. Automated submissions are blocked." });
  }

  // Device Fingerprint Rate Limiting
  const deviceId = (req.headers["x-device-id"] as string || "unknown-device").trim();
  const now = Date.now();
  const deviceRecord = deviceSubmissions.get(deviceId);

  if (deviceId !== "unknown-device" && deviceRecord && now - deviceRecord.lastSubmissionMs < DEVICE_COOLDOWN_MS) {
    const remainingSec = Math.ceil((DEVICE_COOLDOWN_MS - (now - deviceRecord.lastSubmissionMs)) / 1000);
    return res.status(429).json({
      error: `Device limit active. Please wait ${remainingSec} seconds before submitting again on this device.`,
      cooldownSeconds: remainingSec,
    });
  }

  // Content Deduplication (Prevents repeating exact same text)
  const messageHash = `${customer_email.toLowerCase()}:${raw_message.trim().toLowerCase()}`;
  if (recentMessages.has(messageHash)) {
    return res.status(429).json({ error: "Duplicate complaint detected. This exact text was recently submitted." });
  }

  try {
    const complaint = await createComplaint({ customer_name, customer_email, raw_message });
    
    if (deviceId !== "unknown-device") {
      deviceSubmissions.set(deviceId, { lastSubmissionMs: now });
    }
    
    recentMessages.add(messageHash);
    setTimeout(() => recentMessages.delete(messageHash), 300000);

    const clientIp = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown-ip").split(",")[0].trim();
    await logAuditEvent(complaint.id, "received", `Complaint received from ${clientIp} [Device: ${deviceId.substring(0, 8)}]`);
    await complaintQueue.add("process-complaint", { complaintId: complaint.id }, { jobId: complaint.id });
    
    res.status(201).json({ success: true, complaint });
  } catch (error) {
    console.error("Error creating complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/complaints/:id", async (req, res) => {
  try {
    const complaint = await getComplaint(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    res.status(200).json(complaint);
  } catch (error) {
    console.error("Error fetching complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/complaints", apiLimiter, async (req, res) => {
  try {
    const complaints = await listComplaints();
    res.status(200).json(complaints);
  } catch (error) {
    console.error("Error listing complaints:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/complaints/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await getComplaint(id);
    
    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    
    if (complaint.status === "resolved") {
      return res.status(400).json({ error: "Complaint is already resolved" });
    }

    const updated = await updateComplaint(id, { status: "resolved" });
    await logAuditEvent(id, "resolved", "Complaint manually resolved by team member");

    try {
      const job = await escalationQueue.getJob(`escalation-${id}`);
      if (job) {
        await job.remove();
      }
    } catch (jobError) {
      console.error("Error removing escalation job:", jobError);
    }

    res.status(200).json({ success: true, complaint: updated });
  } catch (error) {
    console.error("Error resolving complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/complaints/:id/audit-log", async (req, res) => {
  try {
    const logs = await getAuditLogs(req.params.id);
    res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/complaints/:id/escalate", async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await getComplaint(id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });
    if (complaint.status === "resolved") return res.status(400).json({ error: "Cannot escalate a resolved complaint" });

    const updated = await updateComplaint(id, { status: "escalated", assigned_to: "manager@support.team" });
    await logAuditEvent(id, "escalated", "Manually escalated to manager via dashboard");
    await notifyEscalation({
      id: complaint.id,
      customer_name: complaint.customer_name,
      ai_summary: complaint.ai_summary,
      assigned_to: complaint.assigned_to,
    });

    res.status(200).json({ success: true, complaint: updated });
  } catch (error) {
    console.error("Error escalating complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/complaints/:id/reassign", async (req, res) => {
  try {
    const { id } = req.params;
    const { assignee } = req.body;
    if (!assignee || typeof assignee !== "string") {
      return res.status(400).json({ error: "Assignee email is required" });
    }
    const complaint = await getComplaint(id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    const updated = await updateComplaint(id, { assigned_to: assignee });
    await logAuditEvent(id, "reassigned", `Reassigned to ${assignee}`);
    
    res.status(200).json({ success: true, complaint: updated });
  } catch (error) {
    console.error("Error reassigning complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export function startServer(): void {
  app.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);
    console.log(`📋 Submit complaints at http://localhost:${config.port}/`);
    console.log(`📊 View status at http://localhost:${config.port}/status.html`);
  });
}
