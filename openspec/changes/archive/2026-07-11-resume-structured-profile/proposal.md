## Why

Archived reference. The Next.js `/api/v1/me/resume` handler currently performs deterministic local extraction, and the app has a durable resume-task path. The archived background LLM extraction is a parity requirement for that workflow.

## What Changes

- Keep files in Supabase Storage and stamp the structured PostgreSQL data with the exact upload it describes. Validate and sanitize output in TypeScript and enforce the ownership check at read time.
- For the archived best-effort workflow, use a leased resume extraction task. A stale or failed result must leave upload, matching, and other deterministic readers usable. Resume bytes and text stay out of logs.
- Expose the typed read model to the React profile and a narrow projection to matching, retaining the specification’s stale-data and privacy rules.

Behavior requirements are in [job fit analysis](specs/job-fit-analysis/spec.md), [resume structured profile](specs/resume-structured-profile/spec.md).

Implementation references include [current resume API](../../../../src/app/api/v1/me/resume/route.ts), [typed structured resume](../../../../src/lib/candidate/resumeextract.ts), [resume task execution](../../../../src/lib/tasks/handlers.ts), [background dispatch](../../../../docs/agents/workers.md), [profile UI](../../../../src/components/candidate-profile-workspace.tsx), [match surface](../../../../src/app/api/extension/resume-match/route.ts).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## Why

Today a signed-in user's uploaded résumé is opaque: the raw file lives in S3 and its plain text is re-parsed on the fly for every fit analysis, but the user never sees what the system understood from it, and the fit chain works from an unstructured text blob. Deriving a structured view of the résumé once — the candidate's experience, education, contacts, languages, and a normalized skill/seniority summary — makes the profile transparent (the user can verify what was parsed) and gives the fit analysis cleaner, pre-normalized signal instead of raw text alone.

This complements, and does not replace, the existing deterministic `cv-autofill` (dictionary skills/seniority/categories for onboarding) and `resume-skill-extraction` (skilltag slugs). Those stay instant and LLM-free; this adds a richer, LLM-derived structured profile.

## What Changes

- On résumé upload, in addition to the existing embedding, run a **best-effort LLM extraction** that produces a **typed, sanitized structured résumé** (contact basics, professional summary, work-experience entries with title/company/dates, education, languages, links, and a total-years estimate) and persist it (one JSONB per user) stamped with the producing model.
- The structured résumé is **read-only**: it is re-derived on every re-upload (single source of truth) and cleared on résumé delete. No per-field editing in this change.
- Surface the structured résumé on the résumé/profile read surface so the SPA can render parsed sections in the profile.
- **Feed the structured résumé into the fit-analysis chain** as an additional, pre-normalized input alongside the existing CV text (never a replacement — a missing/failed extraction degrades to today's text-only behavior).
- Best-effort throughout: an unconfigured or failing LLM leaves upload, embedding, and the deterministic extractors untouched, and the profile simply shows no structured section.
- Generate the wire shape to TypeScript via `cmd/gen-contracts`, mirroring `jobfit.Analysis`.

## Capabilities

### New Capabilities
- `resume-structured-profile`: LLM-derived, typed, sanitized structured résumé — extracted best-effort on upload, persisted read-only per user (model-stamped, re-derived on re-upload, cleared on delete), and served on the résumé read surface for the profile UI.

### Modified Capabilities
- `job-fit-analysis`: the fit prompt-chain additionally consumes the caller's stored structured résumé when present, as pre-normalized context beside the existing CV text; absence degrades to the current text-only analysis with no error.

(The résumé lifecycle coupling — re-derive on re-upload, clear on delete — is owned by the new `resume-structured-profile` capability itself; `resume-storage`'s own file/pointer requirements are unchanged.)

## Impact

- **Backend:** `internal/resume` (structured extraction + storage side effect), a new LLM extraction path over the shared `internal/llm` client with `Sanitize`/bounds discipline (mirroring `enrich`/`jobfit`), `internal/jobfit` input wiring, `internal/handler` résumé read surface, `cmd/gen-contracts` contract.
- **DB:** a migration adding a structured-résumé column + model stamp to `users` (nullable; NULL when unconfigured/unextracted).
- **Frontend:** the profile/résumé page renders the structured sections (read-only) under `web/`.
- **Ops:** the new migration must be applied to prod manually before deploy (per the migrations gotcha); no new required env — extraction reuses the existing `LLM_*` config and is skipped when absent.

</details>
