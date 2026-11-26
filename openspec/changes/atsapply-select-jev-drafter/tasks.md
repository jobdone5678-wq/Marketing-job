## Current-stack tasks

Jev select drafting is proposed for the queued attempt flow. The current shared provider and grounding modules are its integration points.

### Implementation

- [ ] Put the optional service-side `TYPESAFE_API_KEY` configuration behind a TypeScript provider adapter and keep secrets server-side.
- [ ] Apply categorical exclusions before calling a provider. Send only the claimed candidate’s eligible facts and exact offered labels for draftable selects. Leave text and textarea with the standard drafter.
- [ ] Treat a valid abstention as unresolved. Retry through the already selected LLM drafter on Jev transport, authentication, or shape failure. Enforce offered-option membership and the existing BYOK credential boundary.

### Verification

- [ ] Exercise supported options, explicit abstention, excluded topics, and unchanged text behavior with a fake provider.
- [ ] Verify missing configuration makes zero Jev calls and invalid responses follow the scoped fallback.

Implementation references include [provider abstraction](../../../src/lib/ai/provider-client.ts), [factual validation](../../../src/lib/ai/grounded.ts), [publishable experience evidence](../../../src/lib/candidate/experience.ts).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## 1. Jev-backed select drafting

- **Completed upstream** — 1.1 Write a failing test for a thin Jev select-choice client (mirrors
      `internal/ai/autofillagent/jev.go`'s shape, package-local to `atsapply`): given a
      question, option labels, and the candidate's stated facts, it builds a `Choice`
      request carrying the categorical-exclusion instruction plus an explicit decline
      alternative, and maps that alternative back to `ok=false`
- **Completed upstream** — 1.2 Implement the client against a mock HTTP server (no real network calls in
      tests). The 6 spike cases became individual unit tests, not a table — a mock
      server can only replay a canned answer, so it cannot exercise real model
      reasoning; the one adversarial case worth asserting against the MOCK is that
      the categorical-exclusion instruction text is actually present in the outgoing
      request for a compensation/legal-status-shaped question
      (`TestJevSelectChooserSendsTheCategoricalExclusionForEveryCall`, added after code
      review flagged its absence). The adversarial cases' real-model behavior was
      verified against the live API in the spike and again in task 3.3's smoke check,
      not re-asserted here against a mock that cannot reason.
- **Completed upstream** — 1.3 Write a failing test for `JevSelectDrafter.Draft` delegating `text`/`textarea`
      fields to the wrapped `LLMDrafter` unchanged, never reaching Jev
- **Completed upstream** — 1.4 Write a failing test for `JevSelectDrafter.Draft` falling back to the wrapped
      `LLMDrafter.Draft` when the Jev call errors on a `select` field
- **Completed upstream** — 1.5 Implement `JevSelectDrafter` (kind dispatch + fallback)
- **Completed upstream** — 1.6 Write a failing test confirming that with `TYPESAFE_API_KEY` unset, no Jev
      request is attempted and drafting behaves exactly like `LLMDrafter` alone for every
      field kind
- **Completed upstream** — 1.7 Implement the unconfigured-passthrough path (`NewJevSelectDrafter` constructor)

## 2. Wiring

- **Completed upstream** — 2.1 Add a `typesafeAPIKey string` field to `atsapply.Client`, threaded through
      `NewClient`'s constructor signature
- **Completed upstream** — 2.2 In `Client.resolve`, wrap `NewLLMDrafter(bound)` with
      `NewJevSelectDrafter(..., c.typesafeAPIKey)` before passing it to
      `ResolveWithDrafting`
- **Completed upstream** — 2.3 Pass `cfg.TypesafeAPIKey` at `atsapply.NewClient(...)`'s one call site in
      `cmd/auto-apply/main.go`
- **Completed upstream** — 2.4 Run the full `internal/api/atsapply` test suite

## 3. Verification

- **Completed upstream** — 3.1 `go build ./...`, `go vet ./...`, `gofmt -l .`
- **Completed upstream** — 3.2 `go test ./...` (all packages pass, no failures)
- **Completed upstream** — 3.3 Manual smoke check against the live Typesafe API with a real key (not committed)
      to confirm the wired path behaves as the spike did, before opening the PR —
      the adversarial compensation case correctly declined against the real API

</details>
