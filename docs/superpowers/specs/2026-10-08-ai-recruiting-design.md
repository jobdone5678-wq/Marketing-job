# Real data and AI recruiting design

Status: proposed for review; implementation has not started.

Revision 2026-10-08: prioritize contract jobs from public APIs; defer Firecrawl to a later release. Add a proposed follow-up for capturing recruiters' external application activity, without claiming that opening an application link proves submission.

## Intended outcome

Replace mock and demo behavior in the existing marketing portal with persistent records, real public job feeds, resume-based candidate intake, and evidence-based AI matching. Keep the current Next.js interface and Supabase foundation. Automatically process uploaded resumes and newly fetched jobs; let users review extracted profile details before saving and review generated submission packets before using them.

## Current evidence

- Next.js 16.3.8, React 19.2.8, Supabase Auth/Postgres, Zod 4; no AI SDK, resume processing pipeline, durable worker, or project test runner is configured.
- `src/lib/vendors.ts` is entirely sample data and process memory.
- `src/lib/submissions.ts` converts database failures and empty results into sample records and can report successful writes without persistence.
- `src/app/dashboard/data.json`, `src/components/chart-area-interactive.tsx`, candidate presets, settings defaults, and Add Board handlers supply static or fabricated data.
- Candidate forms and the SQL schema default factual fields to specific visa, salary, availability, education, and relocation values.
- Public GET integrations exist in `src/app/api/jobs/route.ts` and `src/app/api/greenhouse/route.ts`; lists are capped and jobs are not stored durably.
- `src/lib/matcher.ts` generates scores and pitches using keywords, invented defaults, and assumed authorization compatibility.
- Profile write policies and auth flows need explicit role/status protection. Candidates currently have SELECT-only self access.
- This directory is not a Git repository. The live database, deployment target, provider credentials, and production data have not been inspected.

## Architecture and decisions

Use authenticated Next.js Route Handlers for requests, Supabase Postgres for application records and a durable task table, private Supabase Storage for resumes, and a separate Node.js worker for long-running processing. The worker periodically schedules due sources and atomically claims queued tasks. This works while browser tabs are closed. Do not run unawaited jobs inside HTTP requests. A hosting provider must run the worker continuously; local development runs it alongside Next.js.

Use OpenAI Responses API with structured outputs through one server-only provider adapter. Keep the model in `OPENAI_MODEL`; choose a file-capable structured-output model available to the account during implementation and validate it with resume fixtures. Do not pin an unverified model name or price. PDF file inputs can use text and page images; DOCX inputs are text-based. Validate MIME/file signatures and bounds before sending files. Schema conformance does not guarantee factual accuracy: extract supporting snippets, validate them, and require user confirmation.

Use native Greenhouse/Ashby public job APIs in the initial release. These APIs cover configured company boards, not every public contract vacancy on the internet. Replace the current fixed company list with real validated sources selected for contract hiring. No Firecrawl credential, subscription, scraper implementation, or crawl scheduler is required initially. Preserve an adapter boundary for a later Firecrawl release; Firecrawl is never used for private resumes.

Normalize employment type to contract/full_time/part_time/internship/temporary/unknown and retain the original value plus supporting metadata/text. Default browse/recommendations to contract; temporary and unknown are separate opt-in filters, and users can switch to all jobs. Structured provider employment type takes precedence. With no structured type, explicit role-level description evidence can classify a contract; incidental mentions such as contract negotiation or working with contractors cannot. Conflicting evidence remains unknown with a warning. C2C/W2/1099 arrangement is a separate nullable attribute: a W2 role can be permanent, and a contract does not automatically accept C2C. Where structured type is absent, process/cache bounded AI classification once per changed job within the existing AI budget; unprocessed jobs stay unknown. Show gaps in source coverage rather than claiming universal contract-job search.

Deferred Firecrawl design: rendered careers content, same-site link discovery, deterministic JobPosting JSON-LD first, then validated AI extraction with bounded costs. The original crawl limits below apply only when that later release is enabled.

## Product behavior

