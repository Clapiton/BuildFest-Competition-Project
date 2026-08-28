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
        console.error("Resend error, falling back to SMTP/console:", err);
      }
    }

    // 2. Try SMTP if SMTP_HOST is configured or notificationMode is "email"
    if (config.smtpHost || config.notificationMode === "email") {
      try {
        const transporter = getTransporter();
        const senderAddress = config.smtpUser ? `"Support Team" <${config.smtpUser}>` : `"Support Team" <support@example.com>`;
        await transporter.sendMail({
          from: senderAddress,
          to: email,
          subject: "We've received your complaint",
          text: draftReply,
        });
        console.log(`✉️ [SMTP EMAIL] Sent acknowledgment email to ${email}`);
        return;
      } catch (emailError: any) {
        console.error("⚠️ SMTP Email delivery failed:", emailError.message || emailError);
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
        console.error("Resend error, falling back to SMTP/console:", err);
      }
    }

    if (config.smtpHost || config.notificationMode === "email") {
      try {
        const transporter = getTransporter();
        const senderAddress = config.smtpUser ? `"Support System" <${config.smtpUser}>` : `"Support System" <system@example.com>`;
        await transporter.sendMail({
          from: senderAddress,
          to: assignee,
          subject: `New complaint assigned: ${complaint.id.substring(0, 8)}`,
          text: textContent,
        });
        console.log(`✉️ [SMTP EMAIL] Sent assignment email to ${assignee}`);
        return;
      } catch (emailError: any) {
        console.error("⚠️ SMTP Email delivery failed:", emailError.message || emailError);
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
    const to = config.supportManagerEmail;
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
        console.error("Resend error, falling back to SMTP/console:", err);
      }
    }

    if (config.smtpHost || config.notificationMode === "email") {
      try {
        const transporter = getTransporter();
        const senderAddress = config.smtpUser ? `"Support System" <${config.smtpUser}>` : `"Support System" <system@example.com>`;
        await transporter.sendMail({
          from: senderAddress,
          to,
          subject: `🚨 ESCALATED: Complaint ${complaint.id.substring(0, 8)}`,
          text: textContent,
        });
        console.log(`✉️ [SMTP EMAIL] Sent escalation alert to ${to}`);
        return;
      } catch (emailError: any) {
        console.error("⚠️ SMTP Email delivery failed:", emailError.message || emailError);
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

export async function notifyCustomerStatusUpdate(
  email: string,
  complaintId: string,
  status: string,
  detail?: string
): Promise<string> {
  const shortId = complaintId.substring(0, 8).toUpperCase();
  let subject = `Update on your Complaint #${shortId}`;
  let text = `Hello,\n\nYour complaint (ID: #${shortId}) status has been updated to: ${status.toUpperCase()}.\n`;

  if (status === "resolved") {
    subject = `Resolved: Your Complaint #${shortId}`;
    text += `\nOur team has resolved your issue. ${detail || ''}\nThank you for reaching out to us.`;
  } else if (status === "escalated") {
    subject = `Escalated: Priority Update on Complaint #${shortId}`;
    text += `\nYour complaint has been escalated to Senior Support Management for expedited handling.\n${detail || ''}`;
  } else if (status === "reassigned") {
    subject = `Reassigned: Update on Complaint #${shortId}`;
    text += `\nYour complaint has been reassigned to a specialized team member (${detail || 'Support Specialist'}) who is actively working on your case.`;
  }

  try {
    if (resend) {
      try {
        const { error } = await resend.emails.send({
          from: "Support Team <onboarding@resend.dev>",
          to: [email],
          subject,
          text,
        });

        if (!error) {
          const msg = `✉️ [RESEND EMAIL] Sent ${status} update to customer ${email}`;
          console.log(msg);
          return `Delivered via Resend API to ${email}`;
        }
        console.error("Resend API error:", error);
      } catch (err) {
        console.error("Resend error, falling back:", err);
      }
    }

    if (config.smtpHost || config.notificationMode === "email") {
      try {
        const transporter = getTransporter();
        const senderAddress = config.smtpUser ? `"Support Team" <${config.smtpUser}>` : `"Support Team" <support@example.com>`;
        await transporter.sendMail({
          from: senderAddress,
          to: email,
          subject,
          text,
        });
        const msg = `✉️ [SMTP EMAIL] Sent ${status} update to customer ${email}`;
        console.log(msg);
        return `Delivered via SMTP to ${email}`;
      } catch (emailError: any) {
        console.error("⚠️ SMTP Email delivery failed:", emailError.message || emailError);
      }
    }

    console.log(`
📧 [CUSTOMER CONSEQUENTIAL EMAIL] To: ${email}
Subject: ${subject}
Body: ${text}
    `.trim());
    return `Dispatched (Console Logged) to ${email}`;
  } catch (error) {
    console.error("notifyCustomerStatusUpdate failed:", error);
    return `Failed to send to ${email}`;
  }
}

