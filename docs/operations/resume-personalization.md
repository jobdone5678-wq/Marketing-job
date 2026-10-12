# Resume-based job discovery and application autofill

Candidates upload a resume, review the extracted facts, and confirm/save their profile. Public Jobs, Greenhouse and Ashby feeds then show related roles ranked by saved skills and current/target job titles. Each recommendation lists matching roles/skills. No AI request is needed to rank the feed. Missing or unreviewed profiles receive a prompt to finish their resume review. An empty result means no related roles matched the selected filters; it does not fall back to unrelated jobs.

Recruiters can keep browsing all roles or select a reviewed candidate to personalize the feed. Public ingestion still saves all fetched jobs; personalization only changes the displayed results. Recommendations are discovery hints, not assertions that every qualification or eligibility requirement is met.

Reload the unpacked extension under `chrome://extensions` or `edge://extensions` after updating to version 2.1.0, then reload open application tabs. Connect the extension to the portal using the signed-in account. Candidate accounts receive only their own latest reviewed profile. Recruiter applications opened through “Start linked application” use the candidate associated with that application, including navigation that removes the URL hash. On an unlinked recruiter tab, choose a candidate in the floating widget before automatic filling begins.

Each application stays tied to one selected candidate to prevent mixing two people's answers. To choose another candidate on an unlinked page, reload the application first.

The extension fills empty recognized text fields, text areas, native selects, and explicit Yes/No radios or checkboxes. It observes late-loading fields, uses React-compatible value/events, preserves existing answers and applicant edits, and leaves unknown facts blank. US authorization is used only for explicitly US questions. Consent, demographic questions, passwords, file uploads and ambiguous custom widgets are left for the applicant. Review the form and attach the appropriate resume manually; the extension does not submit applications.

Verification uses synthetic resumes/jobs and local representative Greenhouse/Ashby forms, including controlled React inputs. Portal layouts and custom widgets vary; live third-party forms were not submitted or used for testing.
