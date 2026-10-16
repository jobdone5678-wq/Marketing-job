import { NextResponse } from 'next/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { handleTask } from '@/lib/tasks/handlers';
import { aiConfiguration } from '@/lib/ai/config';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { BackgroundTask } from '@/lib/tasks/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const expectedSecret = [process.env.WEBHOOK_SECRET, process.env.SUPABASE_WEBHOOK_SECRET, process.env.EMAIL_SYNC_SECRET]
    .map(value => value?.trim()).find(Boolean);
  if (!expectedSecret) return NextResponse.json({ error: 'Task webhook is not configured.' }, { status: 503 });
  const header = request.headers.get('authorization') || request.headers.get('x-webhook-secret');
  const supplied = header?.replace(/^Bearer\s+/i, '') || '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(expectedSecret))) {
    return NextResponse.json({ error: 'Unauthorized webhook.' }, { status: 401 });
  }

  let targetTaskId: unknown;
  try {
    const body = await request.json();
    if (body?.table && !['background_tasks', 'candidate_documents'].includes(body.table)) throw new Error();
    targetTaskId = body?.record?.task_id || body?.record?.id || body?.taskId || body?.id;
  } catch {
    return NextResponse.json({ error: 'Provide a valid task identifier.' }, { status: 400 });
  }
  if (typeof targetTaskId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetTaskId)) {
    return NextResponse.json({ error: 'Provide a valid task identifier.' }, { status: 400 });
  }

  try {
    const db = database();
    const { data: target, error: targetError } = await db.from('background_tasks').select('id,kind').eq('id', targetTaskId).maybeSingle();
    checkDb(targetError);
    if (!target) return NextResponse.json({ success: true, taskId: targetTaskId, status: 'not_claimed' });
    // A Vercel deployment without AI credentials must leave AI work for the configured durable worker.
    if (['resume_extract', 'candidate_match', 'packet_generate', 'jd_extract', 'resume_tailor'].includes(target.kind) && !aiConfiguration().configured) {
      return NextResponse.json({ success: true, taskId: targetTaskId, status: 'deferred_to_worker' });
    }
    const { data: claimed, error: claimError } = await db.rpc('claim_specific_task', { p_task: targetTaskId, p_lease: randomUUID() });
    checkDb(claimError);
    const task = claimed?.[0] as BackgroundTask | undefined;
    // A duplicate notification must never steal a live lease or execute unrelated work.
    if (!task) return NextResponse.json({ success: true, taskId: targetTaskId, status: 'not_claimed' });

    let result: Awaited<ReturnType<typeof handleTask>>;
    try {
      result = await handleTask(task);
    } catch (error) {
      const message = 'Task processing failed. Check server configuration and retry.';
      const { error: failureError } = await db.rpc('record_task_failure', {
        p_task: task.id, p_lease: task.lease_token, p_error: message,
      });
      checkDb(failureError);
      const { error: finishError } = await db.rpc('finish_task', {
        p_task: task.id, p_lease: task.lease_token, p_result: null, p_error: message,
        p_transient: error instanceof CaptureError && error.status === 502,
      });
      checkDb(finishError);
      return NextResponse.json({ error: message, taskId: task.id }, { status: 422 });
    }
    const { error: finishError } = await db.rpc('finish_task', {
      p_task: task.id, p_lease: task.lease_token, p_result: result, p_error: null, p_transient: false,
    });
    checkDb(finishError);
    return NextResponse.json({ success: true, taskId: task.id, kind: task.kind });
  } catch {
    return NextResponse.json({ error: 'Task could not be finalized. The queue will recover unfinished work.' }, { status: 500 });
  }
}
