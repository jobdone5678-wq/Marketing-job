## Current-stack tasks

Authenticated contacts and resume routes exist. The imported parse-retry behavior, full seed composition, and every pending-state rule require parity verification.

### Verification

- [ ] Verify clear, re-upload, delete, status visibility, and authorized retry independently.
- [ ] Verify edits to project metadata and CV seed behavior during a pending parse.

Implementation references include [candidate-owned contacts API](../../../src/app/api/v1/me/contacts/route.ts), [resume status and upload](../../../src/app/api/v1/me/resume/route.ts), [extract and identity composition](../../../src/lib/candidate/resumeextract.ts), [profile editing](../../../src/components/candidate-profile-workspace.tsx), [durable parse work](../../../docs/agents/workers.md).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## 1. Candidate contacts storage and API

- **Completed upstream** — 1.1 Migration: persist candidate contacts (name, email, phone, location, links) per user; backfill from current/provisional structure where empty
- **Completed upstream** — 1.2 Store + sqlc: read/write contacts; résumé delete does not clear them
- **Completed upstream** — 1.3 HTTP: GET/PUT contacts (or fold into `/me/resume` read + dedicated PUT); validate/sanitize like CV header
- **Completed upstream** — 1.4 On successful `SetStructured`, fill-empty into candidate contacts; optional replace-from-CV endpoint or flag
- **Completed upstream** — 1.5 Unit/integration tests for fill-empty, no overwrite, delete résumé keeps contacts

## 2. Parse status and retry

- **Completed upstream** — 2.1 Persist last extract status for the current upload stamp (current/pending/failed + safe reason)
- **Completed upstream** — 2.2 Record failed/skipped outcomes from `extractStructuredResume` (PII/LLM unset, extract error)
- **Completed upstream** — 2.3 Expose status on `GET /me/resume`; add retry-parse endpoint that re-runs extract for stored CV bytes
- **Completed upstream** — 2.4 gen-contracts + handler tests

## 3. Seed / tailor composition

- **Completed upstream** — 3.1 `bankedSeeder` / seed composition: contacts from owned; body summary/skills/edu/langs/certs/projects from current structure or last blob when pending; bank experience/projects as today
- **Completed upstream** — 3.2 Stale-base refresh: keep header-only heal when pending; ensure full seed when current still works; never blank owned header via empty seed
- **Completed upstream** — 3.3 Tests: pending blob seeds summary/skills/projects onto new base; heal preserves summary; bank project still maps to `projects[]`

## 4. Web Profile and Experience

- **Completed upstream** — 4.1 Profile: editable contacts form; show parse status + retry; stop implying links are only from parse
- **Completed upstream** — 4.2 Experience: create/edit project employment (name, link, dates) via existing APIs
- **Completed upstream** — 4.3 Client API helpers + light UI tests if the suite already covers similar forms

## 5. Verification

- **Completed upstream** — 5.1 `go test` / `go vet -tags=integration ./...` for touched packages; manual Profile edit + tailor open with pending stamp

</details>
