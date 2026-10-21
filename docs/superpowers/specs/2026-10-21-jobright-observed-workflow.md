# Jobright-observed application copilot — design brief

Date: 2026-10-21. Status: proposed design and investigation record; implementation is not authorized by this document alone.

## Goal

Deliver a Nextkinlife recruiter extension that supports the same observed application workflow as the installed Jobright extension, with candidate selection, contextual resume tailoring, factual autofill, explicit review, and separate application records for every job. Retain NextKinHR connected candidates and uploaded sources. Do not claim identical proprietary algorithms or unobserved feature parity.

## Evidence ledger

These are local observation labels, not REA-generated Evidence IDs. Browser UI was inspected with the supported in-app browser tools; no extension package or private Jobright backend was decompiled.

| Label | Source | Observation and limit |
|---|---|---|
| OBS-01 | User's attached screenshot | Jobright is installed in the ChatGPT/Codex in-app browser. The earlier Chrome/Brave investigation selected the wrong browser. Installed version is not shown. |
| OBS-02 | Live in-app browser, `https://job-boards.greenhouse.io/monumentsoftwareinc/jobs/5160207007` | Jobright automatically injects a right-docked panel on this Greenhouse application. Root `jobright-helper-root` is present in the page accessibility tree. The employer form is a separate UI. |
| OBS-03 | `../../operations/jobright-observation-2026-10-21/01-jobright-onboarding-on-greenhouse.png` | Panel reads “Autofill with Jobright”; account setup is checked, profile details have a GO action, and Start Applying is disabled. Profile completion is the current feature gate. A checkmark is a displayed state, not proof of independent account verification. |
| OBS-04 | Live collapse/reopen actions; `../../operations/jobright-observation-2026-10-21/02-jobright-collapsed.png` | Panel collapses to a floating branded launcher and reopens. Verified in both directions. |
| OBS-05 | Live GO action | Opens an additional `about:blank` tab; no usable profile-completion page was observable in this run. No profile data was entered, no resume was uploaded, and no employer application was filled or submitted. |
| OBS-06 | Browser access restriction | Internal `chrome://extensions/` navigation was rejected by browser security policy. No alternate surface, raw CDP, or indirect navigation was used to bypass that restriction. Ordinary HTTPS job-page inspection succeeded afterward. |
| PUB-01 | [Official Autofill page](https://jobright.ai/job-autofill) | Publisher describes profile setup, application autofill and use of a tailored resume. This is a published claim, not an observed completed application. |
| PUB-02 | [Official product walkthrough](https://jobright.ai/blog/supercharge-your-job-search-with-jobright-autofill/) | Publisher describes per-role AI resumes, matching and tracking. Exact generated wording, score formula, editing controls, and attachment behavior remain unverified behind the profile gate. |

## Current code findings

| Area | Repository evidence | Implication |
|---|---|---|
| Existing AI tailoring | `src/lib/tailored-resumes/extension-content.ts`, `extension-task.ts`, `extension-service.ts`; `browser-extension/resume-workflows.js` | Reuse the 3.1.0 authenticated task flow, fact-ID validation, contextual evidence, exact-version DOCX and history. Do not rebuild this as a new AI integration. Current generated wording is selected source facts, not free-form AI rewriting. |
| Screening fallback guesses | `browser-extension/background.js`, near lines 288–315 | Missing experience defaults to 5; missing skills to full-stack development; missing notice to Immediately; unknown booleans become No. Remove these fallbacks before expanding autofill. |
| Generic autofill substitutions | `browser-extension/content.js`, near lines 1289 and 1319 | Missing country can become United States; current salary can substitute for expected salary. Unknown information must remain unknown. |
| Screening access and AI controls | `src/app/api/extension/ai-answers/route.ts` | Authenticates the extension but queries a candidate directly without the shared assignment/ownership check. Also calls the provider directly, outside the shared task budget flow, and parses answers without a strict response/evidence contract. This is a priority integration correction. |
| Screening controls | `browser-extension/content.js`, `fillAIScreeningQuestions` | Collects textarea/text inputs. No complete option-aware screening workflow across select/radio/custom controls is established. Generated answers are currently written without the proposed per-answer preview/undo. |
| General autofill | `browser-extension/content.js`, `autofillCandidate` | Already handles standard inputs/selects and some custom dropdowns, native value setters, page guards and mutation observation. Repeated work-history groups, broader shadow-root traversal and cross-frame forms need explicit adapter tests, not universal-support claims. |
| Application provenance | Existing capture snapshot/event modules and 3.1.0 review flow | Preserve the separate capture states, exact attached bytes, candidate/job freshness checks and recruiter-controlled final submission. |

An existing draft `../plans/2026-10-21-ai-jobright-extension-integration.md` is retained unchanged. Its Next.js 15, direct client API-key/Gemini and autonomous-agent proposals are not adopted by this brief. The actual repository uses Next.js 16.3.8 and an existing server-side OpenAI-compatible provider path. Browser API keys and a new provider dependency are unnecessary for the proposed work.

## Product requirements

1. A compact, collapsible right-side application panel with readiness states: candidate/source missing, facts need review, JD missing, AI unavailable, ready, processing, needs review, and reviewed. Account access and candidate-source choice are separate concerns.
2. One visible active candidate and one job identity at all times. A candidate or JD change invalidates active drafts, pending fill plans and extension-attached documents while retaining historical versions.
3. Connected mode reads only authorized reviewed candidates. Uploaded mode can import and match locally; AI uses authenticated server access without creating a portal candidate record. Processing disclosure remains visible. No browser-stored provider API key.
4. Do not guess missing employers, skills, dates, location/country, experience, compensation, sponsorship, authorization, availability, education, or demographic answers. Preserve 0 and false as explicit values; null is not false. Expected salary is a distinct field from current salary.
5. Default form filling is a deliberate recruiter action. Fill only supported facts or explicitly reviewed answers. Preserve manual edits by default. Present unresolved fields and reasons; offer per-operation undo when the field still contains the extension's value.
6. Treat text/select/radio/checkbox/date/custom combobox controls according to their semantics. Repeated work and education rows use stable group identity. Cross-origin frames require tested, explicitly scoped extension messaging; closed or inaccessible roots produce a manual-completion state.
7. Separate required/preferred coverage from AI advisory direct/transferable/missing judgments. Score the generated version being previewed. Missing facts remain gaps, not resume additions.
8. Retain the current source-backed summary/skill tailoring. Propose section-level rewriting only after its Jobright behavior is observed and an independently reviewable factual-diff design is approved; do not promise unsupported “zero hallucination” guarantees.
9. Store separate candidate/job/JD/version snapshots, exact resume bytes, and reviewed form answers. No fixed ten-application limit; provider quotas and storage limits remain visible.
10. Retain `started`, `in_progress`, `submit_attempted`, `submitted`, `confirmed`, `failed`. A submit click is not proof of submission; submitted is not proof of email confirmation. Final employer submission remains a human action.

## Scope and contract boundaries

This phase creates planning/evidence artifacts only. Preserve all existing uncommitted files. No authentication/OAuth redesign, database edits, provider configuration change, extension release or application submission occurs here.

Implementation will need an additive versioned screening-answer contract and durable screening task support to close the identified access/budget/evidence gaps. That includes a migration, shared candidate authorization and a backward-compatible response adapter; these are explicit proposed backend requirements, not frontend-only work. Existing resume generation, capture payloads and event-state contracts remain intact.

## Acceptance and unresolved observations

Local fixtures must prove unknown-value handling, exact candidate/job isolation, controlled-input persistence, repeatable groups, reviewed answer insertion/undo, exact-document attachment and capture state evidence. At least 25 distinct JDs must yield 25 distinct candidate/job snapshots without cross-assignment.

Live Jobright autofill, matching output, resume output/editing/download and tracking remain unverified until profile setup is completed by the user and those screens are available. There is no claim that an incomplete onboarding panel proves those features. The last provider diagnostic on 2026-10-20 reported a refused local gateway connection; implementation must recheck the actual processing environment rather than assume it is now healthy.
