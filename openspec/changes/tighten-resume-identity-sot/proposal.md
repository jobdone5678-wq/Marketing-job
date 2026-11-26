## Why

Next.js has resume and contact handlers and an Experience Bank. The three-layer precedence, CV reset/heal behavior, and project wire shape are parity contracts for consumers.

## What Changes

- Apply owned contacts as a block, otherwise use current extract contacts, otherwise use eligible provisional contacts. Keep file-owned semantic fields current-stamp-only and split jobs from projects.
- Keep reset and heal as distinct composition directions. Reset takes the selected identity layer. An owner-only single-document read may persist a bounded, fill-empty repair under the imported CV contract. Preserve body fields and existing non-empty output during heal.
- Keep a single storage label for project and job places and use the kind-aware TypeScript wire shape at the handler boundary.

Behavior requirements are in [cv builder](specs/cv-builder/spec.md), [cv tailoring](specs/cv-tailoring/spec.md), [experience bank](specs/experience-bank/spec.md), [resume structured profile](specs/resume-structured-profile/spec.md).

Implementation references include [resume read model](../../../src/app/api/v1/me/resume/route.ts), [owned contact writes](../../../src/app/api/v1/me/contacts/route.ts), [identity composition](../../../src/lib/candidate/resumeextract.ts), [project and job history](../../../src/lib/candidate/experience.ts), [current export surface](../../../src/lib/candidate-resume-export.ts).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## Why

PR #1737 already unifies profile identity, banked experience, and CV seeding, but the rules live as overlapping readers (`Structured`, `ProfileReadForUser`, `ProvisionalContacts`, `StructureForSeed`, `bankedSeeder.Structured`, `applySeedContent`, `reseedBaseIfStaleVsUpload`, `healRecordHeader`). Review cannot tell which layer is allowed to influence seed vs profile, and the archived main specs still say a stale structure is “absent.” That gap is the merge-blocking concern, not another feature.

## What Changes

- Lock one explicit **source-of-truth table** for résumé identity: current structured extract, provisional contacts (stale/pending blob, identity only), and candidate-owned contacts (survive résumé delete). Each reader MUST implement that table rather than inventing a local mix.
- Add a concise **architecture note** (package AGENTS, not a new subsystem) that names those three layers and when each may influence Profile, seed, heal, and reset.
- Document the experience **project wire** (`name` + `link` for `kind=project`; `company` remains jobs-only). Accept legacy `company` on inbound project JSON. Not a new field — a published contract.
- Keep **heal-on-GET** for empty CV header fields, but justify it as keep-first fill (never overwrite, never touch body) and lock it with the existing integration cases plus any missing owner-scoped GET paths.
- No rewrite of contacts, projects, seed composition, experience tools, or coverage CI. Those stay as shipped on the branch. No gold-plated state-machine framework.

## Capabilities

### New Capabilities

<!-- none — this locks existing résumé / seed / bank surfaces -->

### Modified Capabilities

- `resume-structured-profile`: Replace “stale structure is absent” with the three-layer identity model; candidate-owned contacts persist across résumé delete; parse status is pending / ok / failed.
- `cv-tailoring`: Seed composition, usable-seed, reset vs heal header merge, and stale-vs-upload refresh follow the same table.
- `cv-builder`: Owner GET of a CV MAY persist a keep-first header heal; list/PDF/other GETs MUST NOT write.
- `experience-bank`: Project employments serialize `name` (not `company`) and `link`; inbound accepts `name` or legacy `company`.

## Impact

- `internal/resume` — one documented decision table; `internal/resume/AGENTS.md` (new) is the architecture note.
- `internal/handler` — `cv_seed.go`, `cv_seed_apply.go`, `cv_header_heal.go`, `cv_reset.go`, `resume.go` comments and any reader that still diverges from the table.
- `internal/experience` — wire docs on `employment_json.go` / `AGENTS.md`; no storage rename (`Company` stays the place label).
- `web/` — only if generated TS types or profile comments still imply `company` on projects.
- Tests already cover most edges; add only cases that lock the table (stale seed is contacts-only + owned overlay; GET heal writes once; project wire round-trip).
- Migrations already exist on the PR. This change does not add columns.

</details>
