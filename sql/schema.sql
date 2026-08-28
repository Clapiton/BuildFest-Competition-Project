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
-- Audit log: records every workflow event for traceability
-- Protected with ON DELETE RESTRICT to guarantee audit log immutability (M5)
CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id   UUID NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
  event          TEXT NOT NULL,  -- received, classified, assigned, escalated, resolved
  detail         TEXT,           -- free-text description of what happened
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast escalation queries (find all in_progress complaints)
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);

-- Index for audit log lookups by complaint
CREATE INDEX IF NOT EXISTS idx_audit_log_complaint_id ON audit_log(complaint_id);

-- Row Level Security (RLS) Hardened (C2 & M5)
-- The backend uses the service_role key which bypasses RLS.
-- Anonymous/direct client access is restricted.

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 1. Service role full access
CREATE POLICY "Service role full access on complaints" ON complaints
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on audit_log" ON audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Authenticated team members via Supabase Auth
CREATE POLICY "Authenticated users can update complaints" ON complaints
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 3. Public insert and select policies
CREATE POLICY "Public can insert complaints" ON complaints
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can select complaints" ON complaints
  FOR SELECT USING (true);

CREATE POLICY "Public can insert audit_log" ON audit_log
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can select audit_log" ON audit_log
  FOR SELECT USING (true);

-- (No SELECT, UPDATE, or DELETE permitted for anonymous clients on either table)
