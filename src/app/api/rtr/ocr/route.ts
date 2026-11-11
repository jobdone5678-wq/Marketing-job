import { protectedRoute } from "@/lib/http/protected-route";
import { CaptureError } from "@/lib/db/admin";
import { getAIModel } from "@/lib/ai/config";
import { readResume } from "@/lib/resumes/validation";
import { toIsoDate, todayIsoDate } from "@/lib/rtr-dates";
import OpenAI from "openai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

// Matches the upload limit of POST /api/rtr so a document never scans successfully and then
// fails to save.
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

const extractedSchema = z.object({
  candidate_name: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  vendor_name: z.string().nullable().optional(),
  vendor_contact_name: z.string().nullable().optional(),
  vendor_contact_email: z.string().nullable().optional(),
  vendor_contact_phone: z.string().nullable().optional(),
  detected_companies: z.array(z.string()).default([]),
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
  // The database column is a DATE, so the value has to be a real calendar date. The raw text of
  // the document ("11/09/2026", "Nov 9, 2026") is normalised here instead of being written
  // straight into the column.
  const foundDate = toIsoDate(dateMatch ? dateMatch[0] : null) || todayIsoDate();

  // Check representation clause snippet
  let clause: string | null = null;
  const rtrSnippetRegex = /(?:right to represent|exclusive representation|authorizes?|agrees? to represent|representation agreement)[^\n.]{10,200}\.?/i;
  const clauseMatch = text.match(rtrSnippetRegex);
  if (clauseMatch) {
    clause = clauseMatch[0].trim();
  }

  // Candidate Name extraction regex
  let candidateName: string | null = null;
  const candRegexes = [
    /\bI,?\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,3}),?\s+(?:hereby|grant|authorize|agree|confirm)\b/i,
    /(?:candidate(?:\s*name)?|consultant(?:\s*name)?|name of candidate|applicant(?:\s*name)?)\s*[:\-]\s*([A-Za-z]+(?:\s+[A-Za-z]+){1,3})(?=\s+(?:sign|confirm|agree|hereby|to|for|at|\n|\r|$)|$)/i,
    /(?:print\s*name|full\s*name|legal\s*name)\s*[:\-]\s*([A-Za-z]+(?:\s+[A-Za-z]+){1,3})(?=\s+(?:sign|confirm|agree|hereby|to|for|at|\n|\r|$)|$)/i,
    /(?:confirms that candidate|authorizes candidate|represented candidate|submitting candidate|representation of)\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,3})(?=\s+(?:hereby|grants?|to|for|at|\n|\r|$)|$)/i,
    /(?:electronically signed by|signed by|signature(?:\s*of\s*candidate)?|signature:?)\s*[:\-]?\s*([A-Za-z]+(?:\s+[A-Za-z]+){1,3})(?=\s+(?:on|date|\n|\r|$)|$)/i,
    /(?:name)\s*[:\-]\s*([A-Za-z]+(?:\s+[A-Za-z]+){1,3})(?=\s+(?:sign|confirm|agree|hereby|to|for|at|\n|\r|$)|$)/i,
  ];
  for (const reg of candRegexes) {
    const m = text.match(reg);
    if (m && m[1]) {
      const candidateCandidate = m[1].trim();
      if (
        !/^(the|this|that|please|our|your|client|vendor|company|nextkin|nextkinlife|agency|contractor)\b/i.test(candidateCandidate) &&
        !/(?:llc|inc|corp|ltd|solutions|systems|technologies)$/i.test(candidateCandidate)
      ) {
        candidateName = candidateCandidate;
        break;
      }
    }
  }

  // Job Title extraction regex
  let jobTitle: string | null = null;
  const titleRegexes = [
    /(?:position|role|title|job title|requisition)\s*(?:of|for|:|-)\s*([A-Za-z0-9\s/.-]{3,50}?)(?:\s+at|\s+with|\s+for|\n|\.|\$)/i,
    /(?:for the (?:position|role) of)\s+([A-Za-z0-9\s/.-]{3,50}?)(?:\s+at|\s+with|\s+for|\n|\.|\$)/i,
  ];
  for (const reg of titleRegexes) {
    const m = text.match(reg);
    if (m && m[1] && m[1].trim().length > 2) {
      jobTitle = m[1].trim();
      break;
    }
  }

  // Extract different companies mentioned
  const detectedCompanies: string[] = [];
  const companyPattern = /(?:client|company|customer|end\s*client|vendor|agency|employer|at|for)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.,\s]{2,35}(?:Inc|LLC|Corp|Corporation|Technologies|Solutions|Services|Systems|Consulting|Group|Holdings)?)/gi;
  let compMatch;
  while ((compMatch = companyPattern.exec(text)) !== null) {
    const candidate = compMatch[1]?.trim().replace(/[\r\n,.]+$/, '');
    if (candidate && candidate.length > 2 && !detectedCompanies.includes(candidate) && !/^(the|this|that|please|our|your)\b/i.test(candidate)) {
      detectedCompanies.push(candidate);
    }
  }

  return {
    candidate_name: candidateName,
    company_name: detectedCompanies[0] || null,
    job_title: jobTitle,
    vendor_name: detectedCompanies[1] || null,
    vendor_contact_name: null,
    vendor_contact_email: emails[0] || null,
    vendor_contact_phone: phones[0] || null,
    detected_companies: detectedCompanies,
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
  return protectedRoute(request, async () => {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || !file.size) {
      throw new CaptureError("Upload a valid image (PNG, JPG, WEBP) or PDF file up to 4 MiB.", 400);
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new CaptureError("File size exceeds the 4 MiB limit.", 413);
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
      let baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
      if (apiKey.startsWith('AIzaSy')) {
        baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
      } else if (apiKey.startsWith('sk-or-')) {
        baseURL = 'https://openrouter.ai/api/v1';
      } else if (apiKey.startsWith('sk-xt-')) {
        baseURL = 'https://api.xkiro.com/v1';
      }
      const model = getAIModel(baseURL, apiKey);

      if (apiKey) {
        const client = new OpenAI({
          apiKey,
          baseURL,
          timeout: 45000,
        });

        const systemPrompt = `You are an expert recruitment and staffing document parser specializing in extracting details from ANY Right to Represent (RTR) document, vendor email, submittal authorization, job application confirmation, consultant agreement, or staffing email screenshot.
Your task is to perform high-precision OCR and extract all detectable terms into a structured JSON object matching this schema:
{
  "candidate_name": string or null (the candidate/consultant being represented or named in the document; check authorization statements like "I, [Name], hereby...", signature lines, "Candidate Name", "Consultant Name", "Print Name"),
  "company_name": string or null (the primary end client or target hiring organization, e.g. "Google", "JPMorgan Chase", "Apple"),
  "job_title": string or null (the position or requisition title, e.g. "Senior Java Developer", "Cloud Architect"),
  "vendor_name": string or null (the staffing firm, agency, or vendor requesting representation, e.g. "Apex Systems", "Collabera"),
  "detected_companies": array of strings (ALL distinct company names, end-clients, prime vendors, implementation partners, or agency names detected anywhere in the document/image),
  "vendor_contact_name": string or null (name of recruiter or account manager),
  "vendor_contact_email": string or null,
  "vendor_contact_phone": string or null,
  "rtr_type": "vendor_rtr" | "client_rtr" | "direct_rtr",
  "rtr_status": "signed" | "received" | "expired" | "rejected" (determine if signed/acknowledged by candidate or merely received/pending),
  "rtr_date": string or null (date in YYYY-MM-DD or as written in document),
  "expiration_date": string or null (exclusivity end date or expiration in YYYY-MM-DD),
  "hourly_rate": string or null (e.g. "85.00" or numeric amount),
  "daily_rate": string or null,
  "monthly_rate": string or null,
  "annual_rate": string or null,
  "currency": string (defaults to "USD"),
  "representation_clause": string or null (verbatim or concise summary of the representation/authorization clause),
  "notes": string or null (any important caveats, visa terms, work authorization, or duration)
}
Guidelines:
- Extract all fields generously from ANY email thread, screenshot, or document. Even if informal, extract the client, role, rate, vendor, and candidate.
- Specifically locate the candidate/consultant individual person name (not the agency or corporate entity). Check "I, [Name], hereby authorize", candidate signatures, print name, or consultant headers.
- Never refuse or omit fields if they can reasonably be identified from the text or image.
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
        let content: string | null | undefined = null;
        try {
          const completion = await client.chat.completions.create({
            model: selectedModel,
            messages,
            response_format: { type: "json_object" },
            temperature: 0.1,
          });
          content = completion.choices[0]?.message?.content;
        } catch {
          const completion = await client.chat.completions.create({
            model: selectedModel,
            messages,
            temperature: 0.1,
          });
          content = completion.choices[0]?.message?.content;
        }

        if (content) {
          const cleanJson = content
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          const parsedJson = JSON.parse(cleanJson);
          extracted = extractedSchema.parse(parsedJson);

          // Dates are stored in DATE columns, so they have to be real calendar dates.
          extracted.rtr_date = toIsoDate(extracted.rtr_date) || todayIsoDate();
          extracted.expiration_date = toIsoDate(extracted.expiration_date);

          // Consolidate all unique detected companies
          const allFound = new Set<string>(extracted.detected_companies || []);
          if (extracted.company_name) allFound.add(extracted.company_name);
          if (extracted.vendor_name) allFound.add(extracted.vendor_name);
          extracted.detected_companies = Array.from(allFound).map((c) => c.trim()).filter(Boolean);
        }
      }
    } catch (aiError) {
      console.warn("AI OCR parsing fallback triggered:", aiError);
    }

    // 3. Fallback to regex analysis if AI was unavailable or did not complete
    if (!extracted) {
      extracted = regexExtractFallback(rawText || filename, filename);
    } else if (extracted.detected_companies.length === 0) {
      const fallback = regexExtractFallback(rawText || filename, filename);
      extracted.detected_companies = fallback.detected_companies;
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
