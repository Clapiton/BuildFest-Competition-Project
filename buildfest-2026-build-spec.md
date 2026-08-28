# BuildFest 2026 - Track 5, Case Study 1: AI Workflow Automation
## Build Spec (TypeScript, AI agent ready)

Participant ID: BF-1079
Deadline: Friday 29 August 2026
Scenario chosen: Customer complaint handling, end to end

---

## 1. What this automation does

A customer submits a complaint through a simple web form. The system:
1. Receives the complaint
2. Uses an AI model to extract structured details and classify category, urgency and sentiment
3. Routes it to the right team member based on category
4. Sends a notification to that team member and an acknowledgment to the customer
5. Tracks status (received, in progress, escalated, resolved) in a database
6. If it sits unresolved past a time limit, escalates automatically to a manager
7. Logs every step for a clear audit trail

This maps directly onto every bullet in the case study brief: intake, extraction, classification, routing, notifications, status updates, escalation, and a record of the workflow.

---

## 2. Tech stack

- **Runtime**: Node.js + TypeScript
- **API layer**: Express (or Fastify if the agent prefers)
- **Queue/scheduling**: BullMQ + Redis, for the escalation timer and retries
- **Database**: Supabase (Postgres) for complaint records and audit log
- **AI model**: Anthropic Claude API (or OpenAI, whichever key is available) for extraction, classification and draft reply generation
- **Notifications**: Nodemailer (SMTP) or Resend for email; console log is an acceptable stand in if email setup takes too long
- **Frontend**: a single static HTML form for intake, plus a minimal read only status page (can be plain HTML + fetch, no framework needed)
- **Environment/config**: dotenv for API keys and secrets

Keep every credential in environment variables, never hardcoded. This satisfies the brief's security requirement directly.

---

## 3. Data model (Supabase / Postgres)

**complaints**
| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| customer_name | text | |
| customer_email | text | |
| raw_message | text | original submission |
| category | text | AI classified: billing, product, service, other |
| urgency | text | low, medium, high |
| sentiment | text | positive, neutral, negative |
| assigned_to | text | team member or "manager" after escalation |
| status | text | received, in_progress, escalated, resolved |
| ai_summary | text | AI generated summary |
| draft_reply | text | AI generated customer acknowledgment |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**audit_log**
| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| complaint_id | uuid, fk | |
| event | text | e.g. "received", "classified", "assigned", "escalated", "resolved" |
| detail | text | free text |
| created_at | timestamptz | |

---

## 4. API endpoints

- `POST /complaints` — intake endpoint, accepts form submission, kicks off the pipeline
- `GET /complaints/:id` — status lookup for the customer or demo
- `GET /complaints` — list view for the internal status page
- `POST /complaints/:id/resolve` — manual action a team member takes, stops the escalation timer

---

## 5. Pipeline logic (the core workflow)

1. `POST /complaints` saves a raw record with status `received`, logs an audit event, and enqueues a BullMQ job
2. The job worker calls the AI model once with a single prompt that returns structured JSON: category, urgency, sentiment, a one line summary, and a draft customer reply
3. Worker updates the record with these fields, sets status to `in_progress`, assigns to a team member based on a simple category to person lookup table, logs an audit event
4. Worker sends the draft reply to the customer (or logs it if email is not wired up in time) and a notification to the assigned person
5. Worker schedules a delayed BullMQ job (use 2 to 5 minutes for the demo, framed as representing a longer real world SLA like 24 hours) that checks if status is still `in_progress`
6. If unresolved when the delayed job fires: reassign to `manager`, set status to `escalated`, send an escalation notification, log the event
7. `POST /complaints/:id/resolve` sets status to `resolved`, logs the event, cancels the pending escalation job

---

## 6. AI prompt to use inside the pipeline

```
You are a complaint triage assistant. Given a raw customer complaint, return ONLY valid JSON with this shape:

{
  "category": "billing" | "product" | "service" | "other",
  "urgency": "low" | "medium" | "high",
  "sentiment": "positive" | "neutral" | "negative",
  "summary": "one sentence summary of the complaint",
  "draft_reply": "a short, empathetic acknowledgment reply to send the customer"
}

Complaint:
"""
{{raw_message}}
"""
```

---

## 7. Error handling to build in (judges specifically look for this)

- Reject empty or malformed form submissions with a clear 400 response
- Wrap the AI call in a try/catch, if it fails or returns invalid JSON, fall back to category "other", urgency "medium", and retry once via BullMQ's built in retry
- If email sending fails, log the failure to `audit_log` rather than crash the pipeline
- Idempotency: getting the same complaint id twice should not double enqueue escalation jobs

