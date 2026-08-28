import dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  // Service role key for backend DB operations (bypasses RLS)
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "",
  // Anon key for client-side Supabase Auth operations
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "",
  openaiApiKey: required("OPENAI_API_KEY"),
  redisUrl: required("REDIS_URL"),
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  adminApiKey: process.env.ADMIN_API_KEY || "buildfest-admin-2026",
  escalationDelayMs: parseInt(process.env.ESCALATION_DELAY_MS || "180000", 10),
  notificationMode: (process.env.NOTIFICATION_MODE || "console") as "console" | "email",
  resendApiKey: process.env.RESEND_API_KEY,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  appUrl: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || "3000"}`,
  uptimeRobotApiKey: process.env.UPTIMEROBOT_API_KEY,
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
    : [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://buildfest-competition-project.onrender.com",
      ],
};

