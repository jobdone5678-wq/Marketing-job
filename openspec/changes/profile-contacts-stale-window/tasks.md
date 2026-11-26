## Current-stack tasks

The Next.js resume route and candidate UI expose profile contacts and parse state. Verify stale-window parity against the imported requirements before treating all cases as supported.

### Verification

- [ ] Cover old structured data, the first upload, owned contacts, a missing contact layer, and bank-only history.
- [ ] Verify an old task cannot publish against a newer uploaded file.

Implementation references include [resume read composition](../../../src/app/api/v1/me/resume/route.ts), [identity projection](../../../src/lib/candidate/resumeextract.ts), [bank history](../../../src/lib/candidate/experience.ts), [profile rendering](../../../src/components/candidate-profile-workspace.tsx).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## 1. Résumé read composition

- **Completed upstream** — 1.1 Add a store/read path that, when the structure stamp is stale, still yields contact fields from the superseded blob plus a pending flag (keep `Structured`’s `ok` semantics for seed gates)
- **Completed upstream** — 1.2 Update `GetResume` to compose bank experience + provisional contacts + pending/stale signal on the cookie résumé status payload; leave semantic sections empty while pending
- **Completed upstream** — 1.3 Unit tests: stale+bank+superseded contacts; stale+bank+no contacts; current structure unchanged; profile `cv` / Professional still contact-free

## 2. Profile UI

- **Completed upstream** — 2.1 Thread the pending signal through `getResume` types/client
- **Completed upstream** — 2.2 Profile tab: show pending/stale explanation; still render provisional contacts and banked experience when present

## 3. Extract window hygiene

- **Completed upstream** — 3.1 Reproduce why the latest local upload did not stamp `resume_structured` (logs / LLM / PII path) and fix or surface failure so the pending window ends
- **Completed upstream** — 3.2 Manual check on `/my/profile` Profile tab: name, phone, links visible during pending and after stamp catches up

## 4. Verification

- **Completed upstream** — 4.1 `go test` / `go vet -tags=integration` for affected packages; focused web check if types changed

</details>
