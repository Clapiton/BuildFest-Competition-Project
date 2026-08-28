# 🤖 AI Customer Complaint Automation

> **BuildFest 2026 — Track 5, Case Study 1**  
> Participant ID: BF-1079

An end-to-end AI-powered workflow that receives customer complaints, classifies them using OpenAI, routes them to the right team member, sends transactional email notifications via **Resend**, tracks status in real time, and automatically escalates unresolved cases.

## 🔗 Live Demo Links

- 📥 **Public Complaint Intake Form**: [buildfest-competition-project.onrender.com](https://buildfest-competition-project.onrender.com/)
- 💻 **Interactive Management Dashboard**: [buildfest-competition-project.onrender.com/status.html](https://buildfest-competition-project.onrender.com/status.html)

---

## 📋 Problem Statement

Support teams handling customer complaints by email and spreadsheet lose time on manual triage, and complaints often sit unresolved with no automatic follow-up, leading to missed SLAs and frustrated customers.

## ✅ What This Automation Does

1. **Receives** complaints through an intuitive public web form
2. **Classifies** category, urgency, and sentiment using OpenAI (`gpt-4o-mini`)
3. **Routes** to the right team member based on category (billing, product, service, other)
4. **Notifies** the team member and sends an acknowledgment to the customer via **Resend** transactional email (with console fallback)
5. **Tracks** status (`received` → `in_progress` → `escalated` → `resolved`)
6. **Escalates** automatically if unresolved past an SLA threshold (3 min demo / 24h production)
7. **Logs** every step in a Postgres audit log for a complete event timeline

---

## 🏗️ Architecture

```
Customer → Web Form → Express API → Supabase (DB + RLS)
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
| **Express** | API server & static asset host |
| **Supabase (Postgres)** | Database with Row Level Security (RLS) policies |
| **OpenAI API (gpt-4o-mini)** | AI classification and reply generation |
| **Resend SDK** | Transactional email notifications (with SMTP/console fallback) |
| **BullMQ + Redis (Upstash)** | Persistent job queue & delayed escalation timer |
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

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/complaints` | Submit a new customer complaint |
| `GET` | `/api/complaints` | List all complaints |
| `GET` | `/api/complaints/:id` | Get single complaint details |
| `POST` | `/api/complaints/:id/resolve` | Resolve complaint & cancel escalation job |
| `POST` | `/api/complaints/:id/escalate` | Manually escalate complaint to manager |
| `POST` | `/api/complaints/:id/reassign` | Reassign complaint to a different agent |
| `GET` | `/api/complaints/:id/audit-log` | Get full timeline of audit events for a complaint |

---

## 💻 Interactive Dashboard Features ([`/status.html`](https://buildfest-competition-project.onrender.com/status.html))

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
| 3 | Submit with empty message | `400` error with clear validation message |
| 4 | Resolve before escalation timer fires | Status = `resolved`, escalation job cancelled |
| 5 | View Audit Log | Full timeline of events (`received`, `classified`, `assigned`, `escalated`, `resolved`) displayed in modal |

---

## 🔒 Security & Privacy

- **Row Level Security (RLS)**: Tables enable RLS with explicit policies; backend accesses Supabase via the secure `service_role` key.
- **Secret Hygiene**: All API keys (OpenAI, Resend, Supabase, Redis) are kept strictly in environment variables and never committed to version control.
- **Data Privacy**: Customer email and complaint text are stored in your own Supabase instance. No third-party data sharing occurs beyond the OpenAI model invocation.
- **Human-in-the-Loop**: AI classifies and drafts responses, but a human team member or manager retains final authority to resolve or close complaints.

---

## 💼 Business Impact

This automation removes manual triage overhead, guarantees every complaint is classified and routed within seconds, sends instant transactional acknowledgments, and automatically escalates unresolved cases — cutting response SLA delays and giving managers full operational visibility.

---

## 📁 Project Structure

```
src/
  index.ts       # Entry point — starts server + workers
  server.ts      # Express API routes
  worker.ts      # BullMQ processing + escalation workers
  db.ts          # Supabase database helpers & audit logging
  ai.ts          # OpenAI gpt-4o-mini classification
  notify.ts      # Resend email notification abstraction
  config.ts      # Environment configuration & validation
public/
  index.html     # Complaint submission portal
  status.html    # Interactive dashboard with Audit Modal
sql/
  schema.sql     # Database tables & RLS security policies
render.yaml      # One-click Render deployment blueprint
```

---

## 📄 License

Built for BuildFest 2026. All rights reserved.
