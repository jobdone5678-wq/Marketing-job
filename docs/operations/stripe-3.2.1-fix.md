# Stripe application and missing-source fix — 3.2.1

## Reported failures and evidence

The supplied dev log showed `Cannot resolve ../../browser-extension/resume-engine.js` from candidate-resume-export.ts. The canonical browser-extension directory was absent from disk while its tracked files were marked deleted. Version 3.2.0's unpacked release was intact. The required canonical directory was restored from that release, and the shared TypeScript declaration was restored from Git. Obsolete release deletions were left alone. Keep the canonical source directory: the portal imports its shared resume engine; release ZIPs/folders do not replace it.

Read-only inspection of the public Stripe application for Software Engineer, Payin (8185012) showed that its real inputs are inside `https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8185012`. The application page lacks the full JD; its Role details link goes to the corresponding Stripe listing. That listing provides a JobPosting JSON-LD document and `.careers-listing-details__body`. Actual Greenhouse inputs have both ARIA labels and required-field label text, so concatenating both also prevented exact field mapping.

No real candidate data was entered or uploaded to an employer site. The user's existing Chrome tab was not modified. Public browser inspection used temporary read-only in-app browser tabs; functional testing used synthetic intercepted pages.

## Changes

- Restored the canonical extension source and its shared type declaration, resolving the missing portal dependency.
- On Stripe application pages, read the matching public role-details page to obtain its job title, company and full JD. Only the fixed Stripe HTTPS origin/career path is accepted; unrelated URLs and redirects are rejected. Loading failures retain the manual-JD fallback.
- Added a separate content-script entry narrowly matching Greenhouse's embedded application path. The existing top-level entry was not changed to run in every frame.
- Route explicit Fill Job Form and Undo operations through the extension worker. Registration verifies Stripe's parent posting, the Greenhouse board and matching job ID. Each fill refreshes candidate access and sends only reviewed contact facts; no credential/source-resume transfer and no page postMessage channel.
- Skip top-page field filling on supported embedded applications so a newsletter signup cannot receive applicant details.
- Prefer a single accessible label and normalize required markers, rather than concatenating duplicate ARIA/label strings.
- Serialize frame operations so overlapping fills retain Undo receipts. Preserve existing field values and intervening manual edits. Never click Submit or consent controls.

## Scope

Supported embedded contact fields are filled when their facts are available. Country/location custom controls require exact matching profile data and supported widget semantics. Additional screening questions, resume attachment and submission tracking inside this iframe remain manual; the panel explicitly says so. This patch does not claim complete live Stripe automation or exact Jobright parity.

## Verification

The installed Manifest V3 fixture reproduces the Stripe parent + cross-origin Greenhouse iframe and actual label shape. It verifies name/email/phone fill, linked JD/readiness, untouched newsletter and consent, manual edit preservation, Undo, and two concurrent fills followed by Undo. The original zero-fill failure and concurrent-receipt race both failed before their fixes. Boundary tests reject wrong origins/boards/job IDs and verify contact-only payloads. Source-integrity coverage detects the missing canonical directory.

The real Turbopack production build passed using an isolated output directory (`RECRUITING_E2E=1`) and process-local `NODE_OPTIONS=--max-old-space-size=4096`. This exercises the same bundler family as npm run dev without disturbing the user's dev output. The initial parallel build failed from memory pressure, so it was rerun after browser tests stopped. Standalone TypeScript validation passed. The corrected Stripe integration test and dashboard test passed in isolation after an initial resource-related esbuild spawn failure. Final serial suite: all 485 tests passed with zero failures/skips in 329.6 seconds, including the installed-extension embedded-form/concurrency regression. The independent reviewer confirmed the serialization fix and reported no further important product issues.

Synthetic fixture screenshot: `docs/operations/screenshots/stripe-iframe-fixed.png`; this is a test page, not a live application with user data.

## Install

1. Keep `browser-extension/` in the repository. Refresh the portal; restart `npm run dev` if its old failed module graph remains cached.
2. Extract the new ZIP into the folder Chrome already loads, replacing its files, then click Reload on that extension to preserve its pairing/storage. If already loading the canonical development folder, Reload alone is sufficient. Alternatively disable the old copy, Load unpacked from `browser-extension-v3.2.1`, and reconnect/upload the candidate. Keep one copy enabled. A previously loaded `browser-extension-v3.2.0` folder still contains the old code until updated.
3. Reload open Stripe job tabs, select the candidate and choose Fill Job Form. Verify the detected JD and filled contact details; complete the remaining fields and attach the reviewed resume manually.

Artifact: `browser-extension-v3.2.1.zip`, 28 files, 620641 bytes. SHA256: `74120FC57C5440E1A941055E7B2B8E6BEE30EEB95ADF2621C69A544D921CF1D0`.

All 28 ZIP entries were byte-compared against the canonical source and unpacked 3.2.1 release. No production database, API, authentication or capture-state contract changed in this patch.
