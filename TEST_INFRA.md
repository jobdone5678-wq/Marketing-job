# E2E Test Infra: JobRight Extension & Marketing Portal

## Test Philosophy
- Opaque-box, requirement-driven testing based on `ORIGINAL_REQUEST.md`.
- Verifies extension import integrity, job form autofill, external job DOM capture, database persistence (`outside_jobs` & `job_submissions`), Supabase Realtime synchronization, and packaging.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Interactions + Real-World Workloads.

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 | Tier 2 | Tier 3 |
|---|---------|-------------|:------:|:------:|:------:|
| 1 | Extension Import & Build Integrity | R1, AC-1 | 5 | 5 | ✓ |
| 2 | Job Form Autofill Reliability | R2, AC-2 | 5 | 5 | ✓ |
| 3 | External Job DOM Capture & Ingestion | R2, AC-2 | 5 | 5 | ✓ |
| 4 | Unified Job Submissions Persistence | R2, AC-2 | 5 | 5 | ✓ |
| 5 | Real-Time Submissions Dashboard Feed | R3, AC-3 | 5 | 5 | ✓ |
| 6 | Extension Zip Packaging & Verification | R4, AC-4 | 5 | 5 | ✓ |

## Test Architecture
- **Mock Form Fixtures**: Local HTML pages under `tests/fixtures/mock-job-pages/` (and existing `tests/fixtures/extension-forms/`) representing major ATS structures (Greenhouse, Ashby, Lever, Workday, Keka).
- **Test Runner**:
  - `node --test tests/test-outside-jobs-persistence.test.mjs` (Backend API & DB mock tests)
  - `node tests/test-autofill-browser.mjs` (Playwright headless browser autofill & DOM capture tests)
  - `npm test` (Full Node unit/integration test suite)
  - `node scripts/package-extension.mjs` (Extension packaging verification)
  - `npm run build` (Next.js production webpack compile verification)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Candidate navigates to external Greenhouse job, clicks "Apply", autofills application form, and submits. | DOM Scraper, Autofill, Auto-submit API, `outside_jobs` & `job_submissions` | High |
| 2 | Candidate discovers external job on Keka/Foxsense, extension extracts DOM details to `outside_jobs` and mirrors to `job_submissions`. | DOM Scraper, `save-external-job` API, Realtime Feed | Medium |
| 3 | Recruiter views `/dashboard/submissions`, external submission arrives via Realtime, UI updates instantly with "Outside Portal" badge without page reload. | Realtime Channel `job_submissions_realtime_feed`, Submissions UI | High |
| 4 | Packaging script runs on clean repo, produces `jobright_extension.zip` containing all verified runtime assets without uncommitted debris. | Packaging Script, Clean Git State | Low |

## Coverage Thresholds
- Tier 1 (Feature Coverage): >=5 tests per feature.
- Tier 2 (Boundary & Corner Cases): >=5 tests per feature (empty fields, missing phone, malformed URLs, special characters).
- Tier 3 (Cross-Feature Combinations): Pairwise interactions (Autofill + DOM Capture, Save External Job + Auto-submit, Save Job + Realtime Feed).
- Tier 4 (Real-World Scenarios): >=4 end-to-end user workflows.
