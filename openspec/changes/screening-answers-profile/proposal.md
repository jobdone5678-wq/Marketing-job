## Why

The typed screening service, profile API, and extension autofill profile exist. The upstream chat tool remains a requirement for any assistant surface that implements it.

## What Changes

- Use one owner-scoped Supabase row for optional typed facts and a TypeScript schema for validated partial writes and explicit clears. Preserve salary units, country codes, and the restricted consent semantics.
- Share validation across manual writes and any assistant tool. Only facts the candidate explicitly states become confirmed truth. Keep demographic preferences independent of reusable screening answers.
- Emit a narrow confirmed extension profile. Map factual answers through the existing grounding and country-context checks, and keep unsupported answers unresolved.

Behavior requirements are in [extension autofill](specs/extension-autofill/spec.md), [screening answers](specs/screening-answers/spec.md).

Implementation references include [typed screening validation](../../../src/lib/ingest/screeninganswers.ts), [screening API](../../../src/app/api/v1/me/screening-answers/route.ts), [extension projection](../../../src/app/api/v1/me/autofill-profile/route.ts), [separate reusable Answer Bank](../../../src/lib/candidate/answerbank.ts), [factual autofill validation](../../../src/lib/ai/grounded.ts).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## Why

The same handful of screening questions repeat across ATS application forms — work
authorization, visa sponsorship, salary expectations, notice period, age confirmation,
willingness to relocate — and today's autofill profile has nothing to offer for any of
them, because it is assembled entirely from the CV and a résumé never states these facts.
A query against prod `apply_forms` (443k captured forms across Greenhouse, Ashby, Workable,
Lever, Recruitee) confirms these six question types are the dominant repeat, once standard
contact fields and demographic/EEO questions are excluded. Candidates answer them by hand on
every application; capturing them once removes that repetition.

## What Changes

- Add a new candidate-owned store of screening answers: work authorization / eligible
  country, visa sponsorship needed, salary expectations, notice period, 18+ confirmation,
  and willingness to relocate. Each field is independently optional — a candidate who
  skips one still has the rest available.
- Add a manual edit surface so the candidate can view and set these answers themselves,
  the same way they edit other profile data.
- Add an assistant tool so the in-app assistant can also set or update these answers
  conversationally, following the same candidate-stated-only rule `internal/experience`
  already enforces for provenance (only what the candidate themselves asserts may be
  written or surfaced back; the model may never invent a screening answer).
- Extend the autofill payload the browser extension and its agent read
  (`/me/autofill-profile`, `internal/autofillagent`) to also carry these fields, so the
  extension can fill matching screening questions on real application forms — not just
  identity fields as today.
- Out of scope for this change: wiring these answers into `internal/hardconstraint`'s
  job-compatibility blockers or match-analysis scoring. The candidate side of a visa check
  does not exist yet either, but connecting the two is a deliberate follow-up, not part of
  this change.

## Capabilities

### New Capabilities
- `screening-answers`: the candidate's own stated answers to the six recurring ATS
  screening questions — storage, validation, manual edit, and assistant-driven edit.

### Modified Capabilities
- `extension-autofill`: the autofill payload's scope changes from identity-only (name,
  contact, links) to identity + screening answers, so the extension can fill both kinds of
  field from one assembled block.

## Impact

- New Go package + table for the screening-answers domain (owner-scoped, `user_id` keyed,
  distinct from `internal/userprofile`'s search/targeting preferences, `internal/experience`'s
  evidence bank, and `internal/resumeextract`'s CV-derived data — none of those are the
  right home, per their own documented boundaries).
- `internal/handler/autofill_profile.go`: `autofillProfile` gains the new fields.
- `internal/autofillagent`: the `Profile` map gains new keys; the planner needs to
  recognize screening-style questions (yes/no, salary, date) alongside identity fields.
- `internal/assistant`: a new tool for conversational edit of screening answers, registered
  the way other assistant-writable domains are.
- Web: a manual-edit surface for the new fields (profile page extension or a new section —
  decided in design).

</details>
