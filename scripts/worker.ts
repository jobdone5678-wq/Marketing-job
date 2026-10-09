import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Stub server-only so standalone worker can load Next.js server modules outside bundler
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as any;
} catch {
  // Ignore if not resolvable
}

import { randomUUID } from 'node:crypto';
import * as nextEnvModule from '@next/env';

const loadEnv = (nextEnvModule as any).loadEnvConfig || (nextEnvModule as any).default?.loadEnvConfig;
if (typeof loadEnv === 'function') {
  loadEnv(process.cwd());
}

async function main() {
  const { database, checkDb, CaptureError } = await import('../src/lib/db/admin');
  const { handleTask } = await import('../src/lib/tasks/handlers');
  const db = database();
  let stop = false;
  process.on('SIGTERM', () => { stop = true; });
  process.on('SIGINT', () => { stop = true; });
  let scheduled = 0;

  console.log('[Worker] Recruiting worker started. Polling task queue...');

  while (!stop) {
    try {
      if (Date.now() - scheduled > 60000) {
        scheduled = Date.now();
        const { data: settings, error: s } = await db.from('workspace_settings').select('source_sync_minutes').eq('id', true).maybeSingle();
        if (s) {
          console.warn('[Worker] workspace_settings lookup warning:', s.message);
        } else if (settings) {
          const threshold = new Date(Date.now() - (settings?.source_sync_minutes || 30) * 60000).toISOString();
          const { data: sources, error: e } = await db.from('job_sources').select('id,created_by').eq('enabled', true).or('last_checked_at.is.null,last_checked_at.lt.' + threshold);
          if (e) {
            console.warn('[Worker] job_sources lookup warning:', e.message);
          } else {
            for (const source of sources || []) {
              const { error } = await db.rpc('enqueue_source_sync', { p_actor: source.created_by, p_source: source.id });
              if (error) console.error('A source could not be scheduled:', error.message);
            }
          }
        }
      }

      const { data: claimed, error } = await db.rpc('claim_task', { p_lease: randomUUID() });
      if (error) {
        console.warn('[Worker] claim_task warning:', error.message);
      }
      const task = claimed?.[0];
      if (!task?.id) {
        if (process.argv.includes('--once')) {
          console.log('[Worker] No tasks found (--once). Exiting.');
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
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
      } catch (error) {
        const message = error instanceof CaptureError ? error.message : (error instanceof Error ? error.message : 'Processing failed. Check configuration and retry.');
        const transient = error instanceof CaptureError && error.status === 502;
        await db.rpc('record_task_failure', { p_task: task.id, p_lease: task.lease_token, p_error: message });
        const { error: finishError } = await db.rpc('finish_task', {
          p_task: task.id,
          p_lease: task.lease_token,
          p_result: null,
          p_error: message,
          p_transient: transient
        });
        if (finishError) console.error('Lease lost; the task will be recovered by the queue.');
        else console.error(`[Worker] Task ${task.kind} failed:`, message);
      } finally {
        clearInterval(heartbeat);
      }

      if (process.argv.includes('--once')) break;
    } catch (loopError) {
      console.error('[Worker] Loop error:', loopError);
      if (process.argv.includes('--once')) {
        process.exitCode = 1;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

main().catch((err) => {
  console.error('[Worker] Startup failed:', err);
  process.exitCode = 1;
});