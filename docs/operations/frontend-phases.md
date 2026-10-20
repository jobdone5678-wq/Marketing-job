# Recruiting operations frontend phases

Approved scope: the 2026-10-19 audit and phased frontend plan. Keep APIs, database behavior, authentication/OAuth, AI scoring, application capture, extension communication, and data contracts unchanged.

## Decisions

- Use the existing blue action color, Geist product font already present in the working tree, Lucide icons, Base UI primitives, and Tailwind 4. No new UI dependencies.
- Density 8, motion 2, variance 2. Tables and separated rows are the operational default.
- Preserve the dirty working tree. Reconcile existing changes rather than reset them or create a checkout that omits them.
- New overview routes compose existing authorized reads. No invented tenant switcher, subscription balance, analytics metric, eligibility decision, or match score.
- Existing candidate list API is paginated without server search. Label page-scoped filtering honestly.
- Resume provenance dependency: the existing applied-resume endpoint can reconstruct a fallback. Without a recorded snapshot the frontend must not claim exact applied-file identity or call that fallback endpoint as proof of provenance.
- Existing matching contracts do not independently score every requested compatibility dimension. Display candidate facts and explicit Unknown / Not evaluated states where necessary.
- SaaS subscription billing has no discovered contract. Provide a clearly unavailable billing screen and links to existing operational finance; no fake checkout.

## Phase ledger

| Phase | Scope | Status |
|---|---|---|
| 0 | Audit baseline and contracts | Audit completed; authenticated visual validation pending access |
| 1 | Shared shell, navigation, tokens, states | Implemented; existing role permissions retained |
| 2 | Recruiter dashboard and activity | Implemented; saved counts and accessible chart data |
| 3 | Candidate roster and persistent profile | Implemented; responsive table, profile tabs, original files and genuine exports |
| 4 | Job list and detail | Implemented; responsive rows, collapsed source tools, contextual application actions |
| 5 | Evidence-led shortlisting | Implemented; evidence/constraints retained, compatibility context explicitly not scored |
| 6 | Candidate/JD resume workspace | Implemented; existing consent/review/version workflow and role restrictions |
| 7 | Application states, evidence history, exact-document presentation | Implemented; Cancel is non-mutating; missing recorded files remain unavailable |
| 8 | Analytics from existing saved records | Implemented; definitions, record links and chart-data table |
| 9 | Integration health and existing connection workflows | Implemented; configuration distinguished from actual connectivity |
| 10 | Settings, admin and honest billing availability | Frontend implemented; SaaS subscription service remains unavailable |

## Verification

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed separately from the build.
- Production: `node node_modules/next/dist/bin/next build --webpack` passed.
- Complete suite: `node --experimental-strip-types --test --test-concurrency=2 tests/*.test.mjs` passed: 428 tests, 0 failures, 0 skipped.
- Scoped ESLint: dashboard routes, components and candidate resume export passed with 0 errors and 2 existing warnings (email-confirmation effect cleanup and logout navigation).
- Export checks inspected real downloaded DOCX and PDF file signatures. Browser regressions cover role restrictions, evidence states, filters, retries, missing applied snapshots and non-mutating cancellation.
- Taste-Skill visual evaluation: `node inspect.mjs http://127.0.0.1:4173/dashboard/candidates --app` passed with 0 FAILs, verifying sentence-case labels, readable typography, flat operational cards, and responsive table transformations across desktop (1440px), tablet (768px), and mobile (390px).
- `git diff --check` passed. The isolated visual preview was stopped after validation.

No deployment, live authentication flow, API migration or backend contract change was performed for these frontend phases. Live authenticated visual verification remains pending. The legacy applied-resume reconstruction endpoint needs a separate backend correction before it can establish exact applied-file provenance; this frontend avoids using its fallback as evidence. Subscription billing and independently evaluated compatibility dimensions remain explicitly unavailable where existing contracts do not supply them.

## Frontend route inventory

- `/dashboard`: role-aware overview and operational summaries.
- `/dashboard/candidates`: page-scoped search, bench/review filters, responsive roster.
- `/dashboard/candidates/[id]`: persistent profile, employment/education, source evidence, documents and profile exports.
- `/dashboard/jobs` and provider routes: saved/live discovery, filters and source management.
- `/dashboard/jobs/[id]`: readable JD, candidate context, existing comparison and application actions.
- `/dashboard/job-matching`: existing reviewed-JD shortlisting and requirement evidence.
- `/dashboard/resumes`: candidate/job pairing, existing version history, consent, review and DOCX workflow. Technical recruiters receive candidate-document guidance without unsupported tailoring controls.
- `/dashboard/submissions`: recruiting stages and capture states remain independent; exact-file downloads require archived snapshot bytes.
- `/dashboard/application-capture`: recorded event evidence and accessible recruiter attestation dialog using the unchanged event API.
- `/dashboard/analytics`: existing dashboard/operations counts; no invented conversion rate.
- `/dashboard/integrations`: existing mailbox, credential and AI configuration reads, with links to management workflows.
- `/dashboard/settings`, `/dashboard/team`, `/dashboard/billing`: organized settings and existing administration; explicit unavailable subscription integration.
- Existing create/edit forms, email confirmations, vendors and operational finance retain their workflows and use the shared visual system.

## Review and visual checks

An independent read-only reviewer found three Important issues, all corrected: unsupported technical-recruiter tailoring controls, a misleading non-draft application total, and provenance labels overstating independent verification. The reviewer rechecked all three corrections and found no remaining Important issues in them.

The local authenticated portal requires sign-in, so visual checks used actual components in an isolated server with synthetic records. This is component/layout validation, not proof of production account configuration or an end-to-end live application. The preview server rejects writes and never forwards requests to live services.

Checked desktop roster/profile, submission tracker, capture evidence, job discovery/detail, resume pairing, analytics, integrations and settings; dark-mode roster and mobile tracker/profile; mobile document width stayed within 390px. Existing automated layout checks cover mobile/tablet/desktop and dark mode. Full WCAG certification has not been claimed.

Screenshots are in `C:/Users/bharg/.codex/visualizations/2026/10/19/01a1527f-3a84-7db2-ae91-3cb6ac7a9cb4/`, numbered 03–15. All contain synthetic data.

To reproduce isolated visual validation: `node scripts/preview-frontend-phases.mjs`, then open `http://127.0.0.1:4173/dashboard/candidates`. Stop the process after review.
