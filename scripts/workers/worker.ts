import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import * as nextEnvModule from '@next/env';

const require = createRequire(import.meta.url);

// Stub server-only for standalone worker execution outside Next bundler
try {
  const p = require.resolve('server-only');
  require.cache[p] = { id: p, filename: p, loaded: true, exports: {} } as any;
} catch {}

try {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
} catch {}

const loadEnv = (nextEnvModule as any).loadEnvConfig || (nextEnvModule as any).default?.loadEnvConfig;
if (typeof loadEnv === 'function') loadEnv(process.cwd());

async function main() {
  if (process.argv.includes('--check-ai')) {
    const { requireAIConfiguration } = await import('../../src/lib/ai/config');
    const { checkAITransport } = await import('../../src/lib/ai/transport-diagnostics');
    let local: Record<string, string> = {};
    try { local = dotenv.parse(readFileSync(path.resolve(process.cwd(), '.env.local'))); } catch {}
    const result = await checkAITransport(requireAIConfiguration(), local);
    console.log('[Worker] AI connection check:', JSON.stringify(result));
    if (result.localDifferences.length) console.log('[Worker] Inherited settings override .env.local for the listed variable names.');
    if (!result.ok) process.exitCode = 1;
    return;
  }

  const { database, checkDb, CaptureError } = await import('../../src/lib/db/admin');
  const { handleTask } = await import('../../src/lib/tasks/handlers');
  const db = database();
  let stop = false;
  process.on('SIGTERM', () => { stop = true; });
  process.on('SIGINT', () => { stop = true; });
  let scheduled = Date.now();

  console.log('[Worker] Recruiting worker started. Polling task queue...');

  while (!stop) {
    try {
      if (Date.now() - scheduled > 60000) {
        scheduled = Date.now();
        const { data: settings } = await db.from('workspace_settings').select('source_sync_minutes').eq('id', true).maybeSingle();
        if (settings) {
          const threshold = new Date(Date.now() - (settings?.source_sync_minutes || 30) * 60000).toISOString();
          const { data: sources } = await db.from('job_sources').select('id,created_by').eq('enabled', true).or('last_checked_at.is.null,last_checked_at.lt.' + threshold);
          for (const source of sources || []) {
            const { error } = await db.rpc('enqueue_source_sync', { p_actor: source.created_by, p_source: source.id });
            if (error && !error.message?.includes('Source access denied')) console.error('A source could not be scheduled:', error.message);
          }
        }
      }

      const { data: claimed, error } = await db.rpc('claim_task', { p_lease: randomUUID() });
      if (error) console.warn('[Worker] claim_task warning:', error.message);
      const task = claimed?.[0];
      if (!task?.id) {
        if (process.argv.includes('--once')) {
          console.log('[Worker] No tasks found (--once). Exiting.');
          break;
        }
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      console.log(`[Worker] Claimed task ${task.id} (${task.kind})`);
      let heartbeatFailed = false;
      const heartbeat = setInterval(() => {
        void db.rpc('heartbeat_task', { p_task: task.id, p_lease: task.lease_token }).then(({ error }) => {
          if (error) heartbeatFailed = true;
        });
      }, 30000);

      try {
        const result = await handleTask(task);
        if (heartbeatFailed) throw new CaptureError('Worker lost its task lease.', 409);
        const { error: finishError } = await db.rpc('finish_task', {
          p_task: task.id,
          p_lease: task.lease_token,
          p_result: result,
          p_error: null,
          p_transient: false
        });
        checkDb(finishError);
        console.log(`[Worker] Task ${task.kind} completed successfully.`);
      } catch (err: any) {
        const msg = err instanceof CaptureError ? err.message : (err instanceof Error ? err.message : 'Processing failed.');
        const transient = err instanceof CaptureError && err.status === 502;
        await db.rpc('record_task_failure', { p_task: task.id, p_lease: task.lease_token, p_error: msg });
        const { error: finishError } = await db.rpc('finish_task', {
          p_task: task.id,
          p_lease: task.lease_token,
          p_result: null,
          p_error: msg,
          p_transient: transient
        });
        if (finishError) console.error('Lease lost; task will be recovered.');
        else console.error(`[Worker] Task ${task.kind} failed:`, msg);
      } finally {
        clearInterval(heartbeat);
      }

      if (process.argv.includes('--once')) break;
    } catch (loopError) {
      console.error('[Worker] Loop error:', loopError);
      if (process.argv.includes('--once')) { process.exitCode = 1; break; }
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main().catch(err => {
  console.error('[Worker] Startup failed:', err);
  process.exitCode = 1;
});
