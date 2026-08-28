# 🤖 AI Customer Complaint Automation

> **BuildFest 2026 — Track 5, Case Study 1**  
> Participant ID: BF-1079

An end-to-end AI-powered workflow that receives customer complaints, classifies them using OpenAI (`gpt-4o-mini`), routes them to the right team member, sends transactional email notifications via **Resend**, tracks status in real time, and automatically escalates unresolved cases with enterprise-grade security and Supabase Auth.

## 🔗 Live Demo Links

- 📥 **Public Complaint Intake Form**: [buildfest-competition-project.onrender.com](https://buildfest-competition-project.onrender.com/)
- 💻 **Interactive Management Dashboard**: [buildfest-competition-project.onrender.com/status.html](https://buildfest-competition-project.onrender.com/status.html)
- 📊 **Visual Workflow Diagram**: [buildfest-competition-project.onrender.com/workflow.html](https://buildfest-competition-project.onrender.com/workflow.html)

---

## 📋 Problem Statement

Support teams handling customer complaints by email and spreadsheet lose time on manual triage, and complaints often sit unresolved with no automatic follow-up, leading to missed SLAs and frustrated customers.

## ✅ What This Automation Does

1. **Receives** complaints through an intuitive, anti-spam protected public web form
2. **Classifies** category, urgency, and sentiment using OpenAI (`gpt-4o-mini`)
3. **Routes** to the right team member based on category (billing, product, service, other)
4. **Notifies** the team member and sends an acknowledgment to the customer via **Resend** transactional email (with console fallback)
5. **Tracks** status in real time (`received` → `in_progress` → `escalated` → `resolved`) with pagination
6. **Escalates** automatically if unresolved past an SLA threshold (3 min demo / 24h production)
7. **Logs** every step in a Postgres audit log for a complete event timeline with anonymized IP addresses

---

## 🏗️ Architecture

```
Customer → Web Form (Honeypot + Anti-Spam) → Express API (Helmet + Rate Limit + CORS) → Supabase (DB + RLS + Auth)
                                                          ↓
                                                    BullMQ Queue → Worker
                                                          ↓
                                                OpenAI Classification
                                                          ↓
                                                Route + Resend Email + Schedule Escalation
                                                          ↓
                                                [3 min later, if unresolved]
                                                          ↓
                                                Auto-Escalate to Manager
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js + TypeScript** | Runtime and type-safe language |
| **Express + Helmet** | API server with security headers, CORS & Content Security Policy |
| **Supabase (Postgres + Auth)** | Database with RLS policies and JWT Operator Authentication |
| **OpenAI API (gpt-4o-mini)** | AI classification and reply generation |
| **Resend SDK** | Transactional email notifications (with SMTP/console fallback) |
| **BullMQ + IORedis (Upstash)** | Persistent job queue & delayed escalation timer |
| **express-rate-limit** | Multi-tiered IP rate limiting & device fingerprinting |
| **Zod** | Schema & environment input validation |
| **Render** | Cloud deployment (free tier blueprint) |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free)
- An [OpenAI](https://platform.openai.com) API key
- An [Upstash](https://upstash.com) Redis database (free)
- A [Resend](https://resend.com) API key (free tier)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials (use Supabase service_role key for backend access)

# 3. Create database tables & RLS policies
# Copy the contents of sql/schema.sql and run it in your Supabase SQL Editor

# 4. Start the application (server + workers)
npm run dev
```

The app will be running at `http://localhost:3000`.

---

## 📡 API Endpoints

| Method | Endpoint | Protection | Description |
|---|---|---|---|
| `POST` | `/api/complaints` | Rate-Limited + Honeypot | Submit a new customer complaint |
| `GET` | `/api/complaints` | Supabase Auth Required | List complaints with pagination (`?page=1&limit=20`) |
| `GET` | `/api/complaints/:id` | Supabase Auth Required | Get single complaint details |
| `POST` | `/api/complaints/:id/resolve` | Supabase Auth Required | Resolve complaint & cancel escalation job |
| `POST` | `/api/complaints/:id/escalate` | Supabase Auth Required | Manually escalate complaint to manager |
| `POST` | `/api/complaints/:id/reassign` | Supabase Auth Required | Reassign complaint to a different agent |
| `GET` | `/api/complaints/:id/audit-log` | Supabase Auth Required | Get full timeline of audit events for a complaint |
| `GET` | `/api/auth/config` | Public | Fetch frontend Supabase Auth credentials |
| `GET` | `/health` | Public | Health check endpoint for UptimeRobot & monitoring services |

---

## ⚡ UptimeRobot Keep-Alive (Keeping Render Awake 24/7)

Render's free tier automatically spins down (sleeps) web services after 15 minutes of inbound HTTP inactivity. To keep this project **awake 24/7** so judges or users can test it live at any time, set up **UptimeRobot** (free tier):

### Option A: Automated CLI Setup (Recommended)
1. Get your UptimeRobot API key: [UptimeRobot Dashboard](https://uptimerobot.com) → **Account Settings** → **API Settings** → **Main API Key**.
2. Add your keys to `.env` or Render environment settings:
   ```env
   APP_URL=https://buildfest-competition-project.onrender.com
   UPTIMEROBOT_API_KEY=u1234567-xxxxxxxxxxxxxxxx
   ```
3. Run the setup script:
   ```bash
   npm run setup:uptimerobot
   ```

### Option B: Manual Web UI Setup
1. Log in to [UptimeRobot](https://uptimerobot.com).
2. Click **+ Add New Monitor**.
3. Configure the monitor:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `BuildFest Render App`
   - **URL (or IP)**: `https://buildfest-competition-project.onrender.com/health`
   - **Monitoring Interval**: `5 minutes`
4. Click **Create Monitor**. UptimeRobot will ping `/health` every 5 minutes, preventing Render from going to sleep.

---

## 💻 Interactive Dashboard Features ([`/status.html`](https://buildfest-competition-project.onrender.com/status.html))

- **Tran Mau Tri Tam Geometric Design**: Modern, responsive layout with vector SVG icons and light/dark mode theme switch.
- **Supabase Operator Auth**: Sign in with Supabase Auth or use **Quick Demo Access** for judges.
- **Server-Side Pagination**: Efficiently browse complaints with page controls (`Showing Page 1 of N`).
- **Real-Time Tracking**: Auto-refreshes complaint status every 10 seconds.
- **Expandable Complaint Details**: Click any row to expand a drawer showing the **Raw Message**, **AI Summary**, and **Generated Customer Reply**.
- **Interactive Audit Log Modal (📜 Audit)**: Click to view an interactive visual timeline of every action taken on the complaint.
- **Manual Escalation (🚨 Escalate)**: Immediately escalate urgent issues to `manager@support.team`.
- **Reassign Agent (👤 Reassign)**: Change assigned team member on the fly.
- **Mark Resolved (✓ Resolve)**: Resolves the issue and cancels pending escalation timers.

---

## ⏱️ How Escalation Works

1. When a complaint is classified and assigned, a **delayed job** is scheduled in BullMQ (default: 3 minutes for demo)
2. When the delay expires, the escalation worker checks if the complaint status is still `in_progress`
3. If unresolved: status is set to `escalated`, reassigned to `manager@support.team`, and an escalation email alert is sent
4. If already resolved: the escalation job is a no-op
5. Calling `/resolve` cancels any pending escalation job in Redis

---

## 🧪 Test Cases

| # | Scenario | Expected Result |
|---|---|---|
| 1 | Submit a normal complaint | Classified correctly, assigned to team member, status = `in_progress`, email sent via Resend |
| 2 | Leave a complaint unresolved for 3+ min | Auto-escalated to manager, status = `escalated`, alert sent via Resend |
| 3 | Submit with empty message or invalid email | `400` error with clear validation message |
| 4 | Rapid automated submissions / Bot spam | Blocked by Rate Limiter / Bot Honeypot Trap |
| 5 | Resolve before escalation timer fires | Status = `resolved`, escalation job cancelled |
| 6 | View Audit Log | Full timeline of events (`received`, `classified`, `assigned`, `escalated`, `resolved`) displayed in modal |

---

## 🔒 Security & Hardening

- **Helmet Security Headers & CSP**: Strict Content Security Policy preventing XSS and clickjacking.
- **Supabase Auth JWT Protection**: Management endpoints require valid Supabase Auth tokens.
- **Rate Limiting & Device Fingerprinting**: `express-rate-limit` + client device IDs prevent API quota exhaustion.
- **Bot Honeypot Trap**: Invisible form inputs trap automated submission bots.
- **GDPR IP Anonymization**: IP addresses are masked before storing in audit logs (`192.168.***.***`).
- **Request Size Limits**: API payloads restricted to `16KB` max to prevent buffer overflow attacks.
- **Row Level Security (RLS)**: Tables enable RLS with explicit policies; backend accesses Supabase via the secure `service_role` key.

---

## 💼 Business Impact

This automation removes manual triage overhead, guarantees every complaint is classified and routed within seconds, sends instant transactional acknowledgments, and automatically escalates unresolved cases — cutting response SLA delays and giving managers full operational visibility.

---

## 📁 Project Structure

```
src/
  index.ts       # Entry point — starts server + workers
  server.ts      # Express API routes, security headers & rate limiters
  worker.ts      # BullMQ processing + escalation workers
  db.ts          # Supabase database helpers & audit logging
  ai.ts          # OpenAI gpt-4o-mini classification
  notify.ts      # Resend email notification abstraction
  config.ts      # Environment configuration & validation
public/
  index.html     # Complaint submission portal (Geometric design)
  status.html    # Interactive dashboard with Supabase Auth & Pagination
  workflow.html  # Visual architecture diagram
scripts/
  setup_uptimerobot.ts  # Automated UptimeRobot keep-alive setup
sql/
  schema.sql     # Database tables & RLS security policies
render.yaml      # One-click Render deployment blueprint
```

---

## 📄 License

Built for BuildFest 2026. All rights reserved.
