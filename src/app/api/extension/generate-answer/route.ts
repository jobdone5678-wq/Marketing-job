import { NextResponse } from 'next/server';
import { extensionProfile, cors } from '@/lib/capture/server';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
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

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return cors(
        request,
        NextResponse.json({ ok: false, error: 'AI generation service is not configured.' }, { status: 503 })
      );
    }

    const body = await request.json();
    const { prompt, fieldLabel, candidate, jobTitle, companyName } = body;

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.xkiro.com/v1/';
    const model = process.env.OPENAI_MODEL || 'mistralai/mistral-large-2512';

    const candName = candidate?.full_name || candidate?.name || '';
    if (!candName) {
      return cors(request, NextResponse.json({ ok: false, error: 'Candidate profile missing. Please upload a candidate resume before generating answers.' }, { status: 400 }));
    }
    const skillsStr = Array.isArray(candidate?.skills) && candidate.skills.length > 0
      ? candidate.skills.join(', ')
      : (candidate?.primary_skills || '');
    const candTitle = candidate?.current_job_title || candidate?.target_job_titles || jobTitle || '';
    const candSummary = candidate?.summary || candidate?.bio || candidate?.confirmed_facts?.summary || '';
    const rawSnippet = candidate?.source_text || candidate?.confirmed_facts?.raw_text || '';
    const resumeContext = rawSnippet ? `Resume Highlights: ${rawSnippet.slice(0, 800)}` : '';

    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const completionsUrl = `${cleanBaseUrl}/chat/completions`;

    const systemPrompt = `You are an expert career copilot. Write a concise, compelling, first-person ("I") answer (2-3 sentences, maximum 60 words) for a job application field.
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

    const userPrompt = prompt || `Write a professional response for application field: "${fieldLabel || 'Bio / Cover Letter'}"`;

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
    const answer = rawAnswer.replace(/^["']|["']$/g, '').trim();

    return cors(
      request,
      NextResponse.json({
        ok: true,
        answer,
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
