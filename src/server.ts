import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import IORedis from "ioredis";
import { config } from "./config.js";
import {
  createComplaint,
  getComplaint,
  listComplaints,
  updateComplaint,
  logAuditEvent,
  getAuditLogs,
  supabase,
} from "./db.js";
import { complaintQueue, escalationQueue } from "./worker.js";
import { notifyEscalation } from "./notify.js";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

// ── Trust Proxy Configuration ──
// Required on Render and reverse proxies for accurate client IP rate limiting
app.set("trust proxy", 1);

// ── H3: Production HTTPS Enforcement ──
if (config.nodeEnv === "production") {
  app.use((req, res, next) => {
    const proto = req.headers["x-forwarded-proto"];
    if (proto && proto !== "https") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ── H1: Helmet Security Headers & Content Security Policy ──
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Required for frontend inline scripts in static HTML
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: [
          "'self'",
          "https://*.supabase.co",
          "wss://*.supabase.co",
          ...config.allowedOrigins,
        ],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    xFrameOptions: { action: "deny" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// ── C3: Strict CORS Policy ──
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const isAllowed = config.allowedOrigins.some(
        (allowed) =>
          allowed === origin ||
          (allowed.endsWith("*") && origin.startsWith(allowed.slice(0, -1)))
      );

      if (isAllowed || config.nodeEnv !== "production") {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation: origin not allowed"));
    },
    credentials: true,
  })
);

// ── M4: Request Body Size Limit ──
app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "../public")));

// ── L3: Health Check Endpoints (Sanitized Uptime) ──
const healthHandler = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: "ok",
    service: "buildfest-competition-project",
    // Only disclose uptime in development mode to prevent reconnaissance
    ...(config.nodeEnv === "development" ? { uptime: process.uptime() } : {}),
    timestamp: new Date().toISOString(),
  });
};

app.get("/health", healthHandler);
app.get("/ping", healthHandler);
app.get("/api/health", healthHandler);

// Public endpoint providing Supabase client credentials for frontend Supabase Auth
app.get("/api/auth/config", (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
  });
});

// ── Rate Limiters (express-rate-limit) ──
// General API Limiter: Max 60 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP. Please try again later." },
});

// Strict Complaint Intake Limiter: Max 5 submissions per 3 minutes per IP
const intakeLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Submission rate limit reached for this IP. Please wait 3 minutes before submitting again.",
  },
});

// ── Redis Connection for Scalable Dedup & Cooldown (H6) ──
const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  enableOfflineQueue: false,
});
redis.on("error", (err) => {
  console.warn("⚠️ Redis cache unavailable, using in-memory fallback:", err.message);
});

// Fallback in-memory stores if Redis is unavailable
const memoryDeviceCooldowns = new Map<string, number>();
const memoryRecentMessages = new Set<string>();
const DEVICE_COOLDOWN_MS = 30 * 1000;

// Periodic cleanup of in-memory fallback map
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of memoryDeviceCooldowns.entries()) {
    if (now - timestamp > DEVICE_COOLDOWN_MS * 4) {
      memoryDeviceCooldowns.delete(key);
    }
  }
}, 60000);

// Helper: Check and set device cooldown
async function checkDeviceCooldown(deviceId: string): Promise<boolean> {
  if (!deviceId || deviceId === "unknown-device") return false;
  try {
    const res = await redis.set(`device_cooldown:${deviceId}`, "1", "PX", DEVICE_COOLDOWN_MS, "NX");
    return res === null; // true if already exists (active cooldown)
  } catch {
    const now = Date.now();
    const last = memoryDeviceCooldowns.get(deviceId);
    if (last && now - last < DEVICE_COOLDOWN_MS) return true;
    memoryDeviceCooldowns.set(deviceId, now);
    return false;
  }
}

// Helper: Check and set message deduplication
async function isDuplicateMessage(messageHash: string): Promise<boolean> {
  try {
    const res = await redis.set(`msg_dedup:${messageHash}`, "1", "EX", 300, "NX");
    return res === null; // true if duplicate exists
  } catch {
    if (memoryRecentMessages.has(messageHash)) return true;
    memoryRecentMessages.add(messageHash);
    setTimeout(() => memoryRecentMessages.delete(messageHash), 300000);
    return false;
  }
}

