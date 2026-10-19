# Recruiting Copilot 3.0

Unzip the release package into a folder. In Chrome or Edge, open Extensions, enable Developer mode, choose **Load unpacked**, and select the folder containing `manifest.json`. Reload existing job tabs after installing or updating.

## Candidate details

Connect NextKinHR to select a reviewed, authorized candidate, or upload a PDF, DOCX, TXT, MD or JSON resume without connecting. You can also paste the source resume in the popup. Put the name on the first line, followed by real contact details, skills, experience and education. Review the extracted details. Missing location, employers, eligibility and dates are never guessed.

## One resume for each job

Open the job posting and Copilot. Review the detected title, hiring company and full JD. Use **Review or paste job details** if detection fails or the application page omits the JD. Select **Tailor Resume**, review the preview and ATS evidence, then download DOCX or confirm accuracy and attach it. Submit the application yourself after review.

Each candidate/job/JD snapshot has its own saved version. Repeating an identical request reuses its version. A changed JD or candidate profile creates another version. There is no fixed application-count limit; local history uses available device storage. **Saved resumes by job** in the popup includes previous uploaded candidates. Changing the active source never substitutes a different candidate in an existing application.

The ATS percentage is estimated coverage of extracted JD requirements. It is not the employer's ATS score. Missing qualifications remain visible and are not added to the resume. Formatting checks cover the generated single-column DOCX. Review the full JD because automated extraction may miss requirements.

Scanned PDFs require pasted text or a readable source document. DOCX headers/footers and unusual PDF encodings may also need manual text entry. Some websites do not allow automatic file attachment; download the reviewed DOCX and attach it manually. The extension does not submit applications.

Connected resume history requires the updated NextKinHR server and the application-resume database migration described in `docs/operations/application-resumes.md` in the portal repository. The portal's existing AI workflow also requires its processing worker to run the updated code. Standalone tailoring and storage run locally, without an AI key.
