# Extension contextual AI tailoring — 3.1.0

## Reference and boundaries

On 2026-10-20, reviewed Jobright's [official extension listing](https://chromewebstore.google.com/detail/jobright-autofill-%E2%80%93-insta/odcnpipkhjegpefkfplmedhmkmmhmoko), [autofill workflow](https://jobright.ai/job-autofill), and [official product walkthrough](https://jobright.ai/blog/supercharge-your-job-search-with-jobright-autofill/). The listing displayed version 1.24.1, updated October 14, 2026. These publisher materials describe profile-based autofill, role-specific AI resume generation, missing-keyword feedback, matching and application tracking.

Observed: those public workflow descriptions. Design choice: implement contextual, source-backed tailoring through NextKinHR's authenticated AI task system. Unknown: Jobright's private prompts, models, backend architecture, scoring formula and runtime behavior behind sign-in. No proprietary extension code or authenticated Jobright application was inspected, and identical internal logic or full feature parity is not claimed. REA's source-repository exception applies to implementing our available source; no binary/runtime analysis was needed to establish our code behavior.

## Delivered workflow

1. Select an authorized reviewed portal candidate, or import and review a readable source resume. Imported candidates do not require a portal candidate record.
2. Detect or paste the actual job title, hiring company, URL and full JD. Missing details block generation.
3. Connect authenticated NextKinHR service access and agree to AI processing for the current candidate/JD. Offline matching, imports and original files remain available; AI generation requires service access.
4. Queue a `resume_tailor` task with an extension-specific payload. Connected snapshots reference candidate version/hash; uploaded snapshots contain reparsed source facts, excluding original binary file bytes. Relevant professional facts and the JD go to the configured provider. Keys remain on the server.
5. The web server schedules the first AI attempt with Next.js `after()` and a bounded processing window. Durable workers can process queued work. Recoverable web transport/timeouts are queued for worker recovery; repeat web requests do not reclaim attempts already started.
6. AI selects relevant source fact IDs and explains direct, transferable and missing evidence against exact JD excerpts. Invalid IDs and unsupported JD excerpts are rejected. AI prose is advisory and does not enter the resume. Selected facts form a targeted summary and ordered skills; full original history, dates, qualifications and source sections are preserved.
7. Calculate ATS requirement coverage against the actual generated text separately. Transferable AI judgments do not inflate this deterministic estimate. It is not an employer ATS score or a hiring prediction.
8. Save a distinct candidate/JD/model/version-scoped result and genuine DOCX. Review accuracy before attachment; downloading alone does not mark the draft reviewed. Job/profile changes invalidate the active preview/attachment.

There is no fixed 10-job limit. Repeated identical requests resume their persisted task or reuse the saved exact snapshot; changed JDs or candidate facts produce separate versions. Workspace AI usage limits, provider capacity and local storage still apply. Old rules-based snapshots remain accessible as history, but cannot satisfy a new AI-tailoring request.

## Security and integration

- Both generation routes require an active extension credential and an allowed role; connected candidates additionally require current ownership/assignment and confirmed provenance.
- Status GET is read-only, actor-scoped, and rechecks connected-candidate access/freshness. Uploaded results cannot be fetched through the connected route, or vice versa.
- Source and JD text are untrusted input. Provider output must pass strict schema and fact/JD evidence checks. No provider-supplied percentages are accepted.
- API keys are never returned to the extension. Uploaded source snapshots are stored in authenticated processing tasks, not candidate records; local version history remains on the device. The consent text discloses server processing snapshots.
- Resume generation no longer holds the extension's serialized capture queue. Existing application observation, confirmation, auth/OAuth and submission contracts were not rewritten.
- Uses the existing task kind, leasing, daily AI allowance, worker and application-resume storage schema. No new database migration or dependencies are required by this upgrade; prior task/tailoring/application-resume migrations must already be applied.

## Release and operation

Install `browser-extension-v3.1.0.zip` with Chrome/Edge Load unpacked, or reload the existing `browser-extension` source folder. Reload job tabs. Deploy the updated portal and update/restart any processing worker before using the new extension. Server-only processing needs configured AI credentials and host support for Next.js `after()` within the route's 60-second duration; a separate worker is the fallback for unavailable/slower web processing.

The local provider diagnostic on 2026-10-20 returned `ECONNREFUSED` for `http://127.0.0.1:31415`. Therefore a live generation against the configured gateway has not been verified. Start/restore that configured gateway, or configure a reachable provider on the processing service, then rerun `node --conditions=react-server node_modules/tsx/dist/cli.mjs scripts/worker.ts --check-ai`. This upgrade does not alter provider credentials or environment configuration and has not been deployed.

## Verification

Focused checks cover contextual selection, unsupported fact/JD evidence rejection, preservation of professional experience/licenses and all source headings, structured education/certification/project visibility, authenticated uploaded AI, consent, stale candidates, actor isolation, worker timeout recovery, per-job history beyond 10 applications, original file imports, and genuine DOCX attachment in the installed Manifest V3 extension.

Browser screenshots use synthetic candidates and a simulated AI response. They validate UI and extension integration rather than live provider quality.

Final outcomes on 2026-10-20:

- Complete regression suite: 436 passed, 0 failures, 0 skipped. Browser bundles required running outside the restricted filesystem sandbox to resolve installed React dependencies.
- Final focused extension suite after the last validation-message correction: 38 passed, 0 failures, including installed Manifest V3 import/generation/review/attachment/history, contextual evidence UI, nonblocking capture queue, permissions, worker recovery and genuine DOCX contents.
- TypeScript `--noEmit`, scoped ESLint for changed server modules/routes, production Next.js webpack build and `git diff --check` passed.
- Independent review identified source-heading preservation, missing structured qualifications and recoverable timeout handling; all were corrected and rechecked. No remaining blockers were reported.
- Packaged and reopened the 14-file ZIP to verify required assets and manifest 3.1.0. The release is `browser-extension-v3.1.0.zip` (600603 bytes).
- Live provider diagnostic remains blocked by connection refusal at the configured gateway; no real candidate documents were sent in that diagnostic. No deployment was performed.

Visual evidence: `docs/operations/screenshots/extension-ai-evidence-desktop.png`, `extension-tailoring-desktop.png` and `extension-tailoring-mobile.png`.
