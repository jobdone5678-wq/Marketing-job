# Repository Requirements Reference

Core rules and architecture boundaries for this Next.js + TypeScript + Supabase workspace.

## Working principles

- **Confirmed truth before autofill**: Never auto-publish inferred resume facts or unconfirmed screening/demographic answers as confirmed candidate truth. `validateGroundedAnswer` in `src/lib/ai/grounded.ts` is the hard gate for factual fields.
- **Zero silent BYOK fallback**: When a user configures `portal_byok`, `extension_byok`, or `local` AI mode and credentials fail or are missing, fail explicitly (`401`/`400`/`502`). Never silently fall back to server keys.
- **Supabase-first infrastructure**:
  - Use **Supabase PostgreSQL** (+ `pgvector` for semantic embeddings) as the single database.
  - Use **Supabase `pg_net` + `pg_cron` + `background_tasks`** (and `/api/webhooks/process-task` / `scripts/workers/worker.ts`) for async work — do not add separate Redis/BullMQ/Go daemons.
  - Use **Supabase Realtime** (`postgres_changes` / Realtime channels) for all WebSocket live updates — do not build custom WebSocket servers.
- **Keep scope tight**: Focus on candidate profile/resume management, AI-assisted ATS form autofill, answer bank learning, and idempotent applied-job saving/tracking. Avoid reviving legacy multi-candidate recruiter/agency or public job-board crawler workflows unless explicitly requested.
- **Immutable migrations**: Never edit an applied file in `supabase/migrations/`. Always create a new timestamped `.sql` migration.

## What this is

A candidate-centric job application platform composed of:
1. **Next.js 16 + React 19 + TypeScript Web App (`src/`)**:
   - Candidate profile, resume upload/parsing, Experience Bank, Screening Answer Bank, and AI Provider Settings (`/dashboard/candidates`).
   - Saved & Applied Jobs tracker with live Supabase Realtime updates (`/dashboard/submissions`, `/dashboard/outside-jobs`).
   - Backend Route Handlers (`src/app/api/`) serving both the web app and the browser extension.
2. **Supabase Backend (`supabase/`)**:
   - Auth (`auth.users`), Row-Level Security (RLS), Storage (`resumes`, `photos`), PostgreSQL tables, `pgvector` semantic search (planned/target for Answer Bank & experience matching), `pg_net` + `pg_cron` async task dispatch, and Realtime publications.
3. **Browser Extension (`extension/` + `design-system/`)**:
   - Reads live ATS application forms, executes deterministic + AI-planned fills and verified combobox selections, captures submitted applications, and syncs them back to Next.js/Supabase.

## Layout

```text
src/
  app/
    api/
      extension/        Extension auth/pairing, autofill/plan, autofill/choose,
                        generate-answer, answer-bank, ai/settings, auto-submit, events
      jobseeker/        Candidate profile & resume persistence
      resumes/          Upload, parse, process, download
      submissions/      Applied job records, answer snapshots, applied resumes
      outside-jobs/     Externally captured applied jobs
      v1/me/            Canonical candidate profile, experience, answer-bank, screening APIs
      webhooks/         process-task (pg_net worker), application-submitted
    auth/               OAuth/callback/confirmation routes
    dashboard/          candidates/, submissions/, outside-jobs/ (plus legacy routes)
  components/           React + Tailwind v4 + @base-ui/react UI
  hooks/                use-application-realtime.ts, use-user-profile.ts, etc.
  lib/
    ai/                 Autofill orchestrator, planner, chooser, grounded validator,
                        Vercel AI SDK client, AES-GCM encryption, SSRF guard
    auth/               require-profile, candidate-ownership, oauth-registration
    candidate/          experience.ts, answerbank.ts, resumeextract.ts
    capture/            Snapshot validation, applied-resume, CORS/extension auth helpers
    db/                 admin.ts (service role), timing.ts
    extension-answers/  Saved answers & candidate context assembly
    identity/           userprofile.ts (slugs, countries, derived location)
    ingest/             screeninganswers.ts (typed screening schema & validation)
    jobs/               applications.ts, application-state.ts, normalize.ts, skills-extractor.ts
    profile/            profile-store.ts, resume-parser.ts, countries.ts
    resumes/            upload, extraction, job-match, repository
    tasks/              handlers.ts (resume_extract, application_answers, etc.)
    v1/                 auth.ts (Bearer/extension_credentials/cookie resolution)
supabase/
  migrations/           Ordered PostgreSQL migrations (schema, RLS, pg_net/pg_cron, Realtime)
scripts/
  workers/              worker.ts (durable polling fallback)
  testing/              E2E, DB verification, migration runners
tests/                  Node --test unit/contract suites (*.test.mjs) and Playwright E2E
extension/              WXT + Svelte 5 browser extension (see extension/AGENTS.md)
design-system/          Svelte 5 tokens & primitives for extension/ (see design-system/AGENTS.md)
docs/
  architecture.md       End-to-end system flows
  agents/               Focused operational guides (workers, realtime, pgvector)
  freehire-reference/   Archived upstream Go/SvelteKit docs (logic reference only)
  superpowers/          Design specs and implementation plans
```

