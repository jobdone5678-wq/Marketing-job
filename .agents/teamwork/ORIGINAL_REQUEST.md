# Original User Request

## Initial Request — 2026-11-09T02:28:37Z

Assign the tasks to sub agents to complete end to end strongly. Fix, integrate, and verify the JobRight browser extension (`jobright_extension/`) and the Next.js marketing portal so that imports are intact, autofill functions reliably, job applications submitted inside the portal or outside via DOM capture are persisted to the database, and all submissions appear in real time on the job submissions page.

Integrity mode: development

## Requirements

### R1. Extension Import Integrity and Cleanup
Check and verify that all imports in `src/` and extension files resolve correctly to `jobright_extension/` (including `jobright_extension/resume-engine.js`). Do not remove necessary imports in `src/`; ensure all stale references to the deleted `browser-extension` directory are cleanly updated to point to `jobright_extension/`.

### R2. Job Form Autofill and External Job DOM Capture
Ensure autofill operates reliably on job application forms. When a candidate applies to a job outside the portal using the extension, capture the job details from the page DOM and store them in the database (`public.outside_jobs` and automatically record them into `public.job_submissions` via extension backend endpoints `/api/extension/save-external-job` and `/api/extension/auto-submit`).

### R3. Real-Time Job Submissions Page Display
Ensure that all applied jobs—whether submitted inside the portal or outside via DOM capture through the extension—appear immediately in real time on the Job Submissions dashboard (`src/app/dashboard/submissions/page.tsx`) via Supabase Realtime without requiring manual page refresh.

### R4. Automated Verification, Extension Packaging, and Clean Build
Create local mock job application test pages and automated test scripts within the repository to verify autofill and DOM capture end-to-end. Package the extension zip using `scripts/package-extension.mjs`, and verify that the Next.js production build (`npm run build`) succeeds cleanly without build or type errors.

## Acceptance Criteria

### Codebase & Imports
- [ ] All references to the deleted `browser-extension` in `src/` and extension code are resolved to `jobright_extension/`.
- [ ] No needed imports in `src/` are removed.
- [ ] `npm run build` completes with zero errors.

### Autofill & DOM Capture
- [ ] Autofill reliably populates applicant profile details into job application form fields.
- [ ] When applying on an external career site, the extension extracts job details via DOM and saves the record in `public.outside_jobs`.
- [ ] Job applications submitted via extension auto-submit are stored in `public.job_submissions`.
- [ ] External DOM-captured applications are automatically recorded into `public.job_submissions` so both types share the unified submissions record.

### Real-Time Submissions Dashboard
- [ ] The Job Submissions page (`/dashboard/submissions`) displays applications submitted from inside the portal as well as external jobs captured via DOM.
- [ ] Newly submitted applications appear in real time on the submissions dashboard via Supabase Realtime (`job_submissions_realtime_feed`) without manual page reload.

### Packaging & Automated Testing
- [ ] Extension zip is generated cleanly via `node scripts/package-extension.mjs`.
- [ ] Local mock test pages and automated test scripts exist in the repository and pass, verifying autofill execution and DOM capture to database end-to-end.

---

## Agent Coordination Details
- **Your Identity**: `teamwork_orchestrator`
- **Your Working Directory**: `.agents/teamwork/orchestrator/`
- **Authoritative Request File**: `.agents/teamwork/ORIGINAL_REQUEST.md`
- **Workspace Directory**: `c:\Users\bharg\OneDrive\Desktop\marketing portal`
- **Sentinel ID**: 338684db-a992-4feb-b706-711b639da28b
