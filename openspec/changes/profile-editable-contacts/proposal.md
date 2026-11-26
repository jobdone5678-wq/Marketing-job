## Why

Authenticated contacts and resume routes exist. The imported parse-retry behavior, full seed composition, and every pending-state rule require parity verification.

## What Changes

- Store candidate-owned contact edits separately from the file-owned extract in Supabase. Route all writes through ownership checks and preserve deliberate clearing. Seed empty owned contacts only under the stated extraction rule.
- Use typed stamp and parse-status fields for current, pending, and failed. Keep error details safe for display. Where retry is implemented, enqueue the current uploaded document and reject stale writes.
- Compose the seed using candidate contacts plus eligible semantic and project data, then retain the narrower fill-empty behavior for existing CV documents.

Behavior requirements are in [candidate contacts](specs/candidate-contacts/spec.md), [cv tailoring](specs/cv-tailoring/spec.md), [experience bank](specs/experience-bank/spec.md), [resume structured profile](specs/resume-structured-profile/spec.md).

Implementation references include [candidate-owned contacts API](../../../src/app/api/v1/me/contacts/route.ts), [resume status and upload](../../../src/app/api/v1/me/resume/route.ts), [extract and identity composition](../../../src/lib/candidate/resumeextract.ts), [profile editing](../../../src/components/candidate-profile-workspace.tsx), [durable parse work](../../../docs/agents/workers.md).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## Why

Profile contacts and links are read-only parses of the uploaded CV, so wrong links (or a stuck extract) leave the candidate with no fix short of re-uploading — and while `structure_pending` is true, provisional reads strip summary, skills, and projects, so tailor bootstrap / stale-base refresh can open a CV missing those sections even when a superseded parse or the bank still knows them.

## What Changes

- Introduce **candidate-owned contacts** (name, email, phone, location, links) that the Profile tab can edit without a re-upload; extract only **fills empty** owned fields (hand edits win unless the user explicitly replaces from CV).
- Expose **parse status** on the résumé meta surface (`current` / `pending` / `failed` + short safe reason) with a **Retry parse** action; Profile shows this instead of an endless “still being parsed” state.
- Allow **editing project employments** (name, link, dates) on the Experience bank UI, using the existing employment write API.
- Fix **tailor / base seed composition** so summary, skills, and projects are not dropped when the structure stamp is pending: seed body sections from the current structure when stamped, otherwise from the last stored structured blob for those file-owned fields (while contacts come from owned contacts), and keep bank projects in `projects[]` as today.
- Update Profile UI: editable contacts + status/retry; Experience UI: edit project metadata.

## Capabilities

### New Capabilities

- `candidate-contacts`: Candidate-owned contact block, edit API, seed/heal/Profile consumers, extract fill-empty policy.

### Modified Capabilities

- `resume-structured-profile`: Parse status on résumé meta; Profile is no longer contacts-read-only-only; retry extract; seed may use superseded body sections when pending.
- `cv-tailoring`: Base/tailor seed and stale-base refresh MUST carry summary, skills, and projects when any of those exist on the seed composition (owned contacts + structure/bank), including while structure is pending.
- `experience-bank`: SPA (and wire clarity) for updating project employment fields the API already allows.

## Impact

- `internal/resume`, `internal/handler/resume.go`, `me_profile` / new contacts handlers, `cv_seed` / `bankedSeeder`, `cv_header_heal`, migrations for owned contacts + optional extract status
- `web` Profile + ExperienceBankView + API client
- `cmd/backfill-resume-structured` remains the ops reconciler; Retry reuses the same extract path
- No change to the stamp-equality rule for “current structure”; owned contacts and pending-body seed are the escape hatches

</details>
