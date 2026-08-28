import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config.js";
import { getComplaint, updateComplaint, logAuditEvent } from "./db.js";
import { classifyComplaint, fallbackClassification } from "./ai.js";
import { notifyCustomer, notifyTeamMember, notifyEscalation, notifyCustomerStatusUpdate } from "./notify.js";

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const complaintQueue = new Queue("complaint-processing", { connection });
export const escalationQueue = new Queue("escalation-check", { connection });

const ROUTING_TABLE: Record<string, string> = {
  billing: config.supportBillingEmail,
  product: config.supportProductEmail,
  service: config.supportServiceEmail,
  other: config.supportOtherEmail,
};

const processingHandler = async (job: Job) => {
  const { complaintId } = job.data;
  const complaint = await getComplaint(complaintId);
  
  if (!complaint) {
    throw new Error(`Complaint ${complaintId} not found`);
  }

  let classification;
  try {
    classification = await classifyComplaint(complaint.raw_message);
  } catch (error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1) - 1) {
      classification = fallbackClassification();
    } else {
      throw error;
    }
  }

  const assignee = ROUTING_TABLE[classification.category] || ROUTING_TABLE.other;

  await updateComplaint(complaintId, {
    category: classification.category,
    urgency: classification.urgency,
    sentiment: classification.sentiment,
    ai_summary: classification.summary,
    draft_reply: classification.draft_reply,
    assigned_to: assignee,
    status: "in_progress"
  });

  await logAuditEvent(complaintId, "classified", `Category: ${classification.category}, Urgency: ${classification.urgency}, Sentiment: ${classification.sentiment}`);
  await logAuditEvent(complaintId, "assigned", `Assigned to ${assignee}`);

  await notifyCustomer(complaint.customer_email, classification.draft_reply);
  await logAuditEvent(complaintId, "email_sent", `Customer Acknowledgment email sent to ${complaint.customer_email}`);
  
  await notifyTeamMember(assignee, {
    id: complaint.id,
    customer_name: complaint.customer_name,
    ai_summary: classification.summary,
    urgency: classification.urgency,
    category: classification.category
  });
  await logAuditEvent(complaintId, "email_sent", `Assignment notice email sent to ${assignee}`);

  await escalationQueue.add(
    "check-escalation",
    { complaintId: complaint.id },
    {
      jobId: `escalation-${complaint.id}`,
      delay: config.escalationDelayMs,
    }
  );

  console.log(`✅ Complaint ${complaint.id} processed: ${classification.category} / ${classification.urgency} → ${assignee}`);
};

const processingWorker = new Worker("complaint-processing", processingHandler, {
  connection,
  concurrency: 5,
});

processingWorker.on("completed", (job) => {
  // log success if needed
});

processingWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

const escalationHandler = async (job: Job) => {
  const { complaintId } = job.data;
  const complaint = await getComplaint(complaintId);

  if (!complaint || complaint.status !== "in_progress") {
    console.log(`Skipping escalation for ${complaintId}`);
    return;
  }

  await updateComplaint(complaintId, { status: "escalated", assigned_to: config.supportManagerEmail });
  await logAuditEvent(complaintId, "escalated", "Auto-escalated: unresolved past SLA threshold");
  
  await notifyEscalation({
    id: complaint.id,
    customer_name: complaint.customer_name,
    ai_summary: complaint.ai_summary,
    assigned_to: complaint.assigned_to
  });
  await logAuditEvent(complaintId, "email_sent", `Manager escalation alert sent to ${config.supportManagerEmail}`);

  await notifyCustomerStatusUpdate(complaint.customer_email, complaint.id, "escalated", "SLA threshold exceeded; complaint escalated to senior management");
  await logAuditEvent(complaintId, "email_sent", `Customer Escalation update email sent to ${complaint.customer_email}`);

  console.log(`⚠️ Complaint ${complaint.id} escalated to manager`);
};

const escalationWorker = new Worker("escalation-check", escalationHandler, {
  connection,
});

export function startWorkers(): void {
  console.log("👷 BullMQ workers started");
  console.log(`⏱️  Escalation delay: ${config.escalationDelayMs / 1000}s`);
}

export async function closeWorkers(): Promise<void> {
  await processingWorker.close();
  await escalationWorker.close();
  await connection.quit();
  console.log("Workers shut down gracefully");
}
