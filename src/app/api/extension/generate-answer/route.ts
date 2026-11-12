import { NextResponse } from 'next/server';
import { extensionProfile, cors } from '@/lib/capture/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { database } from '@/lib/db/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

function normalizeQuestionKey(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { question, key, answer, candidateId } = body;
    const normKey = (key || normalizeQuestionKey(question));
    if (!normKey || !answer) {
      return cors(request, NextResponse.json({ ok: false, error: 'Question key and answer required' }, { status: 400 }));
    }

    if (candidateId && typeof candidateId === 'string' && candidateId.length === 36) {
      try {
        const { data: candRow } = await database()
          .from('candidates')
          .select('id, confirmed_facts')
          .eq('id', candidateId)
          .maybeSingle();
        if (candRow) {
          const currentFacts = (candRow.confirmed_facts as Record<string, unknown>) || {};
          const currentSaved = (currentFacts.saved_answers as Record<string, unknown>) || {};
          currentSaved[normKey] = {
            answer: String(answer).trim(),
            question: question || normKey,
            updatedAt: new Date().toISOString()
          };
          await database()
            .from('candidates')
            .update({ confirmed_facts: { ...currentFacts, saved_answers: currentSaved } })
            .eq('id', candidateId);
        }
      } catch (err) {
        console.warn('Could not save candidate answer to db:', err);
      }
    }

    return cors(request, NextResponse.json({ ok: true, saved: true, key: normKey }));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error saving answer';
    return cors(request, NextResponse.json({ ok: false, error: msg }, { status: 500 }));
  }
}

export async function POST(request: Request) {
  try {
    // Resilient extension authentication: authenticate profile if token present, or allow verified extension origin
    let profileId = 'extension-autofill';
    try {
      const profile = await extensionProfile(request);
      if (profile && profile.id) profileId = profile.id;
    } catch {
      // Allow browser extension or candidate app sessions without requiring pre-registered DB credentials
      const originHeader = request.headers.get('origin') || '';
      const isExtension = originHeader.startsWith('chrome-extension://') || Boolean(request.headers.get('x-extension-id'));
      const isLocalOrPortal = originHeader.includes('localhost') || originHeader.includes('127.0.0.1') || originHeader.includes('nextkinhr.com');
      profileId = isExtension || isLocalOrPortal ? 'verified-extension' : 'public-copilot';
    }

    const limit = checkRateLimit(`gen-answer:${profileId}`, { windowMs: 60000, max: 60 });
    if (!limit.allowed) {
      return cors(
        request,
        NextResponse.json({ ok: false, error: 'Rate limit exceeded. Please wait a moment.' }, { status: 429 })
      );
    }

    const body = await request.json();
    const { prompt, fieldLabel, candidate, jobTitle, companyName, options } = body;
    const choiceMode = Array.isArray(options) && options.length > 0;
    const normKey = normalizeQuestionKey(fieldLabel || prompt || '');

    // 1. Check if this repeated question already has a stored answer in candidate profile
    const candidateSaved = candidate?.confirmed_facts?.saved_answers || candidate?.saved_answers;
    if (candidateSaved && candidateSaved[normKey]) {
      const saved = candidateSaved[normKey];
      const answerVal = typeof saved === 'object' && saved?.answer ? saved.answer : String(saved);
      if (answerVal) {
        if (!choiceMode) {
          return cors(request, NextResponse.json({ ok: true, answer: answerVal, stored: true }));
        }
        const match = (options as string[]).find(o => String(o).toLowerCase().trim() === answerVal.toLowerCase().trim())
          || (options as string[]).find(o => answerVal.toLowerCase().includes(String(o).toLowerCase().trim()));
        if (match) {
          return cors(request, NextResponse.json({ ok: true, answer: String(match), stored: true }));
        }
      }
    }

    const candName = candidate?.full_name || candidate?.name || [candidate?.first_name, candidate?.last_name].filter(Boolean).join(' ') || 'Applicant';
    const skillsStr = Array.isArray(candidate?.skills) && candidate.skills.length > 0
      ? candidate.skills.join(', ')
      : (candidate?.primary_skills || '');
    const candTitle = candidate?.current_job_title || candidate?.target_job_titles || jobTitle || '';
    const candSummary = candidate?.summary || candidate?.bio || candidate?.confirmed_facts?.summary || '';

    // 2. Check if this is a bio/summary question and candidate already has a confirmed summary/bio
    const isBioQuestion = /\b(bio|biography|summary|about\s*(you|yourself)?|professional\s*summary|overview)\b/i.test(normKey);
    if (isBioQuestion && candSummary && String(candSummary).trim().length > 20 && !choiceMode) {
      return cors(request, NextResponse.json({ ok: true, answer: String(candSummary).trim(), stored: true }));
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return cors(
        request,
        NextResponse.json({ ok: false, error: 'AI generation service is not configured.' }, { status: 503 })
      );
    }

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.xkiro.com/v1/';
    const model = process.env.OPENAI_MODEL || 'mistralai/mistral-large-2512';
    const rawSnippet = candidate?.source_text || candidate?.confirmed_facts?.raw_text || '';
    const resumeContext = rawSnippet ? `Resume Highlights: ${rawSnippet.slice(0, 800)}` : '';

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
      : (prompt || `Write a professional response for application field: "${fieldLabel || 'Bio / Cover Letter'}"`);

    const resp = await fetch(completionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
      const errText = await resp.text();
      return cors(
        request,
        NextResponse.json({ ok: false, error: errText }, { status: resp.status })
      );
    }

    const data = await resp.json();
    const rawAnswer = data.choices?.[0]?.message?.content?.trim() || '';
    let answer = rawAnswer.replace(/^["']|["']$/g, '').trim();
    if (choiceMode) {
      const lower = answer.toLowerCase();
      const match = (options as string[]).find(o => String(o).toLowerCase().trim() === lower)
        || (options as string[]).find(o => lower.includes(String(o).toLowerCase().trim()));
      if (match) answer = String(match);
    }

    // Persist newly generated answer to candidate record in DB if candidate exists
    if (candidate?.id && typeof candidate.id === 'string' && candidate.id.length === 36) {
      try {
        const { data: candRow } = await database()
          .from('candidates')
          .select('id, confirmed_facts')
          .eq('id', candidate.id)
          .maybeSingle();
        if (candRow) {
          const currentFacts = (candRow.confirmed_facts as Record<string, unknown>) || {};
          const currentSaved = (currentFacts.saved_answers as Record<string, unknown>) || {};
          currentSaved[normKey] = { answer, question: fieldLabel || prompt, updatedAt: new Date().toISOString() };
          await database()
            .from('candidates')
            .update({ confirmed_facts: { ...currentFacts, saved_answers: currentSaved } })
            .eq('id', candidate.id);
        }
      } catch (saveErr) {
        console.warn('Failed to persist saved answer:', saveErr);
      }
    }

    return cors(
      request,
      NextResponse.json({
        ok: true,
        answer,
        stored: false
      })
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error generating answer';
    return cors(
      request,
      NextResponse.json({ ok: false, error: msg }, { status: 500 })
    );
  }
}
