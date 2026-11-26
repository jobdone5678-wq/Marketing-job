## Current-stack tasks

Experience handlers and the Supabase employment store exist. Treat the kind-aware wire rules as the contract to verify across every serializer and caller.

### Verification

- [ ] Verify project and job round trips, legacy project inputs, conflicts, and empty-label behavior.
- [ ] Check the candidate UI’s project label against the serialized payload.

Implementation references include [employment storage/service](../../../src/lib/candidate/experience.ts), [experience HTTP contract](../../../src/app/api/v1/me/experience/route.ts), [experience UI](../../../src/components/candidate-profile-workspace.tsx).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## 1. Wire shape on Employment

- **Completed upstream** — 1.1 Add kind-aware `MarshalJSON` / `UnmarshalJSON` on `experience.Employment` (`name` for project, `company` for job; write accepts `name` or legacy `company` for projects)
- **Completed upstream** — 1.2 Unit tests for marshal/unmarshal of job vs project, including legacy project `company` input
- **Completed upstream** — 1.3 Align generated or hand-maintained `ExperienceEmployment` in `web/src/lib/types.ts` (and gen-contracts if it must learn about `name`)

## 2. Call sites that re-emit place labels

- **Completed upstream** — 2.1 Assistant experience tool projections: emit `name` for project places, `company` for jobs
- **Completed upstream** — 2.2 Handler tests for list/create project responses using `name`

## 3. Experience UI

- **Completed upstream** — 3.1 `ExperienceBankView` (and any employment edit form) display/edit project label as name, not company
- **Completed upstream** — 3.2 Spot-check labels copy (“role” vs project wording) so projects are not described as companies

## 4. Verify

- **Completed upstream** — 4.1 `go test` for touched packages + `go vet -tags=integration ./...`

</details>
