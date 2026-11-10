# JD matching and tailored resumes implementation plan

**Goal:** Candidates and assigned recruiters can generate, review and download a job-specific DOCX; super admins can upload/paste a JD, review criteria and match existing reviewed bench candidates.

**Architecture:** Next.js protected routes, Supabase private records and the existing durable task queue. Two new task handlers extract JD requirements and prioritize reviewed resume facts. Shared evidence validation matches a reviewed JD against all active reviewed candidates locally. No Dreamwork account or external job application is required.

**Constraints:** Preserve original resumes; no invented candidate facts; explicit AI-processing consent; authorization checked when enqueueing, processing, reviewing and downloading; versioned source data, optimistic edits, lease-checked saves, idempotent requests. Do not perform live AI calls using actual candidate data during verification.

## Tasks

- [x] Add tested factual tailoring/selection and a valid OOXML DOCX exporter using existing fflate. Retain all reviewed employment/education; AI selects and orders existing facts instead of inventing claims.
- [x] Add one migration for private JD briefs, generated resumes, edit history, queue kinds, task access and atomic enqueue/save/review functions. Test transactions, role isolation, stale source versions and duplicate requests with PGlite.
- [x] Add authenticated generation/list/review/DOCX routes and admin JD upload/review/match routes. Reuse PDF/DOCX validation, candidateAccess, provider usage quotas, lease checks and background handlers.
- [x] Add a reusable task-status UI, tailored-resume editor on job detail, admin JD workspace in dashboard and full JD page. Expose evidence, unknowns, source versions, shortlist/assignment actions and downloads clearly.
- [x] Verify synthetic AI workflow tests, route/access tests, real DOCX extraction, browser UI flows, edited-file lint, typecheck and production build. Apply the tested migration if the signed-in Supabase session remains available; do not deploy or send applications.

## Execution ledger

- Approved scope: implement both workflows using existing configured AI. Dreamwork is optional future work, not a prerequisite.
- Ruling: tailoring AI chooses reviewed source fact IDs; generated professional claims stay verbatim/factual. Users can edit and must confirm accuracy before DOCX download.
- Ruling: admin matching is calculated from current reviewed database facts after JD criteria review; no AI request per candidate or dashboard render. Matching uses the existing conservative evidence validator and displays unknowns separately.
- Ruling: generated DOCX bytes are produced from authorized saved content on demand, rather than exposing provider download URLs. Original uploaded JD files use a private storage bucket.
- Review fixes: private-JD resumes require Super Admin for listing, detail, review and download; duplicate requests read existing task bindings without rewriting worker-owned rows; live job content updates advance source versions; candidate switching hides unrelated version history.
- Verification on 2026-10-16: 67 targeted regression tests passed, including real browser flows, PostgreSQL-compatible transaction checks, synthetic AI handlers, task claims/access and DOCX extraction. Edited-file ESLint, production build, subsequent TypeScript check and diff whitespace check passed. Existing middleware deprecation/build cache notices remain.
- Database activation on 2026-10-16: applied migration through the signed-in SQL editor to project `yzworkrtgbcrsewjsfsg` (Marketing-Job-application). All six read-only verification checks passed. Proof: `docs/operations/screenshots/jd-tailoring-schema-verified.png`.
- Deployment boundary: website and separate worker code have not been deployed by this task. Deploy/restart both with the updated code before production use; live AI calls using real candidate data were not performed.
