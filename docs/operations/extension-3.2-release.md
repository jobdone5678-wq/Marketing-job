# Recruiting Copilot 3.2 — implementation and release handoff

Owned by Nextkinlife LLC. Prepared 2026-10-21 on `codex/extension-screening-completion`. Existing unrelated checkout changes were retained. No production migration, deployment, employer application submission, commit or push was performed.

## Implemented

- Candidate/JD/session-bound screening reviews; late responses and changed questions/options are rejected. Accepting a draft preserves intervening manual edits.
- Text/select/radio receipts, persistent original undo values across repeated fills, checked-group restoration and controlled-input readback checks.
- Durable `application_answers` tasks with the existing `structuredAI` provider accounting, daily allowance, worker lease/retry controls and actor-scoped read-only polling. Connected ownership/recruiter assignment and candidate fact freshness are checked before processing and result access.
- Strict source-fact selections. Unknown evidence, invented IDs, duplicate questions, unsupported option values and fabricated prose cannot become automatic answers. Draft previews show supporting source text; edits are recruiter-authored and require acceptance.
- Connected and uploaded source handling. Uploaded candidates are reparsed from supplied source text, remain task-owner scoped, and do not create a portal candidate record.
- Semantic field discovery/mapping/writing, open shadow-root discovery, host hints for Greenhouse/Lever/Ashby/Workday, manual fallbacks and verified writes. New adapter flow requires recruiter action or a portal Apply launch.
- Existing contextual AI resumes, separate ATS coverage, per-job history, exact reviewed attachment and six capture states retained. No fixed ten-job limit was introduced.

## Verified evidence

The final full repository suite passed all 481 tests with zero failures/skips, including the review regressions, responsive adapter fixtures and 25-job DOCX test. TypeScript passed after the production build completed; scoped ESLint and git diff --check passed. Next.js production build compiled and generated all pages; the existing middleware deprecation warning remains.

Local AI preflight now succeeds at `http://127.0.0.1:31415`. `node --conditions=react-server scripts/verify-extension-screening.mjs` exercised the real configured provider through `structuredAI` using synthetic facts and in-memory accounting only: one provider reservation, supported skills returned, unsupported Kubernetes duration left unanswered. This is live model-output validation, not production database/queue deployment validation. The normal production handler uses real accounting and leases. Ordinary tests do not run this live probe.

The migration passed in isolated PGlite tests: new kind, actor isolation, candidate ownership revocation, uploaded task access, budget exhaustion and expired lease checks. Browser fixtures cover current manual edits, stale responses, radio undo, controlled input rejection, duplicate labels, protected reference/emergency fields, delayed combobox options, reversible resets and disabled reset rejection. The installed MV3 smoke test exercises the real extension and DOCX path with a simulated authenticated provider boundary.

## Support matrix

| Flow | Evidence / behavior |
| --- | --- |
| Greenhouse, Lever, Ashby, Workday basic labeled fields | Shared adapter + platform hints; contract fixtures at 1440, 768 and 390 pixels |
| Standard inputs/selects/radio groups | Verified writes and undo fixtures; manually populated values preserved |
| Custom combobox | Exact options with accessible associated listbox and usable reset; other widgets need manual entry |
| Duplicate labels / repeated work and education | Flagged for recruiter review; record order and dates are not guessed |
| Open shadow roots | Discovery covered by fixtures |
| Closed roots / embedded application frames | Manual fallback; no new frame permissions |
| Unknown candidate or JD | Actionable input requirement; no invented profile/JD |
| Contextual resume generation | Existing grounded AI path, evidence panel and separate ATS coverage; 25 distinct jobs round-trip genuine DOCX |
| Arbitrary live portal variants | Best effort; not individually certified |
| Jobright exact parity | Not established: installed onboarding/profile gate and collapse behavior observed; active Jobright generation remains unobserved |

## Paired deployment

1. Review/apply `supabase/migrations/20261021000100_extension_answer_tasks.sql` to the target database with the normal migration process. It extends the task-kind constraint and access function; no existing data is deleted.
2. Deploy the matching portal and worker code. Configure the existing server-side AI service and daily allowance. Local gateway validation does not establish a publicly deployed service; production requires the configured HTTPS endpoint, or the appropriate separately configured worker.
3. Install `browser-extension-v3.2.0.zip` unpacked and reload existing job tabs. The `/api/extension/ai-answers` alias accepts the current consent/context contract; older clients need this paired update rather than continuing the former direct provider path.
4. In an authorized test account, verify a connected candidate and an uploaded source: job-specific resume, grounded screening review, manual edit preservation, undo, attachment and capture. Do not test by submitting an employer application.

## Scope rulings

The screening contract uses `version:2` and the existing flat job field names, `candidateId` or an uploaded `{id,source_text}` object, `sessionId`, `consent:true`, `requestId` and unique questions. This reuses the resume upload/auth boundaries. Evidence validation and orchestration live in `evidence.ts` and `service.ts` rather than duplicating repositories/authentication modules. Legacy requests missing consent or actual job context fail explicitly; the old unmetered SDK path was removed.

Source wording is preserved in AI text drafts. Free-form rewriting, invented motivation, autonomous submission and proprietary Jobright algorithm replication are outside this release. Manual fallbacks are deliberate where the available data/control semantics cannot establish a trustworthy answer or reversible write.


Release artifact: `browser-extension-v3.2.0.zip` (25 files, 615960 bytes), SHA256 `1BCF6D6CB52174AFD5BC372329E3C41581E41690481F776FC148B2596ABD877B`. All archived files were byte-compared against current source. The matching unpacked `browser-extension-v3.2.0` folder is ready for Load unpacked. Independent final review reported no remaining important issues in the reviewed changes.
