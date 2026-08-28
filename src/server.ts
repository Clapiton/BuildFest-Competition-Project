import express from "express";
import cors from "cors";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { createComplaint, getComplaint, listComplaints, updateComplaint, logAuditEvent, getAuditLogs } from "./db.js";
import { complaintQueue, escalationQueue } from "./worker.js";
import { notifyEscalation } from "./notify.js";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const ComplaintInput = z.object({
  customer_name: z.string().min(1, "Customer name is required"),
  customer_email: z.string().email("Valid email is required"),
  raw_message: z.string().min(1, "Complaint message cannot be empty"),
});

app.post("/api/complaints", async (req, res) => {
  const result = ComplaintInput.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }

  const { customer_name, customer_email, raw_message } = result.data;
  try {
    const complaint = await createComplaint({ customer_name, customer_email, raw_message });
    await logAuditEvent(complaint.id, "received", "Complaint received via web form");
    await complaintQueue.add("process-complaint", { complaintId: complaint.id }, { jobId: complaint.id });
    res.status(201).json({ success: true, complaint });
  } catch (error) {
    console.error("Error creating complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/complaints/:id", async (req, res) => {
  try {
    const complaint = await getComplaint(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    res.status(200).json(complaint);
  } catch (error) {
    console.error("Error fetching complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/complaints", async (req, res) => {
  try {
    const complaints = await listComplaints();
    res.status(200).json(complaints);
  } catch (error) {
    console.error("Error listing complaints:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/complaints/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await getComplaint(id);
    
    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    
    if (complaint.status === "resolved") {
      return res.status(400).json({ error: "Complaint is already resolved" });
    }

    const updated = await updateComplaint(id, { status: "resolved" });
    await logAuditEvent(id, "resolved", "Complaint manually resolved by team member");

    try {
      const job = await escalationQueue.getJob(`escalation-${id}`);
      if (job) {
        await job.remove();
      }
    } catch (jobError) {
      console.error("Error removing escalation job:", jobError);
    }

    res.status(200).json({ success: true, complaint: updated });
  } catch (error) {
    console.error("Error resolving complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/complaints/:id/audit-log", async (req, res) => {
  try {
    const logs = await getAuditLogs(req.params.id);
    res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/complaints/:id/escalate", async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await getComplaint(id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });
    if (complaint.status === "resolved") return res.status(400).json({ error: "Cannot escalate a resolved complaint" });

    const updated = await updateComplaint(id, { status: "escalated", assigned_to: "manager@support.team" });
    await logAuditEvent(id, "escalated", "Manually escalated to manager via dashboard");
    await notifyEscalation({
      id: complaint.id,
      customer_name: complaint.customer_name,
      ai_summary: complaint.ai_summary,
      assigned_to: complaint.assigned_to,
    });

    res.status(200).json({ success: true, complaint: updated });
  } catch (error) {
    console.error("Error escalating complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/complaints/:id/reassign", async (req, res) => {
  try {
    const { id } = req.params;
    const { assignee } = req.body;
    if (!assignee || typeof assignee !== "string") {
      return res.status(400).json({ error: "Assignee email is required" });
    }
    const complaint = await getComplaint(id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    const updated = await updateComplaint(id, { assigned_to: assignee });
    await logAuditEvent(id, "reassigned", `Reassigned to ${assignee}`);
    
    res.status(200).json({ success: true, complaint: updated });
  } catch (error) {
    console.error("Error reassigning complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export function startServer(): void {
  app.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);
    console.log(`📋 Submit complaints at http://localhost:${config.port}/`);
    console.log(`📊 View status at http://localhost:${config.port}/status.html`);
  });
}
