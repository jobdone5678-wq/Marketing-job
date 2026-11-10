# Survey Explorer 1 Report: Imports, Build, & File Structure

> **Summary:** The Next.js production build (`npm run build`) and TypeScript typecheck (`tsc --noEmit`) complete cleanly with zero errors; all 8 `src/` imports correctly resolve to `jobright_extension/resume-engine.js` with no stale `browser-extension` imports remaining in `src/`. However, 26 test files under `tests/` and `eslint.config.mjs` contain 48 stale references to the deleted `browser-extension/` directory, and `jobright_extension/` requires the restoration/co-location of `content.js`, `background.js`, and `resume-engine.d.ts` to satisfy extension tests.

---

## 1. Observation

### A. Build & Compilation Verification
- **Command:** `npm run build` (`next build --webpack`)
  - **Result:** Exit code 0.
  - **Duration:** 21.9 seconds compilation, 4.4 seconds page generation.
  - **Pages Generated:** 87 of 87 static/dynamic routes compiled successfully without any build errors.
- **Command:** `npx tsc --noEmit`
  - **Result:** Exit code 0. Zero TypeScript diagnostic errors.
- **Command:** `node scripts/package-extension.mjs`
  - **Result:** Exit code 0.
  - **Output:** `Packaged 45 files, 3790540 bytes: .../jobright_extension.zip`
  - **Verified Manifest:** Version `3.2.1`, required runtime assets (`outside-job-engine.js`, `form-discovery.js`, `field-mapping.js`, `field-writer.js`, `embedded-support.js`, `frame-agent.js`) verified in zip.

### B. Verification of `src/` Extension Imports
Exact search across all files in `src/` for `browser-extension` returned **0 matches**.
Search for `jobright_extension` in `src/` revealed exactly 8 files, all cleanly importing `resume-engine.js`:
1. `src/app/api/extension/tailor-upload/route.ts:5`
   `import {candidateFromText} from '../../../../../jobright_extension/resume-engine.js';`
2. `src/lib/candidate-resume-export.ts:22`
   `const {resumeDocx}=await import('../../jobright_extension/resume-engine.js');`
3. `src/lib/extension-answers/service.ts:14`
   `import {fingerprint,normalizeCandidate,candidateFromText} from '../../../jobright_extension/resume-engine.js';`
4. `src/lib/tailored-resumes/content.ts:2`
   `import {categorizeSkills} from '../../../jobright_extension/resume-engine.js';`
5. `src/lib/tailored-resumes/extension-content.ts:2`
   `import {analyze,buildResume,normalizeCandidate,categorizeSkills} from '../../../jobright_extension/resume-engine.js';`
6. `src/lib/tailored-resumes/extension-service.ts:13`
   `import {buildResume,fingerprint,normalizeCandidate} from '../../../jobright_extension/resume-engine.js';`
7. `src/lib/tailored-resumes/extension-task.ts:7`
   `import {fingerprint,normalizeCandidate} from '../../../jobright_extension/resume-engine.js';`
8. `src/lib/tailored-resumes/handler.ts:3`
   `import {analyze} from '../../../jobright_extension/resume-engine.js';`

All exported symbols (`VERSION`, `normalizeCandidate`, `analyze`, `buildResume`, `fingerprint`, `scopeKey`, `jobIdentity`, `candidateFromText`, `resumeDocx`, `categorizeSkills`) are verified present on line 524 of `jobright_extension/resume-engine.js`.

### C. Node Test Runner Alias Blocker in `src/`
- **File:** `src/lib/capture/validation.ts:1`
  - Line 1: `import {applicationUrlKey} from '@/lib/jobs/application-state';`
  - In `npm test` (`node --experimental-strip-types tests/browser-capture.test.mjs`), native Node does not resolve `@/` tsconfig path aliases and throws:
    `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from .../src/lib/capture/validation.ts`
  - Must be changed to relative import:
    `import {applicationUrlKey} from '../jobs/application-state';`

### D. Inventory of Stale `browser-extension` References
Search across the repository revealed 48 stale references in 26 test files and configuration:

1. **Configuration:**
   - `eslint.config.mjs:18`: `"browser-extension/vendor/**",` -> update to `"jobright_extension/vendor/**",`

