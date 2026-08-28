# BuildFest 2026 — AI Customer Complaint Automation

Build a full-stack TypeScript automation that receives customer complaints, classifies them with AI, routes them to the right team, sends transactional email notifications via **Resend**, tracks status in real time, and auto-escalates overdue cases.

**Deploys to Render (free tier) so judges can test it live at any time.**

---

## Cost Summary

| Service | Cost | What we use it for |
|---------|------|--------------------|
| Supabase | **Free** (free tier) | Postgres database for complaints + audit log (with RLS) |
| OpenAI API | **~$0.01** (pay-as-you-go) | `gpt-4o-mini` for complaint classification |
| Resend | **Free** (free tier) | Transactional email notifications |
| Upstash Redis | **Free** (free tier) | BullMQ job queue + delayed escalation jobs |
| Render | **Free** (free tier) | Hosting the web service + worker |

> [!NOTE]
> **OpenAI is the only paid service**, and it costs less than a penny for all your demo testing. Everything else is genuinely free tier.

---

## Prerequisites — What You Need

1. **OpenAI account** with API key → [platform.openai.com](https://platform.openai.com)
2. **Supabase project** (free) → [supabase.com](https://supabase.com) — project URL + `service_role` key
3. **Upstash Redis** database (free) → [upstash.com](https://upstash.com) — connection URL
4. **Resend API Key** (free) → [resend.com](https://resend.com) — API key (`re_...`)
5. **Render account** (free) → [render.com](https://render.com) — for deployment

---

## Architecture Overview

```
┌─────────────┐     POST /complaints     ┌──────────────┐
│  HTML Form  │ ───────────────────────►  │  Express API │
│ (index.html)│                           │  (server.ts) │
└─────────────┘                           └──────┬───────┘
                                                 │
                                    1. Save to DB (status: received)
                                    2. Log audit event
                                    3. Enqueue BullMQ job
                                                 │
                                                 ▼
┌─────────────┐                           ┌──────────────┐
│   Upstash   │◄─────── queues ──────────►│  BullMQ      │
│   Redis     │                           │  Worker      │
└─────────────┘                           │  (worker.ts) │
                                          └──────┬───────┘
                                                 │
                                    4. Call OpenAI → classify
                                    5. Update DB (status: in_progress)
                                    6. Assign to team member
                                    7. Send Resend Email Notification
                                    8. Schedule escalation check (3 min delay)
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │  Escalation  │
                                          │  (delayed    │
                                          │   BullMQ job)│
                                          └──────────────┘
                                    9. If still in_progress → escalate
                                   10. Reassign to manager
                                   11. Send Escalation Email
                                   12. Log audit event
```

---

## Codebase Structure

```
├── src/
│   ├── index.ts           # Entry point — starts server + worker together
│   ├── server.ts          # Express app, routes, static file serving
│   ├── worker.ts          # BullMQ workers (processing + escalation)
│   ├── db.ts              # Supabase client + typed query helpers + audit log
│   ├── ai.ts              # OpenAI API call + JSON parsing + fallback
│   ├── notify.ts          # Resend / SMTP / Console notification abstraction
│   └── config.ts          # Centralized env var loading + validation
├── public/
│   ├── index.html         # Complaint submission form (clean, professional)
│   └── status.html        # Interactive dashboard with Audit Modal & Actions
├── sql/
│   └── schema.sql         # DDL for complaints + audit_log tables + RLS Policies
├── .env.example           # Documented env vars template
├── package.json           # Deps + scripts
├── tsconfig.json          # TypeScript strict config
├── render.yaml            # Render deployment blueprint (one-click deploy)
└── README.md              # Full documentation for judges
```

---

## Detailed Components

### 1. Configuration (`src/config.ts`)
- Loads `dotenv` and validates required env vars at startup (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_API_KEY`, `REDIS_URL`).
- Optionally accepts `RESEND_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `NOTIFICATION_MODE`, `PORT`, `ESCALATION_DELAY_MS`.

### 2. Database & Security (`src/db.ts` & `sql/schema.sql`)
- Enables **Row Level Security (RLS)** on `complaints` and `audit_log` tables with explicit SELECT, INSERT, and UPDATE policies.
- Uses Supabase `service_role` key on the backend to safely bypass RLS for server-side administration.
- Helper functions: `createComplaint`, `getComplaint`, `listComplaints`, `updateComplaint`, `logAuditEvent`, `getAuditLogs`.

### 3. AI Classification (`src/ai.ts`)
- Uses OpenAI `gpt-4o-mini` with `response_format: { type: "json_object" }`.
- Parses output with Zod schema (`category`, `urgency`, `sentiment`, `summary`, `draft_reply`).
- Provides robust fallback classification if API call fails.

### 4. Transactional Notifications (`src/notify.ts`)
- Primary provider: **Resend SDK** (`resend`).
- Secondary fallback: Nodemailer (SMTP).
- Tertiary fallback: Formatted Console Logs.
- Functions: `notifyCustomer`, `notifyTeamMember`, `notifyEscalation`.

### 5. API Server (`src/server.ts`)
- `POST /api/complaints` — Validates input, creates complaint, enqueues BullMQ job.
- `GET /api/complaints` — Returns all complaints (newest first).
- `GET /api/complaints/:id` — Gets a single complaint.
- `POST /api/complaints/:id/resolve` — Resolves complaint and cancels pending escalation timer.
- `POST /api/complaints/:id/escalate` — Manually escalates a complaint to manager.
- `POST /api/complaints/:id/reassign` — Reassigns complaint to a different agent.
- `GET /api/complaints/:id/audit-log` — Fetches complete audit history for a complaint.

### 6. Queue Workers (`src/worker.ts`)
- Connected to Upstash Redis.
- Processing worker: runs AI classification, assigns agent, sends Resend email, schedules delayed escalation job.
- Escalation worker: fires after delay (3 min demo / 24h prod); if unresolved, escalates to `manager@support.team` and sends alert email.

### 7. Interactive Dashboard (`public/status.html`)
- Live auto-refresh every 10s.
- Expandable complaint detail drawers (raw message, AI summary, draft reply).
- Interactive **Audit Trail Modal (📜 Audit)** showing step-by-step history.
- Action buttons: **✓ Resolve**, **🚨 Escalate**, **👤 Reassign**.

---

## Verification & Test Plan

- [x] TypeScript compilation: `npm run build` passes with zero errors.
- [x] Dependencies installed: `resend`, `@supabase/supabase-js`, `bullmq`, `ioredis`, `express`, `openai`, `zod`.
- [x] Database RLS configured & tested.
- [x] Resend email notifications configured.
- [x] Audit trail logging & modal viewer verified.
