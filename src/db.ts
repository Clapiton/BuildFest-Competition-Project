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

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

export interface PaginatedComplaints {
  complaints: Complaint[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

import { v4 as uuidv4 } from "uuid";

export async function createComplaint(data: { customer_name: string; customer_email: string; raw_message: string }): Promise<Complaint> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const complaintRecord: Complaint = {
    id,
    customer_name: data.customer_name,
    customer_email: data.customer_email,
    raw_message: data.raw_message,
    category: null,
    urgency: null,
    sentiment: null,
    assigned_to: null,
    status: "received",
    ai_summary: null,
    draft_reply: null,
    created_at: now,
    updated_at: now,
  };

  // Try insert with select first
  const { data: created, error } = await supabase
    .from("complaints")
    .insert(complaintRecord)
    .select()
    .single();

  if (error) {
    // If SELECT policy blocked RETURNING *, attempt pure INSERT
    console.warn("[DB Warning] insert with select failed, retrying insert-only:", error.message);
    const { error: insertError } = await supabase
      .from("complaints")
      .insert(complaintRecord);

    if (insertError) {
      console.error("[DB Error] createComplaint:", insertError);
      throw new Error(`Unable to create complaint record: ${insertError.message}`);
    }
  }

  return (created as Complaint) || complaintRecord;
}

export async function getComplaint(id: string): Promise<Complaint | null> {
  const { data, error } = await supabase
    .from("complaints")
    .select()
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") { // 0 rows error
    console.error("[DB Error] getComplaint:", error);
    throw new Error("Unable to retrieve complaint record");
  }
  return (data as Complaint) || null;
}

export async function listComplaints(options: { page?: number; limit?: number; status?: string } = {}): Promise<PaginatedComplaints> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const offset = (page - 1) * limit;

  let query = supabase
    .from("complaints")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("[DB Error] listComplaints:", error);
    throw new Error("Unable to list complaints");
  }

  const total = count ?? (data?.length || 0);
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    complaints: (data as Complaint[]) || [],
    total,
    page,
    limit,
    totalPages,
  };
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
    console.error("[DB Error] updateComplaint:", error);
    throw new Error("Unable to update complaint record");
  }
  return data as Complaint;
}

export async function logAuditEvent(complaintId: string, event: string, detail?: string): Promise<void> {
  const { error } = await supabase
    .from("audit_log")
    .insert({ complaint_id: complaintId, event, detail: detail || null });

  if (error) {
    console.warn("[DB Warning] logAuditEvent failed:", error.message);
  }
}

export async function getAuditLogs(complaintId: string): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select()
    .eq("complaint_id", complaintId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[DB Error] getAuditLogs:", error);
    throw new Error("Unable to retrieve audit logs");
  }
  return data as AuditLogEntry[];
}

