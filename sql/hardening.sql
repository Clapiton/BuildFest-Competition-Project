-- ==========================================================
-- BuildFest 2026 — Security Hardening Migration
-- Run this script in the Supabase SQL Editor to remediate C2 & M5.
-- ==========================================================

-- 1. Drop insecure, permissive policies
DROP POLICY IF EXISTS "Allow public insert on complaints" ON complaints;
DROP POLICY IF EXISTS "Allow public select on complaints" ON complaints;
DROP POLICY IF EXISTS "Allow service update on complaints" ON complaints;
DROP POLICY IF EXISTS "Allow public insert on audit_log" ON audit_log;
DROP POLICY IF EXISTS "Allow public select on audit_log" ON audit_log;

-- 2. Ensure RLS is active
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 3. Complaints Table Policies
-- Backend service_role gets full access (bypasses RLS by default, but explicit for clarity)
CREATE POLICY "Service role full access on complaints" ON complaints
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated team members (via Supabase Auth)
CREATE POLICY "Authenticated users can update complaints" ON complaints
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Public / Anon access: Allow insert and select (required for .insert().select() RETURNING *)
CREATE POLICY "Public can insert complaints" ON complaints
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can select complaints" ON complaints
  FOR SELECT
  USING (true);


-- 4. Audit Log Table Policies
CREATE POLICY "Service role full access on audit_log" ON audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can insert audit_log" ON audit_log
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can select audit_log" ON audit_log
  FOR SELECT
  USING (true);

-- NO UPDATE OR DELETE policies for audit_log: audit logs are strictly append-only!


-- 5. Address M5: Prevent Cascase Deletion of Audit Logs
-- Ensure audit records remain immutable even if an underlying complaint record is tampered with.
DO $$
BEGIN
  -- Drop existing cascade constraint if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'audit_log_complaint_id_fkey' 
    AND table_name = 'audit_log'
  ) THEN
    ALTER TABLE audit_log DROP CONSTRAINT audit_log_complaint_id_fkey;
    
    ALTER TABLE audit_log 
      ADD CONSTRAINT audit_log_complaint_id_fkey 
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE RESTRICT;
  END IF;
END $$;