1. A candidate uploads PDF or DOCX, sees processing status, reviews an extracted draft, fills unknown fields, and saves their profile. Recruiters can do the same for candidates they manage.
2. Extract name, contact information, skills, employment entries, education, certifications, and explicit locations. Keep work history structured. Calculate total experience only from sufficient dates, merge overlapping intervals, and label the result as estimated. Partial dates remain partial; job end dates cannot imply availability.
3. Visa, sponsorship, salary, work preferences, and availability are unknown unless explicitly provided; resume mentions still require confirmation. Boolean facts become nullable and use Yes/No/Unknown controls. A missing full name requires user input before saving.
4. Re-uploading creates a new draft/version and a field comparison. Manually confirmed fields are never overwritten automatically. Duplicate contact matches produce a review warning, not automatic merging.
5. Admins configure source company, native adapter type and board slug. Validate a source before marking it active. Persist configuration and source health. Manual refresh and scheduled refresh use the same ingestion service. Custom careers URL scraping is deferred.
6. Jobs retain source identifiers, exact application URLs, descriptions, provenance, first/last seen timestamps, salary units/currency when explicit, and active/closed/stale state. The UI shows last checked time and the actual source health instead of unconditional Live badges.
7. A successful complete feed snapshot can close missing jobs. Failed, partial, truncated, or incomplete scraped snapshots cannot. For scraping, close only after the detail page explicitly confirms closure or two complete successful snapshots omit the posting. Missing data is unknown, not Remote or Full-time by default.
8. After candidate confirmation, shortlist active jobs by confirmed target titles, skills, and explicit preferences. User can choose up to 20 jobs for AI comparison. New or changed jobs can schedule comparisons only within the same budget. Persist explanations, evidence, missing requirements, and unknowns. Coverage equals round(100 * met requirements / all validated requirements), including unknowns in the denominator; no validated requirements yields null. Scores represent requirement coverage, not placement probability. Explicit constraint conflicts appear separately and cannot be cancelled by skill overlap.
9. Generate factual pitch and resume-summary drafts from confirmed facts. RTR is a request template, never evidence that consent exists. Track generated packets as drafts; Applied means a user recorded an actual application or an integration later supplied a receipt.
10. Dashboard and analytics derive from saved records and time-series ingestion events. Empty databases show honest empty states; failed reads show errors. Settings actually persist and integrations without credentials show Not configured.

## Limits and operational requirements

- One shared recruiting workspace, consistent with the current schema: active recruiters/admins access workspace candidates; candidates access only their own records and resumes. New recruiter signups are pending until an admin approves them. Existing legitimate active staff are preserved.
- Server checks session and database profile role/status for every protected action; auth metadata never grants privileges. Self-edit cannot change role, status, assignment, or ownership. Staff approval uses a restricted admin operation.
- Resume limit: 10 MiB, PDF/DOCX only, maximum 20 PDF pages; reject encrypted, corrupted, unsupported, or oversized files with a useful error. Delete provider-uploaded copies after processing and use `store: false` where supported; do not claim this removes provider abuse-monitoring retention.
- Private resume bucket with ownership policies; downloads require authorization and signed URLs expire after 5 minutes. Show consent to third-party AI processing before upload. Logs contain task IDs/status/cost metadata, not resume text or contact details.
- Source defaults: sync every 30 minutes, staff-adjustable to 15/30/60 minutes; one active sync per source. Scraping is restricted to staff-configured public careers domains/paths, same-site discovery, 100 pages per run and 500 pages per workspace per day. Honor robots/site access rules; do not bypass login or access challenges. Block private-network URLs and validate redirect targets.
- Task types: resume_extract, source_sync, candidate_match, packet_generate. State: queued/running/succeeded/failed/cancelled. Atomic database claiming with expiring leases, heartbeat and deduplication keys; retry transient failures up to 3 attempts with backoff. Provider outages, refusals, invalid results and exhausted quotas must remain visible.
- Default daily provider budgets: 100 AI processing calls across extraction/matching/packets and 500 scraped pages, adjustable by admin. Reserve allowances atomically before calls; record attempts including failures. Cache by file/content hash, candidate version, model and prompt/schema version. No AI calls for every render or every possible candidate/job pair.
- All AI input is untrusted data. Resume/JD instructions cannot trigger tools, network requests, account changes, or unsupported factual claims. Sanitized job descriptions remove scripts and unsafe links.
- Migrations are additive for existing databases and preserve user-created records. Remove future demo seeds from bootstrap SQL. Existing suspected demo records require inventory/export and identity-based review before any deletion; matching a person's name is insufficient.
- Read installed `node_modules/next/dist/docs/` guides before implementation. API/worker secrets never use NEXT_PUBLIC names.

## Data additions

Add `vendors`, `vendor_contacts`, `workspace_settings`, `job_sources`, `jobs`, `source_sync_runs`, `candidate_documents`, `resume_extractions`, `candidate_job_matches`, `submission_packets`, `background_tasks`, `provider_usage`, and `audit_events`.

Candidate records gain version and confirmed structured work/education history; factual boolean columns become nullable and fabricated defaults are removed. Submissions gain nullable `job_id`, `vendor_id` and candidate-consent reference plus a Draft status. Jobs use a unique source/external-ID key and a normalized canonical-URL index. When a public feed omits IDs, use a hash of the normalized provider job URL as its stable adapter ID. Ashby postings marked isListed=false are excluded from public browse/search. Cross-source equivalents are linked by URL where exact, not merged on similar titles. AI match results are unique per candidate/job versions, model and prompt/schema version.

