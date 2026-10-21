# Portal resume recovery and Jobright-style copilot

Date: 2026-10-21
Status: design approved conversationally; written specification awaiting review.

## Intended outcome

Repair resume uploads in the NextKinHR portal first. A candidate or authorized staff member uploads a PDF/DOCX, sees extraction progress, receives editable candidate facts and histories, and confirms those facts before they become available for recruiting workflows. The reported portal failure is separate from the extension's limited local parser.

Then deliver the Jobright-style extension panel shown in the user's screenshots, using Nextkinlife branding. Outside users sign in and review their own uploaded resume profile. Connected portal users select only profiles allowed by existing ownership and assignment rules. Both paths support factual autofill, a canonical master resume and a separate tailored resume for every JD.

## Evidence and unresolved questions

- The portal upload route stores a private document and registers a `resume_extract` task. The review component polls the document and invokes authenticated task processing. Extraction uses the shared AI client and evidence validation.
- Read-only inspection of the configured database on 2026-10-21 found six recent failed extraction tasks, all for PDFs, with generic processing errors and no associated provider-usage entries. This establishes failed processing, not its precise cause.
- Reading the latest failed PDF through the current standalone local reader succeeded: one page, 2,734 extracted characters. No document contents were printed or sent to an AI provider during this diagnostic. This does not prove the reader works in the deployed or Next.js-bundled runtime.
- A synthetic PDF also passed the local reader. Investigation must compare the actual task runtime, imports, storage/download, PDF initialization, schema creation and reservation boundary before selecting a fix.
- The AI connectivity preflight passed, but is not end-to-end extraction verification.
- The database API previously returned PGRST205 for `application_resume_versions`. Connected extension tailoring needs migration/schema-cache verification. This is a separate issue from portal extraction.
- The extension currently accepts local uploads without login and extracts incomplete profiles with a limited parser. That differs from the requested signed-in onboarding.
- User screenshots establish the Jobright account/profile checklist, right-side panel, Add This Job action, prominent Autofill button, expandable information/resume/cover-letter sections and custom-resume action. Generated-resume preview and expanded editors remain unobserved. No proprietary backend algorithm equivalence is claimed.

## 1. Portal upload recovery — first delivery

Trace the existing pipeline without replacing authentication, storage, leases, AI budgets or evidence validation. Reproduce the failure through the same Next.js execution path as the portal, using synthetic files first. Add safe stage diagnostics where the current generic error hides the cause. Diagnostics identify document/task IDs and stages, never document contents, credentials or raw provider bodies.

Choose a targeted repair only after the failing stage is established. Verify PDF module/worker initialization in the installed Next.js version, runtime differences, storage reads, schema construction and shared AI reservation. Preserve specific actionable errors for unreadable files, configuration, provider transport and invalid extraction output. Do not turn an unknown internal error into a misleading provider diagnosis.

The UI must distinguish uploading, queued, running, ready for review, failed, cancelled and status unavailable. It must not describe an unclaimed queued task as active extraction. Stop unbounded busy states and provide status checking/retry without duplicating live work. Replacement uploads must not receive a prior document's late response; retries preserve document identity. Retain manually entered profile values when an extracted field is unknown; show populated changes for review.

Success means extracted supported contact, location, skill, employment and education facts appear in the candidate form. Saving remains an explicit review/confirmation action. Missing or unsupported facts remain unknown. Do not create a confirmed candidate merely because upload succeeded.

## 2. Identity and candidate access

All normal extension application features require sign-in. Reuse existing account/session mechanisms where compatible; do not silently treat local storage as authenticated identity. Outside-user access needs an explicit account classification and server-enforced own-profile boundary. Implementation planning must identify the minimum additive account/session contract after inspecting existing signup and pairing; do not assign outside users a recruiter or administrator role for convenience.

Connected portal access follows existing role semantics: candidate UI corresponds to the current `client` role and reads its own profile; recruiter reads assigned candidates; technical recruiter reads its assigned candidates; super admin uses existing permitted administration access. Enforce these rules server-side on list, read, extraction, export, generation and status operations. Preserve existing tenant boundaries; super-admin behavior must follow the portal's actual tenant model rather than a new global assumption.

Outside users review and use their own resume profile. An outside upload does not become a shared bench candidate. Source/profile history is actor-scoped. Signing out, switching actors or losing access clears active private context and prevents stale drafts from being applied. Candidate and JD changes invalidate active fill plans and attachment state while preserving authorized history.