---

## 8. Security and privacy notes to include in your writeup

- API keys and SMTP credentials live in environment variables, never committed
- Customer email and message content are stored only in your own Supabase instance, not sent to any third party beyond the AI model call itself
- State clearly that a human (the assigned team member or manager) must take the final resolving action, the AI never auto closes a complaint

---

## 9. Test cases to run and record (screenshot or short clip each)

1. A normal complaint that gets classified and assigned correctly
2. A complaint left unresolved that escalates automatically once the timer fires
3. A malformed submission (empty message) that gets rejected cleanly
4. A resolved complaint where you call `/resolve` before the escalation timer fires, and confirm no escalation happens

---

## 10. Deliverables checklist (from the official brief)

- [ ] Explanation of the operational problem (draft this yourself in 2 to 3 sentences, see below)
- [ ] Working prototype (this build)
- [ ] Visual workflow diagram (sketch the 7 pipeline steps above)
- [ ] Explanation of each connected tool (Supabase, BullMQ, Claude API, email)
- [ ] List of platforms, APIs, tools used
- [ ] Sample inputs, outputs, triggers, actions (from your 4 test cases)
- [ ] Evidence of testing (screenshots/clips)
- [ ] Evidence of error handling (the malformed submission test)
- [ ] Privacy and security notes (section 8 above)
- [ ] Short demo/presentation
- [ ] Business impact paragraph (see below)

**Problem statement draft**: "Support teams handling customer complaints by email and spreadsheet lose time on manual triage, and complaints often sit unresolved with no automatic follow up, leading to missed SLAs and frustrated customers."

**Business impact draft**: "This automation removes manual triage, guarantees every complaint is classified and assigned within seconds, and automatically escalates anything left unresolved, cutting response delays and giving managers visibility into unresolved cases without needing to check manually."

---

## 11. Agent prompt (paste this directly into your AI coding agent)

```
Build a TypeScript Node.js backend for a customer complaint handling automation. Requirements:

1. Express server with these endpoints:
   - POST /complaints (accepts customer_name, customer_email, raw_message)
   - GET /complaints/:id
   - GET /complaints (list all)
   - POST /complaints/:id/resolve

2. Use Supabase (Postgres) with two tables: complaints and audit_log, per this schema:
[paste section 3 table definitions here]

3. On POST /complaints: insert a record with status "received", log an audit event, then enqueue a BullMQ job on a Redis queue named "complaint-processing".

4. The BullMQ worker should:
   - Call the Anthropic Claude API (model claude-sonnet-4-5, or whichever is configured via ANTHROPIC_API_KEY) with this exact prompt, substituting the raw_message:
   [paste section 6 prompt here]
   - Parse the JSON response defensively, on any parse failure or API error, retry once via BullMQ's retry mechanism, and if it still fails, fall back to category "other", urgency "medium", sentiment "neutral"
   - Update the complaint record with category, urgency, sentiment, ai_summary, draft_reply, assigned_to (map category to a person via a simple lookup object), and set status to "in_progress"
   - Log an audit event
   - Send (or console.log if SMTP is not configured) the draft_reply to the customer and a notification to assigned_to
   - Schedule a delayed job (delay: 3 minutes) that checks if the complaint is still "in_progress", and if so, sets assigned_to to "manager", status to "escalated", sends an escalation notification, and logs the event

5. POST /complaints/:id/resolve should set status to "resolved", log the event, and remove any pending delayed escalation job for that complaint id.

6. Include a minimal static HTML form (public/index.html) for submitting a complaint, and a minimal static status page (public/status.html) that fetches GET /complaints and renders them in a table with color coded status.

7. Use environment variables for all secrets (SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY, REDIS_URL, SMTP credentials). Include a .env.example file.

8. Include basic input validation on POST /complaints, reject empty raw_message with a 400 and a clear error message.

9. Write a short README explaining how to run it locally, what each endpoint does, and how the escalation timer works.

Structure the project as: src/server.ts, src/worker.ts, src/db.ts, src/ai.ts, src/notify.ts, public/index.html, public/status.html, .env.example, README.md
```

---

## 12. If you swap to leave/expense approval instead

Same architecture, different labels: intake becomes a leave request form, the AI step classifies leave type and checks for date conflicts, routing goes to the employee's manager instead of a category based team, and "resolved" becomes "approved" or "denied." The escalation logic (unresolved after a delay) stays identical.