## Delivery order

1. Reliable foundation: remove demo behavior, protect privileges, persist vendors/settings, migrate unknown fields, and show honest states.
2. Resume intake: private uploads, durable worker, validated extraction, field review and profile persistence.
3. Contract public jobs and AI: persisted native feeds, scheduler, evidence-based matching and draft packets. Firecrawl is deferred and is not a dependency for shipping this milestone.

## Proposed follow-up: automatic application capture

Purpose: avoid making recruiters re-enter candidate/job details across large forms after applying outside the portal. This is a proposed separate integration, not part of the current native-job ingestion implementation.

Start every portal-launched application with a candidate/job/recruiter-linked application intent and exact external URL. Open the external form; store a draft immediately. Link-open events never mark a record Applied. A compact Applications view presents core fields (candidate, job/company, date, status), with vendor/rate/interview fields shown only when needed. Recruiter identity is server-assigned. A one-click recruiter confirmation is the fallback when no external evidence is available.

For browser-based submissions, an optional Chrome/Edge-compatible extension runs only on explicitly permitted supported job sites. Retain candidate/job context from the portal or a candidate selector; capture non-sensitive job/form metadata and observable confirmation evidence. Known confirmation pages or validated receipts can create a confirmed application event; a click on Submit, an ambiguous success message, or an unknown site produces Needs review. Do not collect passwords, account cookies or broad browsing history. Site-specific adapters and validation are required; extension permissions are not a guarantee of support for every site.

For email-based submissions, a recruiter-authorized mailbox connection can read relevant sent messages and confirmation replies, or a dedicated inbound address can accept deliberately forwarded receipts. Mailbox updates alone are not application evidence. Parse candidate/job/company/vendor/date and receipt identifiers; deterministic correlation and evidence validation decide whether to record an application or ask for review. An outbound vendor pitch is outreach, not proof of submission to an end client. If confirmations arrive only in a candidate mailbox, require that mailbox's authorization or forwarded receipts.

Persist application_events with source event IDs, provider receipt IDs, intent linkage and evidence references. Deduplicate replayed extension events/email messages and correlate evidence from different channels to one application intent. Separate event idempotency from business duplicate detection: an actual repeated application may need a distinct event. Ambiguous candidate/company/job association remains in a small review queue. Status automation for rejection/interviews can follow only after this capture layer proves reliable.

The user confirmed that recruiters apply through both websites and email. Plan both capture channels against one event/correlation service: portal-linked intent and compact tracker first, then a supported-site browser extension and an authorized mailbox adapter. Mailbox provider selection (Gmail/Outlook) happens when that follow-up is designed; do not build both provider adapters without knowing what the team uses. No Firecrawl dependency exists for either approach. Do not send mail or submit applications as part of this capture feature.

Each milestone must work independently. Automatic external applications, email sending, private social-profile scraping, and status changes inferred without evidence are outside this first release; they need separate integrations and explicit delivery scope.

## Acceptance criteria

- With an empty database, no sample candidates, vendors, submissions, jobs, metrics or successful fake settings saves appear.
- Failed writes never produce a success toast or an invented record; saved records survive reload and server restart.
- A PDF/DOCX upload yields a reviewable draft with source evidence. Missing facts stay unknown. Candidate A cannot access candidate B's resume or extraction.
- A configured real ATS feed yields complete paginated/bounded snapshots with stable identifiers and descriptions. Default discovery prioritizes evidence-backed contract roles; unknown and permanent roles are not falsely labeled contract. Unsupported careers-page scraping remains deferred.
- Failed source sync does not close existing jobs; stale jobs show freshness accurately. Repeated syncs and retried worker tasks do not duplicate records.
- Matching has no generous baseline, no invented achievements, no automatic compatibility assertion, and no fabricated consent or application success.
- Automated extraction/source/match work continues with all browser tabs closed while the worker is running.
- Type checking, lint, build, database permission tests, integration tests and user-flow smoke tests pass; live provider checks are reported separately from test fixtures.

## Official references checked on 2026-10-08

- [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Firecrawl scrape](https://docs.firecrawl.dev/features/scrape)
- [Firecrawl crawl](https://docs.firecrawl.dev/features/crawl)
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)
- [Ashby public posting API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase Cron](https://supabase.com/docs/guides/cron) (alternative deployment scheduler; not required for the selected worker)
- [Firecrawl pricing](https://www.firecrawl.dev/pricing) (free allowance plus paid plans; deferred)
- [Chrome extension content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Gmail mailbox push notifications](https://developers.google.com/workspace/gmail/api/guides/push)
