import { NextResponse } from 'next/server';
import { database, checkDb } from '@/lib/db/admin';
import { handleTask } from '@/lib/tasks/handlers';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  // Optional security check: verify secret token in header if configured
  const authHeader = request.headers.get('authorization') || request.headers.get('x-webhook-secret');
  const expectedSecret = process.env.WEBHOOK_SECRET || process.env.SUPABASE_WEBHOOK_SECRET || process.env.EMAIL_SYNC_SECRET;
  
  if (expectedSecret && authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized webhook' }, { status: 401 });
    }
  }

  // Parse Supabase Database Webhook or direct caller payload
  let targetTaskId: string | null = null;
  try {
    const body = await request.json();
    if (body?.record?.id && (body?.table === 'background_tasks' || !body?.table)) {
      targetTaskId = body.record.id;
    } else if (body?.record?.task_id) {
      targetTaskId = body.record.task_id;
    } else if (body?.taskId) {
      targetTaskId = body.taskId;
    } else if (body?.id) {
      targetTaskId = body.id;
    }
  } catch {
    // Non-JSON or empty body is permitted (e.g. cron triggers)
  }

  const db = database();
  const lease = randomUUID();
  
  try {
    let task: any = null;

    // 1. If a specific task ID was targeted by Supabase Webhook, claim it directly
    if (targetTaskId) {
      const { data: specificClaimed } = await db.rpc('claim_specific_task', { p_task: targetTaskId, p_lease: lease });
      if (specificClaimed?.[0]) {
        task = specificClaimed[0];
      } else {
        // Direct lease fallback on the specific task
        const { data: directLeased } = await db.from('background_tasks')
          .update({
            status: 'running',
            lease_token: lease,
            lease_until: new Date(Date.now() + 180000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', targetTaskId)
          .in('status', ['queued', 'running'])
          .select('*')
          .maybeSingle();
        if (directLeased) task = directLeased;
      }
    }

    // 2. If no specific task or already claimed, fallback to next queued task
    if (!task) {
      const { data: claimed, error: claimErr } = await db.rpc('claim_task', { p_lease: lease });
      if (claimErr) {
        return NextResponse.json({ error: claimErr.message }, { status: 500 });
      }
      task = claimed?.[0];
    }

    if (!task) {
      return NextResponse.json({ message: 'No queued tasks found' }, { status: 200 });
    }

    console.log(`[Webhook] Processing task ${task.id} (${task.kind})`);
    
    try {
      const result = await handleTask(task);
      const { error: finishError } = await db.rpc('finish_task', {
        p_task: task.id,
        p_lease: task.lease_token,
        p_result: result,
        p_error: null,
        p_transient: false,
      });
      checkDb(finishError);

      return NextResponse.json({
        success: true,
        taskId: task.id,
        kind: task.kind,
        message: 'Task processed successfully',
      });
    } catch (taskError: any) {
      const message = taskError?.message || 'Task processing failed';
      console.error(`[Webhook] Task failed:`, message);
      await db.rpc('record_task_failure', {
        p_task: task.id,
        p_lease: task.lease_token,
        p_error: message,
      });
      await db.rpc('finish_task', {
        p_task: task.id,
        p_lease: task.lease_token,
        p_result: null,
        p_error: message,
        p_transient: false,
      });
      return NextResponse.json({ error: message, taskId: task.id }, { status: 422 });
    }
  } catch (err: any) {
    console.error(`[Webhook] Internal error:`, err);
    return NextResponse.json({ error: err.message || 'Webhook internal error' }, { status: 500 });
  }
}
