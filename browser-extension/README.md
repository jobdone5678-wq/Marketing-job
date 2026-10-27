# Recruiting Copilot 3.2.1 — grounded screening and contextual AI tailoring

## Resume work points patch

This patch keeps manifest version **3.2.1**. For connected profiles, Tailor Resume reads the authorized original file locally and sends its complete text through the existing authenticated AI service after consent. A sparse portal profile is no longer the only source for work experience. The shared engine recovers responsibilities under their original employers, exposes them as experience facts for AI rewriting, and preserves stable fact IDs when ordering bullets by relevance. Job headings and dates are not repeated as accomplishment bullets. Explicit skills and remaining source sections are retained.

The portal and worker import `browser-extension/resume-engine.js`; deploy that updated shared file with the existing service before testing the new connected-source workflow. No API keys belong in the extension, and no server API/schema or database migration is changed. Connected-source drafts are saved in local per-job history under the original candidate ID, with candidate access and version checked before and after generation. An older service without the updated content-quality metadata produces an update message instead of a heading-only download.

Replace the files in Chrome’s existing v3.2.1 unpacked folder, click its Reload control, and reload the job tab. Upload the full original resume or paste its full text if the original cannot be read. AI can rewrite supported responsibilities and accomplishments; it cannot supply missing employers, qualifications, achievements or metrics. Review every draft before attaching or submitting it.

Unzip the release package into a folder. In Chrome or Edge, open Extensions, enable Developer mode, choose **Load unpacked**, and select the folder containing `manifest.json`. Reload existing job tabs after installing or updating.

## Candidate details

Connect NextKinHR to select a reviewed, authorized candidate, or upload a PDF, DOCX, TXT, MD or JSON resume without connecting. You can also paste the source resume in the popup. Put the name on the first line, followed by real contact details, skills, experience and education. Review the extracted details. Missing location, employers, eligibility and dates are never guessed.

## One resume for each job

Open the job posting and Copilot. Review the detected title, hiring company and full JD. Use **Review or paste job details** if detection fails or the application page omits the JD. Connect authenticated NextKinHR AI access, select a reviewed candidate or upload a source resume, and agree to processing the candidate facts and JD. Select **Tailor Resume**, review the preview and ATS evidence, then download DOCX or confirm accuracy and attach it. Submit the application yourself after review.

AI prioritizes relevant accomplishments and skills using the supplied facts. Its contextual assessment separates direct evidence, transferable experience needing verification, and missing evidence. It cannot insert a missing skill, employer, qualification, date or achievement. The generated summary quotes supplied facts with their employment context. AI judgments are advisory; the separately calculated ATS estimate is not an AI prediction or an employer score.

Each candidate/job/JD snapshot has its own saved version. Repeating an identical request reuses its version. A changed JD or candidate profile creates another version. There is no fixed application-count limit; local history uses available device storage. **Saved resumes by job** in the popup includes previous uploaded candidates. Changing the active source never substitutes a different candidate in an existing application.

The ATS percentage is estimated coverage of extracted JD requirements. It is not the employer's ATS score. Missing qualifications remain visible and are not added to the resume. Formatting checks cover the generated single-column DOCX. Review the full JD because automated extraction may miss requirements.

Scanned PDFs require pasted text or a readable source document. DOCX headers/footers and unusual PDF encodings may also need manual text entry. Some websites do not allow automatic file attachment; download the reviewed DOCX and attach it manually. The extension does not submit applications.

AI tailoring requires the updated NextKinHR server and configured server-side AI credentials, or an updated, configured processing worker. Keys never enter the extension. The existing daily processing budget applies. Generation returns a durable task and the extension polls its own authenticated result. If interrupted, choose Tailor Resume again to resume the same request; terminal failures can be retried. No rules-based resume is silently substituted when AI is unavailable.

Uploaded sources do not create a portal candidate record, but their parsed source and JD are sent to NextKinHR, stored in an authenticated processing-task snapshot, and relevant professional facts are sent to the configured AI provider after consent. The generated uploaded-candidate history is stored locally. Offline source import, basic matching, original-file access and factual autofill remain available; AI tailoring requires connected service access. Connected-candidate history uses the existing application-resume migration described in `docs/operations/application-resumes.md`.


## Screening drafts and form filling in 3.2

Select a profile, use **Fill Job Form**, or launch Apply from the connected portal to start filling. Merely loading an application with a saved profile does not start the new adapter fill path. Standard fields use exact profile mappings; existing values are preserved. Ambiguous duplicate labels, repeated work/education sections, and inaccessible embedded forms require manual review. Greenhouse, Lever, Ashby and Workday have host-specific hints over the shared semantic adapter. These boundaries are verified with synthetic fixtures, not a guarantee for every live form on those platforms.

For contextual screening drafts, supply the actual JD and URL, enable AI processing consent and choose the screening action. Review each draft and its source references, edit if needed, then choose **Accept & Fill Form**. Unsupported questions remain unanswered. AI selects relevant source facts; it does not fabricate a behavioral story or years of skill-specific experience. Legal eligibility, salary, demographic, consent and duration questions require a recruiter answer in the AI draft flow. Known explicit local profile answers remain available through factual autofill where their meaning is clear.

A changed candidate, JD, question, option list or manually edited form value invalidates insertion of an outdated draft. Undo restores extension-owned values only while they still match the recorded write. Custom dropdowns require exact options and a usable reset path; otherwise complete them manually.

Deploy the matching server/worker code and apply `supabase/migrations/20261021000100_extension_answer_tasks.sql` before using AI screening. The new `application_answers` task uses the shared allowance, lease and retry controls. Results are actor-scoped and connected candidate access is rechecked. The extension resumes a pending screening request when retried. The legacy `/api/extension/ai-answers` URL remains an alias, but requests must provide the current consent/context contract; install the paired 3.2 extension. There is no unmetered legacy provider call.

See `docs/operations/extension-3.2-release.md` for validation and remaining live-deployment checks. Owned by Nextkinlife LLC.


## Stripe embedded applications (3.2.1)

Stripe uses a Greenhouse iframe. On a Stripe application, **Fill Job Form** now routes supported contact fields to that matching iframe through the extension worker. The worker verifies the parent job ID, Greenhouse board/job ID and authorized candidate; it sends only reviewed contact facts. The parent page newsletter is excluded. Undo preserves subsequent manual edits, and repeated fill operations are serialized.

The full JD is read from the same posting's public Stripe role-details page; the application title/company use that job rather than the browser tab title. If loading fails, supply the JD manually. Resume attachment, additional screening questions and submission tracking inside this embedded form require manual review. This patch does not submit an application.

To preserve pairing/storage, extract the new ZIP into the extension folder Chrome already loads, replacing its files, then click **Reload** for that extension and reload open Stripe tabs. If Chrome already loads the canonical development folder, Reload is sufficient. Alternatively disable the old copy, load **browser-extension-v3.2.1** as a new unpacked extension, and reconnect/upload your source. Keep only one copy enabled. Existing unpacked 3.2.0 folders do not automatically acquire new files.

Keep the canonical **browser-extension/** source directory in the project: the portal imports its shared resume engine. Versioned release folders/ZIPs are distribution copies and do not replace that source directory. A missing canonical folder causes `npm run dev` module-resolution errors.
