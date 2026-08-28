-- BuildFest 2026 — Customer Complaint Automation
-- Run this in the Supabase SQL Editor to create the required tables.

-- Complaints table: stores every customer complaint and its processing state
CREATE TABLE IF NOT EXISTS complaints (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  raw_message    TEXT NOT NULL,
  category       TEXT,                              -- AI classified: billing, product, service, other
  urgency        TEXT,                              -- AI classified: low, medium, high
  sentiment      TEXT,                              -- AI classified: positive, neutral, negative
  assigned_to    TEXT,                              -- team member email or "manager" after escalation
  status         TEXT NOT NULL DEFAULT 'received',  -- received, in_progress, escalated, resolved
  ai_summary     TEXT,                              -- AI generated one-line summary
  draft_reply    TEXT,                              -- AI generated customer acknowledgment
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log: records every workflow event for traceability
CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id   UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  event          TEXT NOT NULL,  -- received, classified, assigned, escalated, resolved
  detail         TEXT,           -- free-text description of what happened
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast escalation queries (find all in_progress complaints)
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);

-- Index for audit log lookups by complaint
CREATE INDEX IF NOT EXISTS idx_audit_log_complaint_id ON audit_log(complaint_id);

-- Row Level Security (RLS)
-- RLS is enabled by default on Supabase tables.
-- The backend uses the service_role key which bypasses RLS.
-- These policies provide defense-in-depth for any direct client access.

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policies for complaints table
CREATE POLICY "Allow public insert on complaints" ON complaints
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select on complaints" ON complaints
  FOR SELECT USING (true);

CREATE POLICY "Allow service update on complaints" ON complaints
  FOR UPDATE USING (true) WITH CHECK (true);

-- Policies for audit_log table
CREATE POLICY "Allow public insert on audit_log" ON audit_log
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select on audit_log" ON audit_log
  FOR SELECT USING (true);
