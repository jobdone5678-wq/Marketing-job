# BRIEFING — 2026-11-09T02:46:00Z

## Mission
Conduct a thorough, read-only survey of job form autofill, external job DOM capture, backend endpoints (/api/extension/save-external-job, /api/extension/auto-submit), and database tables (public.outside_jobs, public.job_submissions).

## 🔒 My Identity
- Archetype: explorer
- Roles: survey, analysis, synthesis
- Working directory: c:\Users\bharg\OneDrive\Desktop\marketing portal\.agents\teamwork\teamwork_explorer_survey_2
- Original parent: a2dc0c5b-ca3a-482b-bd17-f484e172f706
- Milestone: survey-autofill-dom-capture

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Inspect jobright_extension/ autofill, DOM capture, backend API endpoints, and database schemas
- Deliver handoff.md following 5-component protocol

## Current Parent
- Conversation ID: a2dc0c5b-ca3a-482b-bd17-f484e172f706
- Updated: 2026-11-09T02:46:00Z

## Investigation State
- **Explored paths**:
  - `jobright_extension/outside-job-engine.js`, `form-discovery.js`, `field-mapping.js`, `field-writer.js`, `fill-session.js`, `candidate-context.js`, `job-context.js`, `manifest.json`, `scraping-rules.json`, `adapters/` (greenhouse, lever, ashby, workday, generic), `static/background/index.js`
  - `src/app/api/extension/save-external-job/route.ts`, `src/app/api/extension/auto-submit/route.ts`, `src/lib/capture/server.ts`, `src/lib/capture/applied-resume.ts`
  - `src/app/dashboard/submissions/page.tsx`, `src/app/dashboard/outside-jobs/page.tsx`, `src/app/api/submissions/route.ts`, `src/app/api/outside-jobs/route.ts`, `src/lib/submission-store.ts`
  - `supabase/migrations/` migrations (20261006, 20261019, 20261104, 20261106), remote Supabase DB `yzworkrtgbcrsewjsfsg` via `supabase_mcp`
  - `tests/test-outside-jobs-persistence.test.mjs`, `tests/extension-fill-session.test.mjs`, `tests/extension-form-adapters.test.mjs`
- **Key findings**:
  - Universal form autofill uses React Fiber value tracker bypass, 5-layer ARIA context extraction, phone monitoring/highlighting, and multi-step pagination state machine.
  - DOM capture uses JSON-LD, heuristic selectors, and 35+ ATS rules in `scraping-rules.json`.
  - Service worker origin mismatch (`localhost:3000` vs `https://www.nextkinhr.com`) and token mismatch (`storage.token` vs `storage.nextkin_auth_token`).
  - Strict auth in `save-external-job` lacks fallback actor; `auto-submit` has resilient fallback.
  - Remote DB is missing `applied_resume` column on `public.job_submissions`.
  - Local repo is missing `20261105021852_create_outside_jobs_table.sql` in `supabase/migrations/`.
  - Supabase Realtime publication `supabase_realtime` has both tables with `REPLICA IDENTITY FULL`.
- **Unexplored areas**: None for survey scope. Investigation complete.

## Key Decisions Made
- Completed deep inspection of all 4 survey areas.
- Synthesized full 5-component report with Feature Inventory in `handoff.md`.

## Artifact Index
- DISPATCH.md — Received dispatch message log
- progress.md — Liveness heartbeat and milestone tracker
- BRIEFING.md — Situational awareness
- handoff.md — Comprehensive Survey 2 report