// Helper: GDPR IP Anonymization (M3)
function maskIp(ip: string): string {
  if (!ip || ip === "unknown-ip") return "unknown-ip";
  if (ip.includes(":")) {
    const segments = ip.split(":");
    return segments.slice(0, 2).join(":") + ":****:****";
  }
  const octets = ip.split(".");
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.***.***`;
  }
  return "masked-ip";
}

// ── C1: Supabase Auth Verification Middleware ──
export async function requireSupabaseAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  const adminKeyHeader = req.headers["x-admin-key"] as string | undefined;

  // Optional Admin API Key fallback for automated testing / CLI
  if (adminKeyHeader && config.adminApiKey && adminKeyHeader === config.adminApiKey) {
    return next();
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authentication required. Please provide a valid Supabase Auth session token.",
    });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Admin key supplied as Bearer token
  if (config.adminApiKey && token === config.adminApiKey) {
    return next();
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired Supabase authentication session. Please sign in again.",
      });
    }

    (req as any).user = user;
    next();
  } catch (err) {
    console.error("[Auth Middleware Error]:", err);
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authentication verification failed.",
    });
  }
}

// ── Complaint Validation Schema (Zod) ──
const ComplaintInput = z.object({
  customer_name: z
    .string()
    .trim()
    .min(1, "Customer name is required")
    .max(100, "Customer name is too long"),
  customer_email: z
    .string()
    .trim()
    .email("Valid email is required")
    .max(255, "Customer email is too long"),
  raw_message: z
    .string()
    .trim()
    .min(5, "Complaint message must be at least 5 characters")
    .max(3000, "Complaint message cannot exceed 3000 characters"),
  website_url: z.string().optional(), // Bot honeypot field
});

// ── Public Endpoint: Submit Complaint ──
app.post("/api/complaints", intakeLimiter, async (req, res) => {
  const result = ComplaintInput.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }

  const { customer_name, customer_email, raw_message, website_url } = result.data;

  // Bot Trap: automated bot filling hidden input
  if (website_url && website_url.trim() !== "") {
    console.warn("🛡️ Spam bot trapped via honeypot field. Submission rejected.");
    return res.status(429).json({ error: "Spam detected. Automated submissions are blocked." });
  }

  // Device rate limiting (supplementary)
  const deviceId = (req.headers["x-device-id"] as string || "unknown-device").trim();
  if (await checkDeviceCooldown(deviceId)) {
    return res.status(429).json({
      error: "Device cooldown active. Please wait 30 seconds before submitting again.",
      cooldownSeconds: 30,
    });
  }

  // Content Deduplication (Prevents repeating exact same text)
  const messageHash = `${customer_email.toLowerCase()}:${raw_message.trim().toLowerCase()}`;
  if (await isDuplicateMessage(messageHash)) {
    return res.status(429).json({
      error: "Duplicate complaint detected. This exact text was recently submitted.",
    });
  }

  try {
    const complaint = await createComplaint({ customer_name, customer_email, raw_message });

    const rawIp =
      (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown-ip")
        .split(",")[0]
        .trim();
    const anonymizedIp = maskIp(rawIp);

    await logAuditEvent(
      complaint.id,
      "received",
      `Complaint received from ${anonymizedIp} [Device: ${deviceId.substring(0, 8)}]`
    );
    await complaintQueue.add("process-complaint", { complaintId: complaint.id }, { jobId: complaint.id });

    res.status(201).json({ success: true, complaint });
  } catch (error) {
    console.error("Error creating complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Protected Endpoints: Complaint Management (Requires Supabase Auth) ──

// List complaints with pagination (H4)
app.get("/api/complaints", apiLimiter, requireSupabaseAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 25;
    const status = req.query.status ? String(req.query.status) : undefined;

    const result = await listComplaints({ page, limit, status });
    res.status(200).json(result);
  } catch (error) {
    console.error("Error listing complaints:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single complaint (H5 rate limited + auth protected)
app.get("/api/complaints/:id", apiLimiter, requireSupabaseAuth, async (req, res) => {
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

// Get complaint audit log (H5 rate limited + auth protected)
app.get("/api/complaints/:id/audit-log", apiLimiter, requireSupabaseAuth, async (req, res) => {
  try {
    const logs = await getAuditLogs(req.params.id);
    res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Resolve complaint (Auth protected)
app.post("/api/complaints/:id/resolve", requireSupabaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await getComplaint(id);

    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    if (complaint.status === "resolved") {
      return res.status(400).json({ error: "Complaint is already resolved" });
    }

    const userEmail = (req as any).user?.email || "team member";
    const updated = await updateComplaint(id, { status: "resolved" });
    await logAuditEvent(id, "resolved", `Complaint manually resolved by ${userEmail}`);

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

// Escalate complaint (Auth protected)
app.post("/api/complaints/:id/escalate", requireSupabaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await getComplaint(id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });
    if (complaint.status === "resolved")
      return res.status(400).json({ error: "Cannot escalate a resolved complaint" });

    const userEmail = (req as any).user?.email || "team member";
    const updated = await updateComplaint(id, {
      status: "escalated",
      assigned_to: "manager@support.team",
    });
    await logAuditEvent(id, "escalated", `Manually escalated to manager by ${userEmail}`);
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

// Reassign complaint (Auth protected)
app.post("/api/complaints/:id/reassign", requireSupabaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { assignee } = req.body;
    if (!assignee || typeof assignee !== "string") {
      return res.status(400).json({ error: "Assignee email is required" });
    }
    const complaint = await getComplaint(id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    const userEmail = (req as any).user?.email || "team member";
    const updated = await updateComplaint(id, { assigned_to: assignee });
    await logAuditEvent(id, "reassigned", `Reassigned to ${assignee} by ${userEmail}`);

    res.status(200).json({ success: true, complaint: updated });
  } catch (error) {
    console.error("Error reassigning complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Global Error Sanitizer (M2) ──
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({ error: "Payload too large. Maximum allowed size is 16KB." });
  }
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
