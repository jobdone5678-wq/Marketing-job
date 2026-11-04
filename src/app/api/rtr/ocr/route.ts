import { protectedRoute } from "@/lib/http/protected-route";
import { CaptureError } from "@/lib/db/admin";
import { aiConfiguration } from "@/lib/ai/config";
import { readResume } from "@/lib/resumes/validation";
import OpenAI from "openai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const extractedSchema = z.object({
  candidate_name: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  vendor_name: z.string().nullable().optional(),
  vendor_contact_name: z.string().nullable().optional(),
  vendor_contact_email: z.string().nullable().optional(),
  vendor_contact_phone: z.string().nullable().optional(),
  rtr_type: z.enum(["vendor_rtr", "client_rtr", "direct_rtr"]).default("vendor_rtr"),
  rtr_status: z.enum(["received", "signed", "expired", "rejected"]).default("received"),
  rtr_date: z.string().nullable().optional(),
  expiration_date: z.string().nullable().optional(),
  hourly_rate: z.string().nullable().optional(),
  daily_rate: z.string().nullable().optional(),
  monthly_rate: z.string().nullable().optional(),
  annual_rate: z.string().nullable().optional(),
  currency: z.string().default("USD"),
  representation_clause: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type ExtractedRtrData = z.infer<typeof extractedSchema>;

function regexExtractFallback(text: string, filename: string): ExtractedRtrData {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = text.match(emailRegex) || [];

  const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
  const phones = text.match(phoneRegex) || [];

  // Match rate like $75/hr, $75 / hour, $800/day
  const rateRegex = /\$(\d+(?:\.\d{1,2})?)\s*(?:\/|\s*per\s*)?\s*(hr|hour|day|month|mo|annual|yr)?/i;
  const rateMatch = text.match(rateRegex);

  let hourlyRate: string | null = null;
  let dailyRate: string | null = null;
  let monthlyRate: string | null = null;

  if (rateMatch) {
    const amount = rateMatch[1];
    const unit = (rateMatch[2] || "").toLowerCase();
    if (unit.startsWith("d")) {
      dailyRate = amount;
    } else if (unit.startsWith("m")) {
      monthlyRate = amount;
    } else {
      hourlyRate = amount;
    }
  }

  // Check signed status
  const isSigned = /(signed|electronically signed|docusign|completed|acknowledged and agreed|signature:?\s*[^\n]+)/i.test(
    text
  );

  // Look for date
  const dateRegex = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b|\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i;
  const dateMatch = text.match(dateRegex);
  const foundDate = dateMatch ? dateMatch[0] : new Date().toISOString().slice(0, 10);

  // Check representation clause snippet
  let clause: string | null = null;
  const rtrSnippetRegex = /(?:right to represent|exclusive representation|authorizes?|agrees? to represent|representation agreement)[^\n.]{10,200}\.?/i;
  const clauseMatch = text.match(rtrSnippetRegex);
  if (clauseMatch) {
    clause = clauseMatch[0].trim();
  }

  return {
    candidate_name: null,
    company_name: null,
    job_title: null,
    vendor_name: null,
    vendor_contact_name: null,
    vendor_contact_email: emails[0] || null,
    vendor_contact_phone: phones[0] || null,
    rtr_type: "vendor_rtr",
    rtr_status: isSigned ? "signed" : "received",
    rtr_date: foundDate,
    expiration_date: null,
    hourly_rate: hourlyRate,
    daily_rate: dailyRate,
    monthly_rate: monthlyRate,
    annual_rate: null,
    currency: "USD",
    representation_clause: clause,
    notes: `Extracted via text analysis from ${filename}.`,
  };
}

