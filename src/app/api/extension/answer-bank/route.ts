import { cors, extensionProfile, extensionRoute } from '@/lib/capture/server';
import { CaptureError } from '@/lib/db/admin';
import {
  assertQuestionAllowedInAnswerBank,
  confirmScreeningAnswerBankEntry,
  deleteScreeningAnswerBankEntry,
  listScreeningAnswerBank,
  normalizeAnswerBankTopic,
  upsertScreeningAnswerBankEntry,
} from '@/lib/candidate/answerbank';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export function normalizeQuestion(text: string): string {
  try {
    return normalizeAnswerBankTopic(text);
  } catch {
    return '';
  }
}

export async function GET(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const url = new URL(request.url);
    const sendableOnly = url.searchParams.get('sendableOnly') !== 'false';
    const entries = await listScreeningAnswerBank(actor.id, { sendableOnly });
    return { answers: entries };
  });
}

const postSchema = z.object({
  question: z.string().trim().min(1, 'Question is required').max(3000),
  answer: z.string().trim().min(1, 'Answer is required'),
  provenance: z.enum(['candidate', 'agent_inferred']).optional().default('candidate'),
});

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const body = postSchema.parse(await request.json());
    assertQuestionAllowedInAnswerBank(body.question);
    const saved = await upsertScreeningAnswerBankEntry(
      actor.id,
      body,
      undefined,
      body.provenance ?? 'candidate'
    );
    return { answer: saved };
  });
}

const putSchema = z.object({
  id: z.string().uuid().optional(),
  question: z.string().trim().max(3000).optional(),
  answer: z.string().trim().min(1).optional(),
  provenance: z.enum(['candidate', 'agent_inferred']).optional(),
  confirm: z.boolean().optional(),
});

export async function PUT(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const body = putSchema.parse(await request.json());

    if (body.confirm && body.id) {
      const confirmed = await confirmScreeningAnswerBankEntry(actor.id, body.id);
      return { answer: confirmed };
    }

    if (!body.question || !body.answer) {
      throw new CaptureError('question and answer are required to update an entry.', 400);
    }
    assertQuestionAllowedInAnswerBank(body.question);
    const saved = await upsertScreeningAnswerBankEntry(
      actor.id,
      {
        question: body.question,
        answer: body.answer,
      },
      undefined,
      body.provenance ?? 'candidate'
    );
    return { answer: saved };
  });
}

export async function DELETE(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const url = new URL(request.url);

    let id = url.searchParams.get('id') ?? undefined;
    let topic = url.searchParams.get('topic') ?? undefined;

    if (!id && !topic) {
      try {
        const body = await request.json();
        if (body.id) id = String(body.id);
        if (body.topic) topic = String(body.topic);
        if (!topic && body.question) topic = normalizeAnswerBankTopic(String(body.question));
      } catch {
        // empty body ok
      }
    }

    if (!id && !topic) {
      throw new CaptureError('Answer ID or topic is required.', 400);
    }

    const deleted = await deleteScreeningAnswerBankEntry(actor.id, { id, topic });
    return { deleted };
  });
}
