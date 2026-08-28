import { config } from "./config.js";
import { Resend } from "resend";
import nodemailer from "nodemailer";

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

function getTransporter() {
  if (!config.smtpHost) {
    throw new Error("SMTP configuration missing");
  }
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort || 587,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
}

export async function notifyCustomer(email: string, draftReply: string): Promise<void> {
  try {
    // 1. Try Resend if API key is configured
    if (resend) {
      try {
        const { error } = await resend.emails.send({
          from: "Support Team <onboarding@resend.dev>",
          to: [email],
          subject: "We've received your complaint",
          text: draftReply,
        });

        if (!error) {
          console.log(`✉️ [RESEND EMAIL] Sent acknowledgment email to ${email}`);
          return;
        }
        console.error("Resend API error:", error);
      } catch (err) {
        console.error("Resend error, falling back:", err);
      }
    }

    // 2. Try SMTP if notificationMode is email
    if (config.notificationMode === "email") {
      try {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: `"Support Team" <${config.smtpUser || "support@example.com"}>`,
          to: email,
          subject: "We've received your complaint",
          text: draftReply,
        });
        console.log(`✉️ [SMTP EMAIL] Sent acknowledgment email to ${email}`);
        return;
      } catch (emailError) {
        console.error("Email failed, falling back to console logging:", emailError);
      }
    }

    // 3. Fallback to formatted console log
    console.log(`
📧 [CUSTOMER ACK] To: ${email}
Subject: We've received your complaint
Body: ${draftReply}
    `.trim());
  } catch (error) {
    console.error("notifyCustomer failed:", error);
  }
}

export async function notifyTeamMember(assignee: string, complaint: { id: string; customer_name: string; ai_summary: string | null; urgency: string | null; category: string | null }): Promise<void> {
  try {
    const textContent = `New Complaint Assignment\n\nComplaint ID: ${complaint.id}\nCustomer: ${complaint.customer_name}\nCategory: ${complaint.category || 'N/A'}\nUrgency: ${complaint.urgency || 'N/A'}\nSummary: ${complaint.ai_summary || 'N/A'}`;

    if (resend) {
      try {
        const { error } = await resend.emails.send({
          from: "Support System <onboarding@resend.dev>",
          to: [assignee],
          subject: `New complaint assigned: ${complaint.id.substring(0, 8)}`,
          text: textContent,
        });

        if (!error) {
          console.log(`✉️ [RESEND EMAIL] Sent assignment email to ${assignee}`);
          return;
        }
        console.error("Resend API error:", error);
      } catch (err) {
        console.error("Resend error, falling back:", err);
      }
    }

    if (config.notificationMode === "email") {
      try {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: `"Support System" <${config.smtpUser || "system@example.com"}>`,
          to: assignee,
          subject: `New complaint assigned: ${complaint.id.substring(0, 8)}`,
          text: textContent,
        });
        console.log(`✉️ [SMTP EMAIL] Sent assignment email to ${assignee}`);
        return;
      } catch (emailError) {
        console.error("Email failed, falling back to console logging:", emailError);
      }
    }

    console.log(`
📋 [TEAM ASSIGNMENT] To: ${assignee}
New complaint assigned: ${complaint.id}
Customer: ${complaint.customer_name}
Category: ${complaint.category || 'N/A'} | Urgency: ${complaint.urgency || 'N/A'}
Summary: ${complaint.ai_summary || 'N/A'}
    `.trim());
  } catch (error) {
    console.error("notifyTeamMember failed:", error);
  }
}

export async function notifyEscalation(complaint: { id: string; customer_name: string; ai_summary: string | null; assigned_to: string | null }): Promise<void> {
  try {
    const to = "manager@support.team";
    const textContent = `⚠️ Complaint Escalation Alert\n\nComplaint ID: ${complaint.id}\nCustomer: ${complaint.customer_name}\nPreviously Assigned To: ${complaint.assigned_to || 'unassigned'}\nSummary: ${complaint.ai_summary || 'N/A'}`;

    if (resend) {
      try {
        const { error } = await resend.emails.send({
          from: "Support System <onboarding@resend.dev>",
          to: [to],
          subject: `🚨 ESCALATED: Complaint ${complaint.id.substring(0, 8)}`,
          text: textContent,
        });

        if (!error) {
          console.log(`✉️ [RESEND EMAIL] Sent escalation alert to ${to}`);
          return;
        }
        console.error("Resend API error:", error);
      } catch (err) {
        console.error("Resend error, falling back:", err);
      }
    }

    if (config.notificationMode === "email") {
      try {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: `"Support System" <${config.smtpUser || "system@example.com"}>`,
          to,
          subject: `🚨 ESCALATED: Complaint ${complaint.id.substring(0, 8)}`,
          text: textContent,
        });
        console.log(`✉️ [SMTP EMAIL] Sent escalation alert to ${to}`);
        return;
      } catch (emailError) {
        console.error("Email failed, falling back to console logging:", emailError);
      }
    }

    console.log(`
🚨 [ESCALATION] To: ${to}
Complaint ${complaint.id} has been escalated!
Customer: ${complaint.customer_name}
Previously assigned to: ${complaint.assigned_to || 'unassigned'}
Summary: ${complaint.ai_summary || 'N/A'}
    `.trim());
  } catch (error) {
    console.error("notifyEscalation failed:", error);
  }
}
