import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: docs } = await db.from('candidate_documents').select('*').order('created_at', { ascending: false }).limit(1);
  if (!docs || !docs.length) return;
  const taskId = '5f5f81c1-a33d-4bd5-8dd1-35b1362a632c';
  const { data: task } = await db.from('background_tasks').select('*').eq('id', taskId).single();
  console.log('Task:', task);

  const lease = '00000000-0000-0000-0000-000000000002';
  await db.from('background_tasks').update({ status: 'running', lease_token: lease, lease_until: new Date(Date.now() + 180000).toISOString() }).eq('id', taskId);
  task.lease_token = lease;

  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  try {
    const s = req.resolve('server-only');
    req.cache[s] = { id: s, filename: s, loaded: true, exports: {} };
  } catch {}

  const { handleTask } = await import('../src/lib/tasks/handlers');
  try {
    const res = await handleTask(task);
    console.log('handleTask SUCCESS:', res);
  } catch (err: any) {
    console.error('handleTask FAILED:', err.name, err.message, err.stack);
  }
}

run().catch(console.error);
