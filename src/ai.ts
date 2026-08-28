import OpenAI from "openai";
import { z } from "zod";
import { config } from "./config.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

export interface Classification {
  category: string;
  urgency: string;
  sentiment: string;
  summary: string;
  draft_reply: string;
}

const ClassificationSchema = z.object({
  category: z.enum(["billing", "product", "service", "other"]),
  urgency: z.enum(["low", "medium", "high"]),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  summary: z.string(),
  draft_reply: z.string(),
});

export async function classifyComplaint(rawMessage: string): Promise<Classification> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a complaint triage assistant. Given a raw customer complaint, return ONLY valid JSON with this shape:\n{\n  \"category\": \"billing\" | \"product\" | \"service\" | \"other\",\n  \"urgency\": \"low\" | \"medium\" | \"high\",\n  \"sentiment\": \"positive\" | \"neutral\" | \"negative\",\n  \"summary\": \"one sentence summary of the complaint\",\n  \"draft_reply\": \"a short, empathetic acknowledgment reply to send the customer\"\n}"
      },
      {
        role: "user",
        content: `"""\n${rawMessage}\n"""`
      }
    ],
    response_format: { type: "json_object" }
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("No content in OpenAI response");
  }

  const parsed = JSON.parse(content);
  return ClassificationSchema.parse(parsed);
}

export function fallbackClassification(): Classification {
  return {
    category: "other",
    urgency: "medium",
    sentiment: "neutral",
    summary: "Classification unavailable — manual review required",
    draft_reply: "Thank you for reaching out. We have received your complaint and a team member will review it shortly."
  };
}
