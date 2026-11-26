## Current-stack tasks

Lever DOM discovery exists in the extension. Server-side form capture and indexed question counts are proposals for the current stack.

### Implementation

- [ ] Implement the metadata parser in TypeScript with fixture inputs. Use the posting’s stored regional application URL. Read question wrappers, preserve input names and exact option values, keep labels separate, and derive required from the real control attribute.
- [ ] Use one typed provider registry for scheduling and processing. Persist changed payloads in Supabase and retire the claim atomically. Preserve the 404 terminal outcome and the 429 deferral without charging attempts.
- [ ] Keep the job-question projection separate. Group standard controls, omit consent and hidden fields, and derive the required-question count from the same visible projection. Missing capture stays unknown.

### Verification

- [ ] Verify the Lever fixture’s field IDs, checkbox groups, required flags, labels and values.
- [ ] For durable capture parity, test regional routing, 404/429 outcomes, and idempotent payload replacement with the derived question count.

Implementation references include [live form parsing](../../../extension/lib/form.ts), [Lever fixture](../../../tests/fixtures/lever-universal.html), [task dispatch and leases](../../../docs/agents/workers.md).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## 1. The parser

- **Completed upstream** — 1.1 Add the Lever form parser to `internal/applyform`, reading each `li.application-question` block: the label, the controls grouped by submit name, and the required flag
- **Completed upstream** — 1.2 Cover the control shapes the real pages use — text, textarea, select with options, radio group as one control with its alternatives, file, and the consent checkbox
- **Completed upstream** — 1.3 Cover that the required glyph is stripped from the question text while the flag is recorded, and that a block yielding no control is not captured

## 2. The fetcher

- **Completed upstream** — 2.1 Add an HTML method to the transport role and the Lever fetcher over the apply page, choosing the regional host; register `lever` so the enqueue gate and the worker both see it
- **Completed upstream** — 2.2 Cover that a not-found posting is marked gone rather than retried, like the other fetchers

## 3. Display

- **Completed upstream** — 3.1 Teach the display projection that a Lever control is an employer's question only when its submit name says so, and cover that the standard application collapses

## 4. Finish

- **Completed upstream** — 4.1 Run `go build ./...`, `go vet ./...`, `go vet -tags=integration ./...` and both Go test passes
- **Completed upstream** — 4.2 Note Lever in the capture provider lists in `AGENTS.md` and `internal/sources/AGENTS.md`

</details>