2. **26 Test Files in `tests/`:**
   | # | Test File | Line Numbers | Stale Path Referenced |
   |---|---|---|---|
   | 1 | `tests/autofill-submit-validation.test.mjs` | 145 | `browser-extension/content.js` |
   | 2 | `tests/application-answer-capture.test.mjs` | 20, 35, 55, 79, 101, 116 | `../browser-extension/content.js` |
   | 3 | `tests/browser-extension-runtime.test.mjs` | 14, 35, 59, 71, 88, 118 | `../browser-extension/background.js` |
   | 4 | `tests/extension-ashby-commit.test.mjs` | 30, 67, 80 | `browser-extension`, `browser-extension/field-writer.js` |
   | 5 | `tests/extension-ai-workflow.test.mjs` | 6, 7, 28 | `resume-workflows.js`, `resume-engine.js`, `background.js` |
   | 6 | `tests/extension-resume-import.test.mjs` | 15, 19, 64 | `../browser-extension/resume-import.js` |
   | 7 | `tests/extension-installed-smoke.test.mjs` | 8 | `path.resolve('browser-extension')` |
   | 8 | `tests/extension-domain-exclusions.test.mjs` | 20 | `../browser-extension/content.js` |
   | 9 | `tests/extension-popup-resumes.test.mjs` | 10, 14 | `../browser-extension/popup.html`, `../browser-extension/` |
   | 10 | `tests/extension-candidate-isolation.test.mjs` | 8, 57 | `../browser-extension/background.js`, `resume-engine.js` |
   | 11 | `tests/extension-resume-engine.test.mjs` | 9 | `../browser-extension/resume-engine.js` |
   | 12 | `tests/extension-contextual-ai.test.mjs` | 24, 34 | `browser-extension/resume-engine.js` |
   | 13 | `tests/extension-resume-history.test.mjs` | 6, 7, 8 | `resume-engine.js`, `background.js`, `resume-workflows.js` |
   | 14 | `tests/extension-form-adapters.test.mjs` | 11, 25, 37, 48, 56, 69 | `browser-extension/` assets and `content.js` |
   | 15 | `tests/extension-resume-points.test.mjs` | 5 | `../browser-extension/resume-engine.js` |
   | 16 | `tests/extension-review-regressions.test.mjs` | 11 | `../browser-extension/` (`resume-engine.js`, `candidate-context.js`, `job-context.js`, `fill-session.js`, `content.js`) |
   | 17 | `tests/extension-fill-session.test.mjs` | 8, 13, 14, 15 | `resume-engine.js`, `candidate-context.js`, `job-context.js`, `fill-session.js` |
   | 18 | `tests/extension-screening-options.test.mjs` | 22 | `../browser-extension/content.js` |
   | 19 | `tests/extension-source-integrity.test.mjs` | 6, 7, 8 | `'browser-extension'` directory and manifest |
   | 20 | `tests/extension-submission-capture.test.mjs` | 32 | `../browser-extension/` (`resume-engine.js`, `candidate-context.js`, etc.) |
   | 21 | `tests/extension-undo-review.test.mjs` | 22, 23, 24, 25 | `candidate-context.js`, `job-context.js`, `fill-session.js`, `content.js` |
   | 22 | `tests/extension-tailoring-browser.test.mjs` | 6, 7, 8 | `resume-engine.js`, `content.js` |
   | 23 | `tests/resume-autofill.test.mjs` | 12 | `../browser-extension/content.js` |
   | 24 | `tests/standalone-resume-mode.test.mjs` | 12, 13, 14, 15 | `resume-engine.js`, `resume-workflows.js`, `background.js`, `content.js` |
   | 25 | `tests/stripe-embedded-boundaries.test.mjs` | 4 | `browser-extension/embedded-support.js` |
   | 26 | `tests/stripe-embedded-extension.test.mjs` | 6 | `path.resolve('browser-extension')` |

3. **Extension Self-References:**
   - `jobright_extension/resume-workflows.js:57`: User-facing error message text refers to `"browser-extension source"`.

### E. File Structure Comparison: `jobright_extension/` vs Expectations
- **Present in `jobright_extension/`:**
  - `manifest.json` (MV3 configuration)
  - `static/background/index.js` (Plasmo bundle containing `handleV3Message` for `save_external_job`, `auto_submit`, `auto_connect`, `get_candidates`, etc.)
  - `outside-job-engine.js` (Universal DOM scraper for external career portals, JSON-LD extraction, apply button watcher)
  - `helper-app.41ea2652.js` (Sidebar UI, autofill button, and animations)
  - `form-discovery.js`, `field-mapping.js`, `field-writer.js`, `fill-session.js`
  - `candidate-context.js`, `job-context.js`, `resume-engine.js`, `resume-workflows.js`, `resume-import.js`, `stripe-job.js`, `embedded-support.js`, `frame-agent.js`
  - `adapters/` (`ashby.js`, `generic.js`, `greenhouse.js`, `lever.js`, `workday.js`)
  - `vendor/` (`pdf.min.mjs`, `pdf.worker.min.mjs`, `pdfjs-LICENSE`)
