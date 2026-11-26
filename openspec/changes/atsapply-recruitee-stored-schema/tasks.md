## Current-stack tasks

Stored Recruitee schema fallback is a proposal. Job normalization recognizes Recruitee, and the proposed worker still needs schema persistence and an owner-scoped reader.

### Implementation

- [ ] Keep the TypeScript provider registry authoritative. Read stored schema from Supabase only when the provider has no registered live fetcher. A registered fetcher’s failure follows its own error handling.
- [ ] Preserve exact field identifiers, raw types, required flags, and offered values in captured metadata. Reconcile the stored schema with the live form before resolving answers.
- [ ] Keep separate structured outcomes for missing schema, missing required answers, and a resolved form whose provider lacks a submit path. Preview and processing use the same reader.

### Verification

- [ ] Cover Recruitee capture and schema conversion in a fixture-backed contract test.
- [ ] Verify registered-fetcher priority, missing-schema behavior, and precise parking for a provider without submission support.

Implementation references include [provider normalization](../../../src/lib/jobs/normalize.ts), [live observation](../../../extension/lib/form.ts), [worker conventions](../../../docs/agents/workers.md).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## 1. Client gains a stored-form fallback

- **Completed upstream** — 1.1 Add a `forms StoredFormReader` field to `Client` (`internal/api/atsapply/client.go`), reusing the `StoredFormReader` interface already defined in `preview_client.go` — no new interface.
- **Completed upstream** — 1.2 Add `WithStoredFormReader(forms StoredFormReader) *Client`, mirroring `WithBrowserUse`'s exact shape (sets the field, returns `c`), leaving `NewClient`'s signature untouched.
- **Completed upstream** — 1.3 Update `fetchSchema` to try `c.fetchers[claimed.Provider]` FIRST as today, and only when no fetcher is registered, fall back to `c.forms.GetStoredForm(ctx, claimed.JobID)` when `c.forms != nil` — deliberately NOT `PreviewClient.schemaFor`'s storage-first order (design.md: `apply_forms` already holds rows for Greenhouse/Ashby/Workable/Lever too, so storage-first would risk a real submission reading a possibly-stale, display-captured row for providers that already work).

## 2. Wiring

- **Completed upstream** — 2.1 In `cmd/auto-apply/main.go`, call `.WithStoredFormReader(&dbApplyFormReader{q: queries})` on the `sidecar` Client after construction (the adapter already exists and is already used for `NewPreviewClient` two lines below).

## 3. Tests for the added spec requirements

- **Completed upstream** — 3.1 Unit test: `fetchSchema` (or `Submit`, at whichever level existing tests for `errNoSchemaFetcher` already sit) returns the stored form when `c.forms` has one and the provider has no live fetcher.
- **Completed upstream** — 3.2 Unit test: with `c.forms` nil (or returning not-found), a provider with no live fetcher still parks with `errNoSchemaFetcher`/`reasonSubmissionNotImplemented`, unchanged from today.
- **Completed upstream** — 3.3 Unit test: for a provider that DOES have a live fetcher, a non-nil `c.forms` returning a stored form is NOT used — the live fetcher is still preferred and called (call-counting fake), confirming this change does not alter behavior for Ashby/Workable/Greenhouse/Lever even though each has a row in `apply_forms` too.
- **Completed upstream** — 3.4 Scenario test: a Recruitee attempt with a stored form and an incomplete resolution reports `Unmapped` naming the actual missing fields, not the generic `reasonSubmissionNotImplemented`.
- **Completed upstream** — 3.5 Scenario test: a Recruitee attempt with a stored form and a fully-resolved plan still parks with `reasonSubmissionNotImplemented` (same message as today), asserting `plan.FullyResolved()==true` is reached and nothing further executes.
- **Completed upstream** — 3.6 Run `go vet -tags=integration ./...` and the full test suite for `internal/api/atsapply` and `cmd/auto-apply`.

## 4. Wrap-up

- **Completed upstream** — 4.1 Update `internal/api/atsapply/AGENTS.md`'s Recruitee note (currently: "Reaching Recruitee would need reading its already-captured form from storage instead of `applyform.Fetcher` — a real gap, not a decision, and out of scope here") to reflect that schema resolution now does this, while stating plainly that Recruitee still has no fill/submit path.
- **Completed upstream** — 4.2 `gofmt -l .`, `go vet ./...`, `go test ./...` clean before commit.

</details>
