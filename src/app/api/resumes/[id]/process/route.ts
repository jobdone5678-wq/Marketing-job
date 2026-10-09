import { protectedRoute } from '@/lib/http/protected-route';
import { ownDocument } from '@/lib/resumes/repository';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { randomUUID } from 'node:crypto';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return protectedRoute(request, 'candidate_or_staff', async p => {
    const { id } = await context.params;
    const document = await ownDocument(p, id);
    if (!document.task_id) throw new CaptureError('Upload registration was incomplete. Upload again.', 409);
    const db = database();

    // Check task state
    const { data: currentTask } = await db.from('background_tasks').select('*').eq('id', document.task_id).maybeSingle();

    if (currentTask?.status === 'failed') {
      const { error } = await db.rpc('retry_task', { p_actor: p.id, p_task: document.task_id });
      checkDb(error);
    }

    // Immediate processing
    try {
      const lease = randomUUID();
      let task: any = null;
      const { data: specificClaimed } = await db.rpc('claim_specific_task', { p_task: document.task_id, p_lease: lease });
      if (specificClaimed?.[0]) {
        task = specificClaimed[0];
      } else {
        const { data: directLeased } = await db.from('background_tasks')
          .update({
            status: 'running',
            lease_token: lease,
            lease_until: new Date(Date.now() + 180000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', document.task_id)
          .select('*')
          .maybeSingle();
        if (directLeased) task = directLeased;
      }

      if (task) {
        const { handleTask } = await import('@/lib/tasks/handlers');
        const result = await handleTask(task);
        await db.rpc('finish_task', {
          p_task: task.id,
          p_lease: task.lease_token,
          p_result: result,
          p_error: null,
          p_transient: false
        });
      }
    } catch (e: any) {
      console.warn('Immediate retry extraction fallback to webhook/queue:', e?.message);
    }

    return { taskId: document.task_id };
  });
}