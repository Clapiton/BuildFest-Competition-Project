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
  supabaseKey: required("SUPABASE_KEY"),
  openaiApiKey: required("OPENAI_API_KEY"),
  redisUrl: required("REDIS_URL"),
  port: parseInt(process.env.PORT || "3000", 10),
  escalationDelayMs: parseInt(process.env.ESCALATION_DELAY_MS || "180000", 10),
  notificationMode: (process.env.NOTIFICATION_MODE || "console") as "console" | "email",
  resendApiKey: process.env.RESEND_API_KEY,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  appUrl: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || "3000"}`,
  uptimeRobotApiKey: process.env.UPTIMEROBOT_API_KEY,
};

