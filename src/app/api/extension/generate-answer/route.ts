import { cors, extensionRoute } from '@/lib/capture/server';
import { CaptureError, checkDb, database } from '@/lib/db/admin';
import {
  extensionOwnedCandidate,
  extensionResumeActor,
  normalizeCandidate,
  resumeRequestBody,
} from '@/lib/extension-answers/candidate-context';
import { approvedSavedAnswers } from '@/lib/extension-answers/saved-answers';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { isUrlField } from '../../../../../jobright_extension/core/field-mapping.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

function isCompanySpecificQuestion(question?: string, companyName?: string): boolean {
  const text = String(question || '').toLowerCase();
  const tokens = [
    'this role',
    'this job',
    'this position',
    'our company',
    'this company',
    'why do you want to work',
    'why join',
    'why are you interested',
    'why should we hire you',
    'what excites you about',
  ];
  if (companyName && companyName.trim() && text.includes(companyName.toLowerCase().trim())) {
    return true;
  }
  return tokens.some((t) => text.includes(t));
}

function computeCacheKey(
  question?: string,
  companyName?: string,
  jobTitle?: string
): string | null {
  const normKey = String(question || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (isCompanySpecificQuestion(question, companyName)) {
    const company = companyName?.trim().toLowerCase();
    const role = jobTitle?.trim().toLowerCase();
    if (!company || !role) return null;
    const scope = [company, role].map((part) => part.replace(/%/g, '%25').replace(/\|/g, '%7C'));
    return [normKey, ...scope].join('|');
  }
  return normKey; // Factual question cached globally
}

function normalizeQuestionKey(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const candidateRequest = z.object({
  candidateId: z.uuid(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
});

const approvalRequest = candidateRequest.extend({
  question: z.string().trim().min(1).max(2000),
  answer: z.string().trim().min(1),
});

const generationRequest = candidateRequest.extend({
  prompt: z.string().optional(),
  fieldLabel: z.string().optional(),
  fieldType: z.string().max(40).optional(),
  questionId: z.string().max(200).optional(),
  options: z.array(z.string()).optional(),
});

export async function PUT(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionResumeActor(request);
    const { candidateId, question, answer, companyName, jobTitle } = approvalRequest.parse(
      await resumeRequestBody(request)
    );
    if (isUrlField({ label: question }))
      throw new CaptureError('Provide profile links in your candidate profile.', 422);
    const candidate = await extensionOwnedCandidate(actor, candidateId);
    const cacheKey = computeCacheKey(question, companyName, jobTitle);
    if (!cacheKey) {
      return { ok: true, saved: false, reason: 'unscoped_company_question' };
    }

    const facts = candidate.confirmed_facts || {};
    const saved = (facts.saved_answers as Record<string, unknown>) || {};
    // The database refreshes updated_at on every candidate write.
    const { data, error } = await database()
      .from('candidates')
      .update({
        confirmed_facts: {
          ...facts,
          saved_answers: {
            ...saved,
            [cacheKey]: {
              approved: true,
              answer,
              question,
              updatedAt: new Date().toISOString(),
            },
          },
        },
      })
      .eq('id', candidate.id)
      .eq('user_id', actor.id)
      .eq('updated_at', candidate.updated_at)
      .select('id')
      .maybeSingle();
    checkDb(error);
    if (!data) throw new CaptureError('Candidate facts changed. Retry saving your answer.', 409);

    return { ok: true, saved: true, key: cacheKey };
  });
}

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionResumeActor(request);
    const limit = checkRateLimit(`gen-answer:${actor.id}`, { windowMs: 60000, max: 60 });
    if (!limit.allowed) {
      throw new CaptureError('Rate limit exceeded. Please wait a moment.', 429);
    }

    const {
      candidateId,
      prompt,
      fieldLabel,
      fieldType,
      questionId,
      jobTitle,
      companyName,
      options = [],
    } = generationRequest.parse(await resumeRequestBody(request));
    if (isUrlField({ type: fieldType, label: fieldLabel || prompt, id: questionId }))
      throw new CaptureError('Profile URL fields require a saved candidate link.', 422);
    const candidate = await extensionOwnedCandidate(actor, candidateId);
    const choiceMode = options.length > 0;
    const questionText = fieldLabel || prompt || '';
    const scopedKey = computeCacheKey(questionText, companyName, jobTitle);
    const globalKey = normalizeQuestionKey(questionText);
    const confirmedFacts = candidate.confirmed_facts || {};
    const candidateSaved = approvedSavedAnswers(confirmedFacts.saved_answers);
    const savedAnswer =
      (scopedKey ? candidateSaved[scopedKey]?.answer : undefined) ||
      (!isCompanySpecificQuestion(questionText, companyName)
        ? candidateSaved[globalKey]?.answer
        : undefined);

    if (savedAnswer) {
      if (!choiceMode) {
        return { ok: true, answer: savedAnswer, stored: true };
      }
      const normalizedAnswer = savedAnswer.toLowerCase().trim();
      const match = options.find((option) => option.toLowerCase().trim() === normalizedAnswer);
      if (match) {
        return { ok: true, answer: match, stored: true };
      }
    }

    const profile = normalizeCandidate(candidate);
    const candName = profile.name || 'Applicant';
    const candTitle = profile.title || jobTitle || '';
    const skillsStr = profile.skills.join(', ');
    const candSummary = profile.summary || candidate.bio || '';

    // Answer biography and summary questions from the candidate's saved profile when possible.
    const isBioQuestion =
      /\b(bio|biography|summary|about\s*(you|yourself)?|professional\s*summary|overview)\b/i.test(
        globalKey
      );
    if (isBioQuestion && candSummary && String(candSummary).trim().length > 20 && !choiceMode) {
      return { ok: true, answer: String(candSummary).trim(), stored: true };
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new CaptureError('AI generation service is not configured.', 503);
    }

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.xkiro.com/v1/';
    const model = process.env.OPENAI_MODEL || 'mistralai/mistral-large-2512';
    const rawSnippet = candidate.raw_text || confirmedFacts.raw_text || '';
    const resumeContext =
      typeof rawSnippet === 'string' && rawSnippet
        ? `Resume Highlights: ${rawSnippet.slice(0, 800)}`
        : '';

    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const completionsUrl = `${cleanBaseUrl}/chat/completions`;

    const systemPrompt = choiceMode
      ? `You are a job application assistant. Select the single best answer for the candidate from the provided options, based strictly on their resume.
Candidate: ${candName} (${candTitle})
Key Skills: ${skillsStr}
${resumeContext}
Respond with ONLY the exact text of one chosen option — no explanation, no quotes, no extra words.`
      : `You are an expert career copilot. Write a concise, compelling, first-person ("I") answer (2-3 sentences, maximum 60 words) for a job application field.
Candidate: ${candName} (${candTitle})
Key Skills: ${skillsStr}
${candSummary ? `Candidate Summary: ${candSummary}` : ''}
${resumeContext}
Target Role: ${jobTitle || 'Role'} at ${companyName || 'Target Company'}.
Strict Rules:
- Write strictly in first person ("I", "my") as the candidate.
- Highlight specific real skills and experience from the candidate's profile.
- Do NOT include quotation marks, markdown headings, or bullet points.
- Keep the response under 60 words, direct and natural.`;

    const userPrompt = choiceMode
      ? `Question: "${fieldLabel || prompt || 'Application question'}". Options: ${JSON.stringify(options)}. Return exactly one option label.`
      : prompt ||
        `Write a professional response for application field: "${fieldLabel || 'Bio / Cover Letter'}"`;

    const resp = await fetch(completionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 140,
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      throw new CaptureError('AI generation failed. Please try again.', resp.status);
    }

    const data = await resp.json();
    const rawAnswer = data.choices?.[0]?.message?.content?.trim() || '';
    let answer = rawAnswer.replace(/^["']|["']$/g, '').trim();
    if (choiceMode) {
      const lower = answer.toLowerCase();
      const match =
        options.find((o) => String(o).toLowerCase().trim() === lower) ||
        options.find((o) => lower.includes(String(o).toLowerCase().trim()));
      if (match) answer = String(match);
    }

    return { ok: true, answer, stored: false };
  });
}
