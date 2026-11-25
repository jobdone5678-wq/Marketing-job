# Supabase PostgreSQL & Migrations (`supabase/`)

All persistent state, authentication (`auth.users`), file storage (`resumes`, `photos`), background job scheduling (`pg_net`, `pg_cron`), semantic search (`pgvector` target), and Realtime WebSockets live in Supabase.

## Rules

- **Never edit applied migrations**: Every change to tables, columns, constraints, indexes, triggers, or RLS policies must be a new timestamped file in `supabase/migrations/`.
- **RLS everywhere**: Every public table holding candidate profiles, experience atoms, answer bank entries, AI provider configs/secrets, or applied jobs must enforce RLS (`auth.uid() = user_id` or `owner_id`).
- **Isolate secrets & worker config**: Internal tables (such as `app_private.worker_settings`) live in `app_private` with permissions revoked from `PUBLIC`, `anon`, and `authenticated`.
- **`SECURITY DEFINER` safety**: Always set an explicit `SET search_path = public, pg_temp` (or `public, app_private, net, pg_temp`) on `SECURITY DEFINER` functions and triggers.
- **Realtime publication**: When adding or altering tables subscribed by dashboard hooks (`job_submissions`, `outside_jobs`), verify both `ALTER PUBLICATION supabase_realtime ADD TABLE ...` and `SELECT` RLS policies.

## Key Tables for Candidate Autofill & Applied Jobs

- **Candidate truth & profile**: `candidates`, `profiles`, `user_profiles`, `experience_employments`, `experience_evidence_atoms`, `screening_answers`, `candidate_answer_bank`, `screening_answer_bank`
- **AI provider config (BYOK)**: `user_ai_provider_configs`, `user_ai_provider_secrets`
- **Extension auth & pairing**: `extension_credentials`, extension pairing tables
- **Applied jobs saving**: `job_submissions`, `outside_jobs`, `application_intents`, `application_events`, `job_submission_applied_resumes`
- **Async worker queue**: `background_tasks` (dispatched via `trg_background_task_webhook` -> `pg_net`)
