import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export interface Complaint {
  id: string;
  customer_name: string;
  customer_email: string;
  raw_message: string;
  category: string | null;
  urgency: string | null;
  sentiment: string | null;
  assigned_to: string | null;
  status: string;
  ai_summary: string | null;
  draft_reply: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  complaint_id: string;
  event: string;
  detail: string | null;
  created_at: string;
}

export const supabase = createClient(config.supabaseUrl, config.supabaseKey);

export async function createComplaint(data: { customer_name: string; customer_email: string; raw_message: string }): Promise<Complaint> {
  const { data: created, error } = await supabase
    .from("complaints")
    .insert({ ...data, status: "received" })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create complaint: ${error.message}`);
  }
  return created as Complaint;
}

export async function getComplaint(id: string): Promise<Complaint | null> {
  const { data, error } = await supabase
    .from("complaints")
    .select()
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") { // 0 rows error
    throw new Error(`Failed to get complaint: ${error.message}`);
  }
  return (data as Complaint) || null;
}

export async function listComplaints(): Promise<Complaint[]> {
  const { data, error } = await supabase
    .from("complaints")
    .select()
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list complaints: ${error.message}`);
  }
  return data as Complaint[];
}

export async function updateComplaint(id: string, fields: Partial<Omit<Complaint, 'id' | 'created_at'>>): Promise<Complaint> {
  const updateData = { ...fields, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("complaints")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update complaint: ${error.message}`);
  }
  return data as Complaint;
}

export async function logAuditEvent(complaintId: string, event: string, detail?: string): Promise<void> {
  const { error } = await supabase
    .from("audit_log")
    .insert({ complaint_id: complaintId, event, detail: detail || null });

  if (error) {
    throw new Error(`Failed to log audit event: ${error.message}`);
  }
}

export async function getAuditLogs(complaintId: string): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select()
    .eq("complaint_id", complaintId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch audit log: ${error.message}`);
  }
  return data as AuditLogEntry[];
}

