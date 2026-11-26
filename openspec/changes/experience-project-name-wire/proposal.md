## Why

Experience handlers and the Supabase employment store exist. Treat the kind-aware wire rules as the contract to verify across every serializer and caller.

## What Changes

- Keep the SQL place label in `company`. Serialize project places as `name` and jobs as `company` at the TypeScript response boundary.
- In requests, prefer project `name` over legacy `company` and allow the legacy key as fallback. Preserve employment IDs and the existing persistence representation.
- Share request validation and response types across Next.js routes and consumers. Use the project label in the UI and keep mixed historical response compatibility where required.

Behavior requirements are in [experience bank](specs/experience-bank/spec.md).

Implementation references include [employment storage/service](../../../src/lib/candidate/experience.ts), [experience HTTP contract](../../../src/app/api/v1/me/experience/route.ts), [experience UI](../../../src/components/candidate-profile-workspace.tsx).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## Why

Portfolio projects have a **name**, not a company. The experience bank correctly stores that label in the `company` column (one “place” table), but the HTTP/TS wire still exposes `company` for `kind=project`, so Profile and API clients call a project a company.

## What Changes

- For `kind=project` employments on the experience API (and related assistant tool projections), expose the place label as **`name`** instead of `company`.
- Keep the Postgres column and Go field `Company` as storage — no migration.
- Jobs (`kind=job`) keep `company` unchanged.
- Accept `name` on write for projects; accept legacy `company` on write as an alias into the same field so existing clients do not break mid-rollout.
- Update generated TS types and Experience UI copy so projects show/edit a name, not “Company”.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `experience-bank`: kind-aware wire shape for project place label (`name` vs `company`).

## Impact

- `internal/experience.Employment` JSON (custom marshal/unmarshal or a thin wire DTO) and any handler/assistant paths that emit `company` for a place.
- `cmd/gen-contracts` / `web/src/lib/types.ts` (`ExperienceEmployment`).
- `ExperienceBankView` (and any edit forms) labeling.
- **Mildly BREAKING** for consumers that read `company` on project rows; write path stays compatible via alias.

</details>
