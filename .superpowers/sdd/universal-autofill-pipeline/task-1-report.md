# Task 1 Report: Shared URL Canonicalization & Whitelisting

## Overview
Implemented canonical URL processing and parameter whitelisting across web application state and extension background/capture logic.

## Modified Files
- `src/lib/jobs/application-state.ts`: Defined `PRESERVED_JOB_PARAMS`, implemented `canonicalJobUrl(raw)`, and updated `applicationUrlKey` to canonicalize URLs while maintaining routing and greenhouse verification requirements.
- `jobright_extension/core/job-capture.js`: Added `cleanApplicationUrl(url)` with identical `PRESERVED_JOB_PARAMS` set and tracking query parameter stripping (`utm_*`, `ref`, `source`, `fbclid`, `gclid`, `trk`), exposed via `NextkinJobCapture.cleanApplicationUrl`.
- `jobright_extension/background.js`: Updated `cleanApplicationUrl(url)` to use the aligned `PRESERVED_JOB_PARAMS` whitelist and robust URL handling.
- `tests/url-canonicalization.test.mjs`: Added unit tests verifying tracking parameter stripping, preserved job ID parameters (`gh_jid`, `jobId`), and equivalence of application URL keys.

## Test Verification
- `node --experimental-strip-types --test tests/url-canonicalization.test.mjs`: 3 passing tests
- `node --experimental-strip-types --test tests/linkedin-application.test.mjs`: 2 passing tests
- `npm run typecheck`: Passed with 0 errors across codebase

## Commit
- Commit SHA: `c7b0bcb8cb2f7ae3a6d06439d722f7d7a24b60a0`
- Message: `feat: align shared URL canonicalization and parameter whitelist`