## 3. Panel and onboarding

Reproduce the supplied Jobright panel's hierarchy, spacing and interaction pattern with Nextkinlife identity: a compact branded header with settings/collapse controls, a top job-capture area, a prominent full-width Autofill button, and expandable Autofill Information and Resume sections. Retain the cover-letter section location; implement no new cover-letter generation subsystem without a separately defined source-grounding contract. Do not show a working-looking action for an unavailable capability.

Use a roughly 480px desktop panel constrained to the viewport, a collapsed launcher, internal scrolling and a functional narrow-screen layout. Retain accessible focus, keyboard controls, labels and visible status/error text. The connected version includes an active candidate selector. Outside users see their own profile. Footer: Owned by Nextkinlife LLC.

Onboarding is sign in -> choose connected portal profile or upload -> extract -> review/correct -> ready. Missing candidate facts, missing JD and unavailable AI are explicit states. Show real progress rather than cosmetic readiness indicators.

## 4. Canonical master and per-job resumes

A canonical master represents the complete reviewed source and history for one candidate/profile version. It requires no JD and remains available without AI generation. Preserve employment, education, projects, certifications and source sections; expose incomplete sections for review rather than silently omitting them. Existing export primitives may be reused, but the current partial profile export is not sufficient by itself.

Provide a document preview and DOCX/PDF downloads. A master is distinct from the original uploaded bytes and from every tailored version. Tailoring creates a new version scoped to actor, candidate/source version, company, job identity and JD hash. Never overwrite the master to fit a job. There is no fixed ten-job limit; existing budgets, storage limits and rate limits remain visible.

Reuse the existing authenticated AI task system. Start generation with a short request and expose durable queued/running/retrying/succeeded/failed status. Resume a valid existing task after panel reload or service-worker restart. Prevent obsolete candidate/JD results from appearing in the current panel. Display missing consent, JD, candidate facts, database setup and AI errors near the initiating action. Downloaded and attached bytes must match the previewed saved version.

Match estimates expose required/preferred skills, experience, location, authorization, availability, compensation where supplied, missing requirements and evidence. Keep advisory reasoning separate from deterministic coverage; do not imply a universal employer ATS score.

## 5. Autofill

Use deterministic mappings for known fields and a selective AI fallback for ambiguous field meaning. AI maps a question to an allowed fact key or supported answer with evidence; it does not invent candidate facts. Prefer sending labels/options and available fact-key names when identifying a field, then resolve private values locally.

Searchable dropdown adapters must open the control, enter a supported search query where needed, wait for available options, select an actual supported option and verify framework state after rerender. Address components remain distinct. Do not infer missing street, postal code or country from unrelated metadata. Never substitute current salary for expected salary or infer legal eligibility from location.

Preserve manual values. Repeated work/education groups require explicit record association. Show unresolved fields with reasons and retain undo when the field still contains the extension-written value. Keep existing scoped frame messaging and capture contracts. Final employer submission remains a human action.

## Delivery sequence and verification

1. Reproduce and repair portal extraction; prove supported PDF/DOCX upload -> extraction -> editable review -> explicit save through the server runtime. Cover readable, corrupt/password-protected/scanned documents, provider errors, no worker, cancelled tasks, replacement uploads and retry recovery.
2. Implement signed-in outside onboarding and role-scoped connected profiles; test own/assigned access and cross-account denial.
3. Implement the screenshot-grounded panel and complete profile review, then canonical master preview/download.
4. Improve durable tailoring progress and DOCX/PDF per-job output; verify database prerequisites before live generation.
5. Improve dropdown/address adapters and selective semantic interpretation; test framework rerenders, missing options, unknown values and manual edits.
6. Verify integrated application journeys and at least 25 distinct JD versions without candidate/job leakage. Keep confirmation/capture states unchanged.

Use synthetic fixtures for automated tests. Run focused regressions, TypeScript checks and an isolated production build after code changes. Confirm behavior visually in the real panel and portal. A local text-reader test, provider preflight or UI screenshot alone does not establish end-to-end success.

## Implementation boundaries

This document authorizes no deployment, production migration or candidate-data reprocessing by itself. Preserve unrelated working-tree changes. Any required additive authentication, schema or API changes must be listed concretely in the implementation plan. Follow the installed Next.js guides before editing Next.js code. No source implementation has been made as part of this design investigation.
