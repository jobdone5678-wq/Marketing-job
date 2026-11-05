import { NextResponse } from 'next/server';
import { extensionProfile, cors } from '@/lib/capture/server';
import { CaptureError } from '@/lib/db/admin';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function POST(request: Request) {
  try {
    // Require authenticated extension profile
    const profile = await extensionProfile(request);

    const limit = checkRateLimit(`gen-answer:${profile.id}`, { windowMs: 60000, max: 30 });
    if (!limit.allowed) {
      return cors(
        request,
        NextResponse.json({ ok: false, error: 'Rate limit exceeded. Please wait a minute.' }, { status: 429 })
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

    const candName = candidate?.full_name || candidate?.name || 'Candidate';
    const skillsStr = Array.isArray(candidate?.skills) ? candidate.skills.join(', ') : (candidate?.primary_skills || 'Full Stack Development, Python, React, TypeScript');

    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const completionsUrl = `${cleanBaseUrl}/chat/completions`;

    const resp = await fetch(completionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are an expert career copilot. Write a concise, professional answer (2-3 sentences, maximum 60 words) for a job application field. Write in first person ("I"). Candidate name: ${candName}, Skills: ${skillsStr}. Role applied for: ${jobTitle || 'Software Engineer'} at ${companyName || 'Company'}. Never include quotes or bullet points.`,
          },
          {
            role: 'user',
            content: prompt || `Write a professional response for application field: "${fieldLabel}"`,
          },
        ],
        max_tokens: 120,
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
    const answer = data.choices?.[0]?.message?.content?.trim() || '';

    return cors(
      request,
      NextResponse.json({
        ok: true,
        answer: answer.replace(/^["']|["']$/g, '').trim(),
      })
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error generating answer';
    const status = err instanceof CaptureError ? err.status : 500;
    return cors(
      request,
      NextResponse.json({ ok: false, error: msg }, { status })
    );
  }
}