## Commands

Run from `Marketing-job-main/` (the Next.js root):

- **Dev server**: `npm run dev` (or `npm run dev:webpack`)
- **Typecheck**: `npm run typecheck` (`tsc --noEmit --incremental false`)
- **Lint**: `npm run lint` (`eslint`)
- **Format**: `npm run format`
- **Unit & contract tests**: `npm test` (`node --experimental-strip-types --test --test-concurrency=1 tests/*.test.mjs`)
- **Build**: `npm run build` (`next build --webpack`)
- **Worker (local durable polling)**: `npm run worker`
- **E2E tests**: `npm run test:e2e`

Run from `extension/` and `design-system/` (pnpm-managed):

- `pnpm check` (`svelte-check`), `pnpm lint` (`oxlint && eslint`), `pnpm test` (`vitest run`), `pnpm build`

## Conventions

- **Auth & caller ownership**:
  - Web dashboard APIs must use `protectedRoute` (`src/lib/http/protected-route.ts`) or `requireProfile()` (`src/lib/auth/require-profile.ts`) plus `requireSameOrigin` for mutations.
  - Extension APIs must authenticate via `extensionRoute` / `extensionProfile` (`src/lib/capture/server.ts`) or `resolveV1UserId` (`src/lib/v1/auth.ts`), hashing bearer tokens against `public.extension_credentials` (`sha256`, checking `revoked_at` and `expires_at`) or validating Supabase JWTs.
  - Always verify candidate ownership (`assertCandidateAccess` / `owner_id = auth.uid()`) before reading or writing candidate facts, AI secrets, or submissions.
- **AI provider & security**:
  - Supported modes: `server` | `portal_byok` | `extension_byok` | `local`.
  - Encrypt `portal_byok` keys using AES-GCM with AAD bound to `userId:origin` (`src/lib/ai/encryption.ts`).
  - Route all custom/BYOK upstream fetches through `createSafeAgent` + `createSsrfSafeFetch` (`src/lib/ai/ssrf-guard.ts`, `ssrf-fetch-adapter.ts`) to block private/loopback/metadata IPs.
  - Keep `SERVER_ENABLE_VERCEL_AI_SDK` parity between `ServerVercelProviderClient` and legacy `ProviderClient`, and reject empty reasoning-model responses instead of returning blank answers.
- **Database & RLS**:
  - User-facing tables must enforce RLS (`auth.uid() = user_id` or `owner_id`).
  - Keep secrets and worker webhook credentials in `app_private` (revoked from `anon`/`authenticated`).
  - Every SQL function with `SECURITY DEFINER` must set an explicit `SET search_path = public, ...`.
- **Applied job deduplication**:
  - Canonicalize posting URLs (`applicationUrlKey`) and compute stable idempotency keys (`computeIdempotencyKey`) before inserting into `job_submissions` / `outside_jobs` so replays and query-param variants never create duplicate applied jobs.
