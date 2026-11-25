# Supabase Background Workers

Background work runs on **Supabase PostgreSQL (`pg_net` + `pg_cron`) + Next.js Route Handlers**, with `scripts/workers/worker.ts` as an optional durable polling runner for local/long-running tasks. Do **not** introduce Redis, BullMQ, or Go worker binaries.

## Architecture (`supabase/migrations/20261120150500_supabase_background_workers.sql`)

1. **Enqueue**: Application code inserts a row into `public.background_tasks` with `status = 'queued'` and a `kind` (`resume_extract`, `application_answers`, `candidate_match`, `packet_generate`, etc.).
2. **Instant Webhook Dispatch (`pg_net`)**:
   - Trigger `trg_background_task_webhook` executes `public.dispatch_background_task_webhook()`.
   - Reads destination URL and bearer secret from `app_private.worker_settings` (isolated from `anon`/`authenticated`).
   - Sends `net.http_post` to `/api/webhooks/process-task` with `{ table: 'background_tasks', record: { id, kind } }`.
   - Non-fatal `EXCEPTION WHEN OTHERS` block ensures task enqueue never fails if the webhook temporarily errors.
3. **Execution (`src/app/api/webhooks/process-task/route.ts`)**:
   - Authenticates via constant-time `timingSafeEqual` against `WEBHOOK_SECRET`, `SUPABASE_WEBHOOK_SECRET`, or `EMAIL_SYNC_SECRET`.
   - Claims the task with a lease token and dispatches to `handleTask` in `src/lib/tasks/handlers.ts`.
   - Note: Vercel deployments without server AI credentials leave AI task kinds (`application_answers`, `candidate_match`, `packet_generate`, `resume_tailor`) for a configured durable worker (`npm run worker`).
4. **Stalled Lease Recovery (`pg_cron`)**:
   - `public.cron_recover_stuck_background_tasks()` fails tasks whose lease expired at max attempts (`3`) and re-queues/re-dispatches tasks stuck in `queued` for > 3 minutes.

## Conventions

- Keep task handlers idempotent and lease-guarded: pass `task.id` and `task.lease_token` into DB RPCs when saving outputs.
- Wrap AI task handlers in `withAIExecutionWindow` (`src/lib/ai/execution-window.ts`) so hung upstream LLM sockets release leases cleanly.
- Never expose `app_private.worker_settings` or webhook secrets to client roles.