export async function POST(request: Request) {
  return protectedRoute(request, "recruiting_staff", async () => {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || !file.size) {
      throw new CaptureError("Upload a valid image (PNG, JPG, WEBP) or PDF file up to 10 MiB.", 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new CaptureError("File size exceeds 10 MiB limit.", 413);
    }

    const filename = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(-160);
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    const isPdf = /\.pdf$/i.test(filename) || mimeType === "application/pdf";
    const isImage = /\.(png|jpe?g|webp|gif|bmp)$/i.test(filename) || mimeType.startsWith("image/");

    if (!isPdf && !isImage) {
      throw new CaptureError("Unsupported file type. Please upload a PDF or image (PNG, JPG, WEBP).", 400);
    }

    let rawText = "";
    let extracted: ExtractedRtrData | null = null;

    // 1. If PDF: Extract raw text
    if (isPdf) {
      try {
        const parsed = await readResume(rawBuffer, filename);
        rawText = parsed.text || "";
      } catch (err) {
        console.warn("PDF text parse warning:", err);
      }
    }

    // 2. Try AI Vision / LLM extraction if configured
    try {
      const apiKey = process.env.OPENAI_API_KEY?.trim() || '';
      const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
      const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o';

      if (apiKey) {
        const client = new OpenAI({
          apiKey,
          baseURL,
          timeout: 45000,
        });

        const systemPrompt = `You are an expert recruitment and legal document parser specializing in "Right to Represent" (RTR) agreements, vendor submittal authorizations, and staffing representation letters.
Your task is to perform high-precision OCR and extract all key terms into a structured JSON object matching this schema:
{
  "candidate_name": string or null (the candidate/consultant being represented),
  "company_name": string or null (the end client or target hiring organization),
  "job_title": string or null (the position or requisition title),
  "vendor_name": string or null (the staffing firm, agency, or vendor requesting representation),
  "vendor_contact_name": string or null (name of recruiter or account manager),
  "vendor_contact_email": string or null,
  "vendor_contact_phone": string or null,
  "rtr_type": "vendor_rtr" | "client_rtr" | "direct_rtr",
  "rtr_status": "signed" | "received" | "expired" | "rejected" (determine if signed/acknowledged by candidate or merely received/pending),
  "rtr_date": string or null (date in YYYY-MM-DD or as written),
  "expiration_date": string or null (exclusivity end date or expiration in YYYY-MM-DD),
  "hourly_rate": string or null (e.g. "85.00"),
  "daily_rate": string or null,
  "monthly_rate": string or null,
  "annual_rate": string or null,
  "currency": string (defaults to "USD"),
  "representation_clause": string or null (verbatim or concise summary of the representation/exclusivity clause),
  "notes": string or null (any important caveats, visa conditions, or duration)
}
Return ONLY valid JSON. No markdown backticks, no commentary.`;

        let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];

        if (isImage) {
          const base64Image = `data:${mimeType};base64,${rawBuffer.toString("base64")}`;
          messages = [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Please inspect this Right to Represent (RTR) document image and extract all fields.",
                },
                {
                  type: "image_url",
                  image_url: { url: base64Image, detail: "high" },
                },
              ],
            },
          ];
        } else {
          // PDF with text
          messages = [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Document filename: ${filename}\n\nDocument text content:\n${rawText || "No machine text extracted; examine document headers."}`,
            },
          ];
        }

        const selectedModel = model || "gpt-4o";
        const completion = await client.chat.completions.create({
          model: selectedModel,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.1,
        });

        const content = completion.choices[0]?.message?.content;
        if (content) {
          const parsedJson = JSON.parse(content);
          extracted = extractedSchema.parse(parsedJson);
        }
      }
    } catch (aiError) {
      console.warn("AI OCR parsing fallback triggered:", aiError);
    }

    // 3. Fallback to regex analysis if AI was unavailable or did not complete
    if (!extracted) {
      extracted = regexExtractFallback(rawText || filename, filename);
    }

    return {
      success: true,
      filename,
      mime_type: mimeType,
      raw_text: rawText ? rawText.slice(0, 10000) : null,
      extracted,
    };
  });
}
