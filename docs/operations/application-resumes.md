# Application-specific resumes — 2026-10-19

## Behavior

The portal and extension now show evidence-based ATS estimates for each candidate/JD. The extension generates actual DOCX files in connected and standalone modes. It orders supplied skills and experience evidence for the JD without inventing employers, metrics, education, skills or eligibility. Uploaded source history is retained in the generated document when a structured history is unavailable.

Each saved extension version includes the exact JD, job title/company/URL, candidate facts/version and engine version. Identical sources reuse a version; changing a source creates another. There is no fixed job-count cap. Standalone documents and archived uploaded-candidate identities are stored on the device. Connected versions are private snapshots in `application_resume_versions`, accessed through the authenticated extension route with current candidate authorization.

Missing or incomplete candidate details, title, company or JD stop generation with an actionable message. Login pages and broad page text are not treated as JDs. Users can paste the actual JD when the page cannot provide it. A job change, changed source, or late response cannot reuse an old tailored attachment. Only extension-owned attachments are cleared; user-selected replacement files are preserved. Attaching a tailored draft requires factual review.

ATS percentages measure weighted extracted requirements (required 2, preferred 1), with explicit evidence and unsupported qualifications. Negative mentions are not positive skills. Reports assess generated content, not claims elsewhere in a profile. Editing portal content marks the old report outdated. Formatting checks describe the generated document. This is a local estimate, not access to an employer's ATS or a guarantee of outcomes.

## Deployment and installation

1. Apply `supabase/migrations/20261019000100_application_resume_versions.sql` to the same Supabase project as the portal. It creates a service-only, RLS-enabled table and history index; it does not alter candidate or job records. Existing JD-tailoring migrations are still prerequisites for the portal's worker flow.
2. Deploy the updated portal and restart the existing recruiting worker with this code. Until the new migration is applied, connected generation fails with an explicit save/history service error. No live migration or deployment was performed by this change.
3. Run `node scripts/package-extension.mjs` to build and verify `browser-extension-v3.0.0.zip`. Extract the archive and load its `manifest.json` folder as an unpacked extension in Chrome/Edge, then reload job tabs. The `unlimitedStorage` permission removes Chrome's ordinary local quota; actual device capacity still applies.

The server routes use the existing Supabase service configuration. Standalone generation, PDF/DOCX parsing and history are local. No new AI provider or external parsing service is required. The portal's existing AI prioritization continues using its configured worker.

## Research boundary

The design was informed by public first-party documentation, not inspection of competitors' private code or signed-in application behavior:

- [Jobright resume matcher](https://jobright.ai/tools/resume-job-matcher): candidate/JD comparison, experience and keyword gaps.
- [Simplify resume tailoring](https://help.simplify.jobs/articles/0515607-auto-tailoring-your-resume-with-copilot): profile-based tailoring and multiple reviewed versions.
- [Teal application tracking](https://help.tealhq.com/en/articles/14435727-how-to-track-your-job-applications): saving the JD and associating resume versions with applications.
- [Huntr resume tailoring](https://huntr.co/product/resume-tailor): requirements, responsibilities and qualifications alongside keyword matching.

Our deterministic evidence rules, identity keys and attachment safeguards are implementation choices. Universal compatibility with every live third-party form has not been established. Verification uses synthetic candidates and representative browser fixtures; it does not submit applications or send real candidate data to an AI provider.

## Verification

Regression coverage includes more than ten distinct job versions, exact-source reuse, changed JDs and candidate facts, archived uploaded candidates, access denial, missing inputs, genuine DOCX extraction, negative skill mentions, mixed unknown qualifications, ATS evidence omitted from generated content, manual JD entry, SPA navigation, delayed responses, review-gated attachment, popup history downloads, and mobile/desktop panel visibility.

Local PDF.js assets are copied unchanged from the installed `pdfjs-dist`, with its license. Tests cover compressed PDFs, cross-origin local workers and DOCX data descriptors. Scanned PDFs have no OCR; DOCX extraction reads the main body, and unusual PDF encodings can require pasted text.

### Recorded release checks

- Production build (`node node_modules/next/dist/bin/next build --webpack`) passed. Separate TypeScript validation (`node node_modules/typescript/bin/tsc --noEmit`) passed.
- The full regression command (`node --experimental-strip-types --test --test-concurrency=1 tests/*.test.mjs`) finished with **407 passed, 1 failed**. The remaining failure is `invalid listed records and missing Greenhouse totals prevent closure` in `tests/job-ingestion.test.mjs`: it expects `partial` but receives `complete`. Both this test and `src/lib/jobs/normalize.ts` match their starting-commit hashes; the failure is outside this resume change.
- The additional missing-company regression and all seven earlier extension browser flows passed together after the final company-detection guard. This last guard refuses to substitute a board/domain name for the hiring company.
- The actual unpacked Manifest V3 extension passed in full Chromium: local PDF import, genuine DOCX generation, reviewed attachment and popup history. Engine/storage tests cover 25 different applications and archived candidate histories.
- Focused ESLint passed with no errors and two existing background-script unused-variable warnings. Repository-wide lint still reports existing errors outside this change, including explicit `any` types in `src/lib/ai/client.ts`, `scripts/worker.ts`, existing extension answer/file routes and the candidate dashboard. The repository-wide lint run is not green.
- `git diff --check` passed. All 14 runtime files in `browser-extension-v3.0.0.zip` were compared byte-for-byte with the final source and matched.

The test harness needed normal filesystem access for esbuild to resolve installed React packages through workspace parent directories. Browser forms and resume fixtures are synthetic; no live applications were submitted.
