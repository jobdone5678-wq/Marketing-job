# JD matching and tailored resume operations

The website and the separate recruiting worker must run the updated code. This feature uses the existing configured AI provider and usage budgets; Dreamwork is not required.

## Deployment

On 2026-10-16 the migration was applied to Marketing-Job-application (`yzworkrtgbcrsewjsfsg`) through its signed-in SQL editor. All six read-only checks passed. The website deployment and separate worker update remain required.

1. Apply `supabase/migrations/20261016000100_jd_tailored_resumes.sql` once to the same Supabase project as the website and worker. It adds private workflow tables, a private file bucket, queue kinds and lease-checked functions. No candidate or job records are deleted.
2. Run `supabase/verify-jd-tailored-resumes.sql`. All six checks must return `true`.
3. Deploy the updated website to Vercel and restart the separate worker with this code. The worker needs its own existing Supabase and AI environment configuration; Vercel variables do not configure a separately hosted worker.

## Candidate and recruiter flow

Open Public Jobs, choose an existing saved job or use **Review & tailor resume** on a live job, then open **Tailored resume & DOCX**. Select an authorized reviewed candidate, consent to AI processing, generate, edit, confirm factual accuracy, and save the reviewed version before downloading DOCX. The original uploaded resume stays unchanged. Technical recruiters retain their referral role and cannot generate these documents.

AI selects and prioritizes existing reviewed professional fact IDs. It cannot add unsupported skills, employers or dates. The draft preserves reviewed employment and education history. Manual edits still require factual confirmation. Candidate or JD changes invalidate an older version and require regeneration.

## Super Admin flow

Open **JD Candidate Matching** in the sidebar or **JD matching** on the Super Admin dashboard. Paste a JD or upload a readable PDF/DOCX, consent to processing, review extracted terms and exact source evidence, set required/preferred priorities, and save. **Find matching candidates** compares all active reviewed database candidates, then shows paged results, supporting evidence, unknowns, shortlist actions and recruiter assignment. **Tailor resume for this JD** uses the selected candidate. Private JD documents and their tailored versions are accessible only to Super Admin.

Matching runs locally against reviewed facts after the JD extraction request. It does not send a separate AI request per candidate. Coverage measures supported evidence; unknowns and explicit constraint conflicts remain visible and are not a hiring guarantee. Quantitative or specialized claims without exact evidence require review.

## Recovery and verification

Queued work shows bounded status polling, worker waiting information and a check-status action. Failed tasks retry through the existing authorized task endpoint. Repeated Generate/Upload requests reuse the existing task; source changes create a new version. A missing migration returns an actionable service error rather than exposing raw database details.

Verification uses synthetic candidate/JD fixtures, PostgreSQL-compatible transaction tests, access checks, worker-handler tests, real DOCX extraction, browser flows, lint, typecheck and the production build. It does not submit job applications or send real candidate information to an AI provider.