- **Missing from `jobright_extension/` that are required by existing tests:**
  - `content.js`: Injected in tests like `application-answer-capture`, `resume-autofill`, `autofill-submit-validation` to mount `#mp-copilot-root` and handle form events.
  - `background.js`: Top-level background script imported directly in `browser-extension-runtime.test.mjs` expecting `serial` promise and message listener.
  - `resume-engine.d.ts`: TypeScript definition file for `resume-engine.js` checked by `extension-source-integrity.test.mjs`.
  - `popup.html`, `popup.js`, `popup-resumes.js`: Checked by `extension-popup-resumes.test.mjs`.

### F. Backend Endpoints & Supabase Realtime Submissions Dashboard
- **`/api/extension/save-external-job` (`src/app/api/extension/save-external-job/route.ts`):**
  - Authenticates extension actor via `extensionProfile()`.
  - Validates payload against `saveExternalJobSchema`.
  - Inserts/updates `public.outside_jobs`.
  - Mirrors record into `public.jobs` with `is_external: true` for unified directory listing.
  - Clears `outsideJobsCache`.
- **`/api/extension/auto-submit` (`src/app/api/extension/auto-submit/route.ts`):**
  - Authenticates extension actor, validates via `autoSubmitSchema`.
  - Records application in `public.job_submissions` via RPC `record_extension_submission` (or direct insert fallback).
  - Persists applied resume via `saveAppliedResume`.
  - Records answers snapshot via `save_application_answer_snapshot`.
  - Inserts/updates `public.outside_jobs` with status `'Applied'`.
- **`/dashboard/submissions` (`src/app/dashboard/submissions/page.tsx`):**
  - Listens on Supabase Realtime channel `job_submissions_realtime_feed` on table `job_submissions`.
  - Automatically calls `getSubmissions()` and updates React state on `INSERT` and `UPDATE` events.
  - Dispatches toast notifications: `🎉 New application saved: {company} ({title})`.
  - Handles both portal submissions and external DOM-captured submissions.

---

## 2. Logic Chain

1. **Build Health:**
   - Because `tsc --noEmit` and `npm run build` both exit with code 0 and compile all 87 routes, the Next.js application core is structurally sound and compiles cleanly with zero blockers.
2. **Import Integrity:**
   - Because commit `4782221` previously migrated the 8 imports in `src/` to `jobright_extension/resume-engine.js`, no active code in `src/` is trying to import from `browser-extension/`.
3. **Test Failure Root Cause:**
   - Commit `fe8af085be827daf4c4df89b03ae9bb4cdf9bcc4` removed the old `browser-extension/` directory without updating the 26 test files under `tests/`.
   - In addition, tests look for `content.js`, `background.js`, `resume-engine.d.ts`, and `popup.*` files which were located in `browser-extension/` but not yet copied or aliased into `jobright_extension/`.
4. **Resolution Strategy:**
   - Step 1: Ensure `jobright_extension/` contains `content.js`, `background.js`, `resume-engine.d.ts`, and `popup.*` assets so that all extension source assets are self-contained in `jobright_extension/`.
   - Step 2: In all 26 test files in `tests/`, replace `'browser-extension'` and `'../browser-extension'` with `'jobright_extension'` and `'../jobright_extension'`.
   - Step 3: In `eslint.config.mjs`, update ignore glob to `jobright_extension/vendor/**`.
   - Step 4: In `src/lib/capture/validation.ts`, change `@/lib/jobs/application-state` to `../jobs/application-state` so `npm test` runs cleanly under Node's native module loader without alias resolution errors.

---

## 3. Caveats

1. **Browser Extension Packaging vs Unpacked Loading:**
   `scripts/package-extension.mjs` packages files from `jobright_extension/` into `jobright_extension.zip`. Any files added to `jobright_extension/` (such as `content.js` or `background.js`) must not break `package-extension.mjs`. Since `package-extension.mjs` checks:
   `for(const filename of ['outside-job-engine.js','form-discovery.js','field-mapping.js','field-writer.js','embedded-support.js','frame-agent.js'])`
   adding `content.js` and `background.js` will safely be included in the zip.
