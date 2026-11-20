# Resume-to-application flow audit

**The happy path is implemented. The flow needs fixes before release.** The highest-risk issue is that resume parsing can turn inferred screening answers into confirmed candidate facts before review. Application tracking validates receipts and handles some replays. Separate writes can leave the two tracking tables out of sync. Both requested dashboard views subscribe to updates. Immediate delivery has yet to be verified against a deployed environment.

Reviewed on 20 November 2026 against the current workspace at `0d99b97`, including existing modified and untracked source. The attached diagram supplied the expected behavior. The workspace packaging script selects `jobright_extension/`, which is the primary extension for this audit. `extension/` is a separate WXT build and is called out where it differs.

## Stage-by-stage assessment

| Stage in the diagram | Assessment | What the workspace implements |
| --- | --- | --- |
| 1. Upload, parse, review, persist | **Weak confirmation boundary** | `/dashboard/candidates` mounts `ProfileView`, which uploads to `/api/resumes/parse` and writes through an authenticated `/api/jobseeker/resume` endpoint. The candidate can edit contacts, links, screening and demographics. The upload handler saves immediately, and the endpoint sets `provenance_status` to `confirmed` on create and update. [Profile page](src/app/dashboard/candidates/page.tsx#L3) · [Upload and save](src/components/profile/ProfileView.tsx#L255) · [Candidate write](src/app/api/jobseeker/resume/route.ts#L202) |
| 2. Extension loads profile and autofills | **Good field coverage, weak data provenance** | The packaged extension requests `savedOnly=true` and refreshes the selected profile when Autofill is clicked. Local tests cover native and custom checkboxes, radios, dropdowns, multistep forms, and manual screening and demographic mappings. The saved-only endpoint fails its contract test and returns fields beyond the intended projection. The tested interaction is candidate-initiated autofill. [Panel](jobright_extension/panel.js#L792) · [Profile API](src/app/api/extension/candidates/route.ts#L170) · [Manual fields tests](tests/manual-fields-autofill.test.mjs) |
| 3. Observe submission and set Applied | **Useful receipt checks, inconsistent persistence guarantee** | The packaged extension sends a tracked portal receipt to `/api/extension/events` when it has an intent. Outside receipts use `/api/webhooks/application-submitted`. That webhook delegates to the auto-submit handler with extra receipt checks. Manual attestation takes the auto-submit path. An inside application updates an existing linked outside row when applicable. The writes have separate commit and failure boundaries. [Extension routing](jobright_extension/background.js#L415) · [Webhook alias](src/app/api/webhooks/application-submitted/route.ts#L5) · [Receipt and attestation rules](src/app/api/extension/auto-submit/route.ts#L49) |
| 4. Update both dashboard views | **Wired, with recovery gaps** | My Applications and the dashboard's “Applications you applied to” panel use the shared hook. It listens to both tables and schedules a refetch after 50 ms. The overview application list reads a deduplicated union of the two stores. Realtime delivery also depends on the deployed publication, permissions, and connection status. [My Applications](src/app/dashboard/submissions/page.tsx#L126) · [Overview panel](src/components/applied-applications-panel.tsx#L33) · [Realtime hook](src/hooks/use-application-realtime.ts#L19) · [Application list](src/lib/jobs/applications.ts#L56) |

## Findings by priority

### P1 · Resume extraction can publish unreviewed screening facts

When the parser cannot identify authorization countries, it supplies `['us']`. It also sets `age_18_or_older` to `yes`. `ProfileView` merges the parsed screening object over the candidate's current answers, so parser defaults and blanks can replace prior edits. The upload starts an immediate server save inside the updater and the updater schedules a second, debounced save. The server treats a US selection as authorization and synthesizes a `Citizen / Permanent Resident` visa label from it. Work authorization alone does not establish that category. The endpoint marks both new and existing profiles confirmed. The extension can therefore consume these values without the explicit review shown in the diagram. [Parser defaults](src/lib/profile/resume-parser.ts#L537) · [Upload merge](src/components/profile/ProfileView.tsx#L267) · [Visa mapping](src/app/api/jobseeker/resume/route.ts#L139) · [Confirmed write](src/app/api/jobseeker/resume/route.ts#L221)

**Acceptance criteria.** Parse into a reviewable draft. Keep unknown eligibility answers blank. Preserve manual edits on re-upload and require explicit confirmation of eligibility and demographics before they become eligible for autofill. Cover a resume with no eligibility statements and a second upload against an already reviewed profile.

### P1 · The saved-only autofill endpoint violates its own contract

The failing test expects the endpoint to omit an email stored only on the candidate row. The response includes `account@example.test`. The implementation spreads the selected candidate row and the entire `confirmed_facts` object before returning the result. The same projection also forwards `raw_text` when present. The test stops at the email assertion, so the raw-text issue is established by source inspection. This widens the data sent to the extension and can supply values the candidate did not intentionally confirm for autofill. [Projection](src/app/api/extension/candidates/route.ts#L170) · [Failing test](tests/application-lifecycle.test.mjs#L672)

**Acceptance criteria.** Return an explicit allowlist of confirmed autofill fields and required metadata. Preserve explicit `false` and supported reusable answers. Keep raw resume content and account-only fields outside that response. Test the actual parsed-profile save → saved-only read path, including explicit field clearing.

### P1 · Application status can diverge after a partial write or concurrent capture

For an outside receipt, `job_submissions` is written before the `outside_jobs` upsert. For a portal intent, the browser-event RPC promotes the submission before the handler links or updates applicable outside rows. A failure in the second step leaves the committed submission visible while the outside record stays stale. The non-receipt branch logs outside write errors and can still return success. Its insert also omits `capture_owner_id` from the payload despite searching by owner, weakening repeat lookup and allowing repeated unowned outside rows where no owned row exists. For receipts, the `job_submissions` upsert deduplicates the same event ID. Separate events for the same posting can both pass the preceding lookup and create separate submissions, while the outside table upserts to one owner-and-URL row. [Portal event](src/lib/capture/server.ts#L119) · [Outside submission lookup](src/app/api/extension/auto-submit/route.ts#L247) · [Event upsert](src/app/api/extension/auto-submit/route.ts#L313) · [Outside write and error handling](src/app/api/extension/auto-submit/route.ts#L413)

**Acceptance criteria.** Commit the authoritative application transition and applicable outside projection in one transaction, or persist a durable reconciliation task in that transaction. Define a database-backed application identity that covers concurrent events and intentional reapplications. Keep receipt and manual attestation identifiable. Verify failure between writes, same-event replay, and concurrent distinct events for one posting.

### P2 · Profile autosave can lose newer edits or present local data as synced

The upload starts both immediate and debounced saves, but older requests can still finish after newer ones. The server derives a new version from a read and updates by candidate ID without checking that version. A delayed profile fetch on mount can also replace newer local edits. On server failure the UI uses the same `saved` state with a “Saved locally” message, although the extension fetches from the server. A few critical fields, such as email and phone, also use `undefined` for blank updates, preserving their database-column values when the candidate clears them. [Load and autosave](src/components/profile/ProfileView.tsx#L146) · [Server save result](src/lib/profile/profile-store.ts#L249) · [Server version and blank value handling](src/app/api/jobseeker/resume/route.ts#L202)

**Acceptance criteria.** Serialize client saves or make them version-conditional. Preserve dirty state during initial load, honor explicit clears, and expose whether the extension can see the latest version. Test edits while a prior save or initial load is delayed.

### P2 · Receipt capture and dashboard refresh still rely on short-lived delivery paths

The packaged extension retries a receipt from the live page up to five times. Its tracking context is kept in browser session storage, and the inspected receipt path has no durable pending-delivery queue. Closing the receipt tab or restarting the browser before delivery can lose the automatic capture. The application hook refreshes on table changes, subscription success, or an extension message. It has no fallback for a subscription that stays unhealthy. The packaged extension's message relay also matches paths beginning `/dashboard/`, which excludes the exact `/dashboard` overview route. Realtime can still refresh that route when connected. [Receipt retry](jobright_extension/application-confirmation.js#L78) · [Tracking and relay](jobright_extension/background.js#L408) · [Subscription and refetch](src/hooks/use-application-realtime.ts#L26)

**Acceptance criteria.** Preserve pending receipt delivery across an extension restart, surface a sync failure or retry state, and include the overview route in the relay. Verify both views with a stale or disconnected Realtime socket and define a measurable update target. Check that existing rows stay visible while refetching.

### P2 · The resume parsing route has no application-level authentication gate

The middleware passes API requests through for route-level authentication. `/api/resumes/parse` reads multipart data and invokes the parser without checking a session. The 15 MB limit is checked after multipart decoding. The route performs potentially expensive PDF or DOCX processing. No deployment-level protections were verified. [API middleware](src/lib/middleware.ts#L12) · [Parse route](src/app/api/resumes/parse/route.ts#L7)

**Acceptance criteria.** Authenticate before decoding an upload, enforce upload limits at ingress, and bound per-account parsing work. Verify unauthenticated requests are rejected before parsing and that oversized or unreadable files produce predictable errors.

## What held up in local checks

- The packaged extension refreshes the selected profile immediately before autofill. Fixture tests exercise native and custom controls, candidate isolation, and wizard transitions. Receipt tests cover existing portal drafts, embedded Ashby, LinkedIn Easy Apply, replay of an external receipt, and manual attestation. [Autofill entry point](jobright_extension/panel.js#L792) · [Lifecycle suite](tests/application-lifecycle.test.mjs)
- The webhook requires receipt and posting URLs plus a stable UUID. The handler checks candidate ownership, success evidence, and receipt-to-posting matching. The portal intent RPC locks the intent and submission and records each event key once per intent. [Webhook checks](src/app/api/extension/auto-submit/route.ts#L49) · [Event RPC](supabase/migrations/20261111000100_candidate_only_roles.sql#L311)
- Source migrations publish both tracking tables to Supabase Realtime. The local database policy test passed for candidate-owned Outside Jobs reads. The overview deduplicates by catalog job ID or normalized URL. [Realtime publication](supabase/migrations/20261106000100_realtime_submissions_and_access.sql#L9) · [Outside Jobs policy test](tests/application-lifecycle.test.mjs#L729) · [Overview deduplication](src/lib/jobs/applications.ts#L95)

## Release verification

1. Confirm a PDF and DOCX profile through the deployed candidate screen. Verify that pending edits survive a failed save and that the extension consumes exactly the confirmed version and eligible fields.
2. Run one inside intent and one outside ATS submission on approved fixtures. Keep My Applications, Dashboard Overview, and Outside Jobs open during capture. Verify the expected status, application date, link, and count in each view.
3. Repeat with a failed outside write, duplicate and concurrent receipt delivery, an extension restart, and a disconnected dashboard. Require recovery without duplicate rows or a stale status.
4. Identify the shipped extension first. The root packager selects `jobright_extension/`. The WXT build handles its own application monitoring and uses the shared saved-only API. Apply the same release checks separately if both are distributed. [Root packager](scripts/pack-extension.mjs#L20) · [WXT client](extension/lib/nextkinhr.ts#L73) · [WXT application monitoring](extension/lib/applicationSync.ts#L136)

## Verification run

- Root `npm run typecheck` passed.
- Root `npm test` reported **62 passed, 3 failed**. The saved-only endpoint assertion failed on the account email. The live Greenhouse and Lever tests stopped before navigation because Playwright could not find Chromium at the sandbox's default path.
- The resume parsing tests exercise deterministic text extraction. The browser-to-route PDF/DOCX upload and the full path through deployed Supabase Realtime remain unverified. This audit did not submit applications or change application source.
- The separate WXT extension passed TypeScript and **403 tests across 37 files**. The `pnpm` wrapper could not resolve its pinned version because registry DNS was unavailable, so both checks used the installed tools directly.
