# NextKinHR Recruiting Copilot 3.4.3 — targeted remediation

Production portals covered by this release: Workday (`*.myworkdayjobs.com`, `*.myworkdaysite.com`),
Greenhouse (`job-boards.greenhouse.io`, `boards.greenhouse.io`, EU hosts), Lever (`*.lever.co`)
and Ashby (`jobs.ashbyhq.com`, including embedded frames). Autofill continues to run only on
supported, non-blocked HTTPS portals; no local/test portal was added to the runtime gate.

## Candidate profile integration
- `panel.js buildScopedProfile()` now preserves the confirmed facts the mapper already supports:
  `community_memberships`, `protected_veteran`, `military_service`, `current_military_service`,
  `preferred_work_location`, `preferred_office_location`, `relocation_destinations`,
  `salary_currency`, `salary_period`, `compensation_type`.
- The trusted review policy is now explicit (`requireCandidateReview: true`) in both the panel
  scoped profile and the content-script engine, so it also applies to wizard continuations that
  reload a fresh backend profile. Consequential mappings always go to candidate review.
- Backend profile storage (`/api/jobseeker/resume`) accepts and bounds these confirmed facts from
  `confirmed_facts` edits; `/api/extension/candidates?savedOnly=true` now serializes them along
  with `intended_work_country` to both the panel and the wizard continuation.

## Emergency policy
- Expired ACTIVE policies still degrade to legacy mode.
- Explicit off decisions (global kill switch, per-site kill switch/mode, `disabledSites`) are sticky:
  they remain blocked until a fresh, validated remote configuration replaces the cached entry.
- `siteRulesKillSwitch` / per-site `killSwitch` were added to the remote-rule schema allowlist so a
  trusted policy can actually deliver them. The unsafe site-rules test was corrected and expanded.

## Veteran / community semantic safety
- Ordinary `veteran_status`/military facts no longer select protected- or disabled-veteran options.
  Classification must come from its own confirmed fact.
- Community matching rejects negated selections ("Not a veteran") and negative options, preserving
  option polarity instead of rewriting them to a positive category.

## Searchable location dropdowns (production reliability)
- Fixed delays replaced by bounded, condition-based waits driven by DOM mutations and option
  presence; country/location plans use a 3500 ms bound.
- Committed display value is verified after selection (typed search text is not accepted as a fill).
- React fiber onChange/onBlur is invoked for Workday `data-automation-id` controls, and the
  Workday async typeahead search is triggered via the component's own key handler.
- Dependent controls replaced by a re-render are rediscovered by stable question id before
  readback; verification follows the live DOM.

## Release blockers
- FAILED and PENDING_VERIFICATION confirmation events are recorded as `failed` /
  `submit_attempted` observations instead of being discarded; they do not mark an attempt reported.
- A matching confirmation URL alone is no longer sufficient evidence: visible, job-specific
  confirmation text is required on Workday, Greenhouse, Lever, Ashby, SmartRecruiters and generic
  confirmation routes.
- Availability, transportation and travel screening questions can no longer be answered by AI.
  Explicitly reviewed saved answers may still be reused.
- Automatic submission remains opt-in and disabled by default.

## Tests / verification
- `node tests/mapping.test.js`: 284 passed, 0 failed.
- `node tests/site-rules.test.js`: all passed (sticky-block cases included).
- `node tests/integration.test.js` (new): 15 passed, 0 failed — real `buildScopedProfile` source,
  `planFill`, the real field writer, delayed/asynchronous options, committed readback and a
  too-short-wait negative case.
- `node --check` passed for every changed JavaScript file.
- Browser-level tests against live employer accounts were not run (require employer credentials and
  a real application); remote-config delivery must be deployed to production before the new fields
  reach installed extensions.
