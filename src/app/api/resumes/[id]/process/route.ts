import { protectedRoute } from '@/lib/http/protected-route';
import { ownDocument } from '@/lib/resumes/repository';
import { database, checkDb, CaptureError } from '@/lib/db/admin';


export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return protectedRoute(request, 'candidate_or_staff', async p => {
    const { id } = await context.params;
    const document = await ownDocument(p, id);
    if (!document.task_id) throw new CaptureError('Upload registration was incomplete. Upload again.', 409);
    const db = database();

    // Check task state
    const { data: currentTask, error: taskError } = await db.from('background_tasks').select('id,status').eq('id', document.task_id).maybeSingle();
    checkDb(taskError);
    if (!currentTask) throw new CaptureError('Processing task is unavailable. Upload again.', 409);

    if (currentTask?.status === 'failed') {
      const { error } = await db.rpc('retry_task', { p_actor: p.id, p_task: document.task_id });
      checkDb(error);
    }

    return { taskId: document.task_id, status: currentTask.status === 'failed' ? 'queued' : currentTask.status };
  });
}
