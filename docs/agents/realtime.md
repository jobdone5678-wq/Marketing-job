# Supabase Realtime (WebSockets)

All WebSocket / live-push behavior in this workspace uses **Supabase Realtime** (`postgres_changes`). Do **not** add custom WebSocket servers, Socket.IO, or an extension-to-backend WebSocket relay.

## Published Tables

Ensure tables subscribed by the dashboard are included in the `supabase_realtime` publication (see `supabase/migrations/20261106000100_realtime_submissions_and_access.sql`, `20261117155052_fix_application_realtime_rls.sql`, and `20261118155756_enable_outside_job_realtime_reads.sql`):
- `public.job_submissions`
- `public.outside_jobs`

Realtime delivery enforces PostgreSQL **RLS `SELECT` policies** for the authenticated browser client (`createClient()` in `src/lib/client.ts`). If RLS denies `SELECT` for `auth.uid()`, Postgres changes will silently not be broadcast to that client.

## Frontend Hooks

- **`src/hooks/use-application-realtime.ts`** (`useApplicationRealtime`):
  - Subscribes to `postgres_changes` (`event: '*'`) on `job_submissions` and `outside_jobs` (optionally filtered by `candidate_id=eq.${candidateId}`).
  - Debounces refreshes (`50 ms`), listens for same-origin extension `window.postMessage` events (`NEXTKIN_OUTSIDE_APPLICATION_SAVED`, `NEXTKIN_APPLICATION_SUBMITTED`), and re-syncs on `focus` / `visibilitychange` to recover from background-tab socket sleep.
  - Schedules a recovery refresh on `TIMED_OUT` or `CHANNEL_ERROR`.
- **`src/app/dashboard/outside-jobs/_hooks/use-outside-jobs-realtime.ts`**:
  - Dedicated Realtime listener for the Outside Jobs view.

## Conventions

- Always create unique channel names per mount (e.g., `` `application-updates-${crypto.randomUUID()}` ``) and clean up with `supabase.removeChannel(channel)` on unmount.
- Always pair Realtime with visibility/focus resync so dropped mobile or sleeping-tab WebSockets self-heal.