2. **Dual Manifest Background vs Standalone Background:**
   `jobright_extension/manifest.json` specifies `"service_worker": "static/background/index.js"`. The unit tests in `browser-extension-runtime.test.mjs` execute `background.js` in a `node:vm` context and expect `serial` to be in global scope. Providing `jobright_extension/background.js` satisfies these standalone runtime tests while preserving `static/background/index.js` for Plasmo-packaged Chrome MV3 operation.
3. **Realtime Websocket Broadcasts in Testing:**
   In local headless test environments without live Supabase WebSocket connections, Realtime relies on mock events or polling fallbacks. The implementation in `SubmissionsPage` includes both WebSocket subscription (`job_submissions_realtime_feed`) and window focus/visibility listeners (`visibilitychange`).

---

## 4. Conclusion

- **Production Build:** Succeeded cleanly (`npm run build` exits 0, all 87 routes generated).
- **TypeScript Typecheck:** Succeeded cleanly (`tsc --noEmit` exits 0).
- **Extension Zip Packaging:** Succeeded cleanly (`node scripts/package-extension.mjs` outputs `jobright_extension.zip`).
- **All Required Changes Identified:**
  1. Fix `src/lib/capture/validation.ts:1` relative import for Node test runner.
  2. Restore `content.js`, `background.js`, `resume-engine.d.ts`, and popup assets into `jobright_extension/`.
  3. Update stale references across all 26 test files from `browser-extension` to `jobright_extension`.
  4. Update `eslint.config.mjs:18` ignore pattern.

---

## 5. Verification Method

To independently verify all findings:
1. **Verify Production Build:**
   ```bash
   npm run build
   ```
   *Expected:* Zero errors, 87 static/dynamic routes created in `.next`.
2. **Verify Typecheck:**
   ```bash
   npx tsc --noEmit
   ```
   *Expected:* Zero errors.
3. **Verify Extension Packaging:**
   ```bash
   node scripts/package-extension.mjs
   ```
   *Expected:* Output confirming 45+ files packaged into `jobright_extension.zip`.
4. **Inspect Imports in `src/`:**
   ```bash
   git grep "jobright_extension" src/
   git grep "browser-extension" src/
   ```
   *Expected:* 8 matches for `jobright_extension`, 0 matches for `browser-extension`.
5. **Verify Single Test Runner Fix:**
   ```bash
   node --experimental-strip-types --test tests/browser-capture.test.mjs
   ```
   *Expected:* All tests in `tests/browser-capture.test.mjs` pass once relative import is applied.

---

## 6. Feature Inventory Items

| Item ID | Component | Description | Dependencies | Status / Action Needed |
|---|---|---|---|---|
| **FEAT-01** | `jobright_extension/resume-engine.js` | Core deterministic resume analysis, DOCX generation, and ATS match scoring | None | Verified intact, imported by 8 `src/` files |
| **FEAT-02** | `jobright_extension/resume-engine.d.ts` | TypeScript type declarations for resume engine API and data structures | `resume-engine.js` | Missing; restore to `jobright_extension/` |
| **FEAT-03** | `jobright_extension/content.js` | Content script providing `#mp-copilot-root` UI, autofill trigger, and submit interception | `outside-job-engine.js`, `field-writer.js` | Restore/link into `jobright_extension/` |
| **FEAT-04** | `jobright_extension/background.js` | Background service worker entry point with `serial` queue and message listeners | `jobright_extension/static/background/index.js` | Restore/link into `jobright_extension/` |
| **FEAT-05** | `scripts/package-extension.mjs` | Extension packaging script creating `jobright_extension.zip` | `jobright_extension/` | Verified passing |
| **FEAT-06** | `src/app/api/extension/save-external-job/route.ts` | Backend API persisting DOM-scraped outside jobs to `public.outside_jobs` & `public.jobs` | Supabase DB | Verified intact |
| **FEAT-07** | `src/app/api/extension/auto-submit/route.ts` | Backend API creating `public.job_submissions` and updating `public.outside_jobs` | Supabase DB | Verified intact |
| **FEAT-08** | `src/app/dashboard/submissions/page.tsx` | Real-time Job Submissions dashboard with Supabase Realtime feed and toast feedback | Supabase Realtime channel `job_submissions_realtime_feed` | Verified intact |
| **FEAT-09** | Test Suite Reference Alignment | 26 test files under `tests/` pointing to `jobright_extension` | `jobright_extension/` | Update stale paths in all 26 test files |
| **FEAT-10** | `src/lib/capture/validation.ts` | Node test runner compatibility for module resolution | None | Change alias `@/lib` to relative `../` |
