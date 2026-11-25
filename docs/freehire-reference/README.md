# Freehire Reference Documentation (Curated & Ordered)

This directory holds only the reference specifications and domain contracts needed to connect [extension/](../../extension/wxt.config.ts) to our Next.js 16 + Supabase + Vercel AI SDK backend without changing either stack.

Go-monolith-only docs (Fiber/sqlc/Meilisearch/cron workers/VictoriaLogs/blog measurements) and thin `AGENTS.md` pointer stubs were removed.

## Directory Structure

### `01-api-and-auth/` — API Contracts & Auth Flow
- [`API.md`](01-api-and-auth/API.md) — Public & Bearer `/api/v1/*` endpoint contracts and `{ data, meta }` / `{ error }` envelope conventions.
- [`API.internal.md`](01-api-and-auth/API.internal.md) — Internal extension, auth connect, autofill, tracking, CV, and assistant endpoints.
- [`http-handlers.md`](01-api-and-auth/http-handlers.md) — Route behaviors, error mapping, and HTTP 402 plan-refusal shape (`PlanRefused`).
- [`auth-conventions.md`](01-api-and-auth/auth-conventions.md) — Token/key hashing and Bearer vs. cookie authentication rules.
- [`oauth-signin.md`](01-api-and-auth/oauth-signin.md) — OAuth / `launchWebAuthFlow` sign-in redirect contract (`extension/lib/auth.ts`).

### `02-extension-and-autofill/` — Extension Form Plan, Autofill & Answer Bank
- [`extension-apply-plan-spec.md`](02-extension-and-autofill/extension-apply-plan-spec.md) — Side panel apply-plan checklist and progress counter design.
- [`browser-tools-wire.md`](02-extension-and-autofill/browser-tools-wire.md) — Browser-tool JSON wire (`read_page`, `read_form`, `fill_simple`, `combobox.*`) and frame/form scoping rules.
- [`screening-answers.md`](02-extension-and-autofill/screening-answers.md) — Typed screening facts (`authorized_countries`, sponsorship, salary, notice period, relocation, age 18+) backed by `src/app/api/v1/me/screening-answers/route.ts`.
- [`screening-answer-bank-spec.md`](02-extension-and-autofill/screening-answer-bank-spec.md) — Design for reusable candidate-approved Q&A bank.
- [`screening-answer-bank-plan.md`](02-extension-and-autofill/screening-answer-bank-plan.md) — Implementation plan for the answer bank.
- [`answer-bank-service.md`](02-extension-and-autofill/answer-bank-service.md) — Provenance (`candidate` vs. `agent_inferred`) and topic upsert rules (`src/lib/candidate/answerbank.ts`).
- [`answer-topic-normalization.md`](02-extension-and-autofill/answer-topic-normalization.md) — Question folding and canonical topic stem dictionary.
- [`apply-form-capture.md`](02-extension-and-autofill/apply-form-capture.md) — ATS application form question capture conventions.
- [`application-evidence-spec.md`](02-extension-and-autofill/application-evidence-spec.md) — Candidate-controlled application evidence and answer snapshots.

### `03-jobs-matching-and-tracking/` — Job Lookup, Matching & Application Tracking
- [`job-wire-shape.md`](03-jobs-matching-and-tracking/job-wire-shape.md) — Canonical `FreehireJob` wire projection expected by `extension/lib/freehire.ts`.
- [`ats-board-recognition.md`](03-jobs-matching-and-tracking/ats-board-recognition.md) — Pure URL → ATS board recognition (`meta.ats_board` for `/api/v1/jobs/find`).
- [`link-source-resolve.md`](03-jobs-matching-and-tracking/link-source-resolve.md) — Resolving outbound job URLs (`POST /api/v1/jobs/resolve`).
- [`job-application-url-spec.md`](03-jobs-matching-and-tracking/job-application-url-spec.md) — Canonical `application_url` vs. source posting URL rules.
- [`job-application-url-plan.md`](03-jobs-matching-and-tracking/job-application-url-plan.md) — Implementation plan for `application_url`.
- [`cv-job-match.md`](03-jobs-matching-and-tracking/cv-job-match.md) — Deterministic skill-coverage matching (`JobMatch` / `src/lib/resumes/job-match.ts`).
- [`fit-analysis.md`](03-jobs-matching-and-tracking/fit-analysis.md) — Cached fit-analysis read contract (`/jobs/:slug/match-analysis`).
- [`match-analysis.md`](03-jobs-matching-and-tracking/match-analysis.md) — AI fit-analysis prompt-chain output shape.
- [`requirements-extraction.md`](03-jobs-matching-and-tracking/requirements-extraction.md) — Deterministic extraction of job requirements from descriptions.
- [`user-job-tracking.md`](03-jobs-matching-and-tracking/user-job-tracking.md) — `save` / `unsave` / `apply` / `tracking/saved` contract.

### `04-candidate-profile-and-cv/` — Profile, Resume & Experience Bank
- [`resume-identity.md`](04-candidate-profile-and-cv/resume-identity.md) — Stored CV, contact overrides, and `profiles` storage pointers (`src/app/api/v1/me/resume/route.ts`).
- [`resume-extract.md`](04-candidate-profile-and-cv/resume-extract.md) — Structured CV extraction (`src/lib/candidate/resumeextract.ts`).
- [`experience-bank.md`](04-candidate-profile-and-cv/experience-bank.md) — Employments & evidence atoms (`src/lib/candidate/experience.ts`).

### `05-assistant/` — Side Panel Chat & SSE Streaming (Phase 3)
- [`assistant-core.md`](05-assistant/assistant-core.md) — Session/transcript model and bounded turn loop (`extension/lib/assistant/`).
- [`assistant-tools.md`](05-assistant/assistant-tools.md) — Tool definitions and `TurnEvent` SSE semantics.
- [`assistant-http-surface.md`](05-assistant/assistant-http-surface.md) — Assistant HTTP endpoints (`/api/v1/assistant/sessions*`).
