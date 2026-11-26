## Current-stack tasks

The extension choose route supports optional Jev in server mode.

### Implementation

- [x] Place the optional Jev adapter at the TypeScript choose boundary. Keep `TYPESAFE_API_KEY` in server configuration and keep whole-form planning independent of Jev.
- [x] Constrain output to the offered options or an explicit abstention. Revalidate against confirmed facts and load the configured LLM on Jev failure.

### Verification

- [x] Verify exact options, abstention, ungrounded choices, invalid provider responses, ownership, and Portal BYOK isolation with mocked providers.
- [ ] Run a live smoke check with a deployment configured for Jev and measure chooser latency on representative forms.

Implementation references include [Choose route](../../../src/app/api/extension/autofill/choose/route.ts), [owner and provider orchestration](../../../src/lib/ai/autofill-orchestrator.ts), [closed-set chooser](../../../src/lib/ai/chooser.ts), [grounding gate](../../../src/lib/ai/grounded.ts).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## 1. Config

- **Completed upstream** — 1.1 Add optional `TYPESAFE_API_KEY` to `internal/platform/config` (empty string when
      unset — no `Require()` gate, since the feature must be fully inert without it)
- **Completed upstream** — 1.2 Document `TYPESAFE_API_KEY` in `.env.example` alongside a one-line note that it
      is unrelated to `LLM_*` and only affects the autofill agent's `Choose` calls

## 2. Dependency

- **Completed upstream** — 2.1 ~~Add `github.com/wawan93/gojev` as a direct dependency~~ — reconsidered during
      implementation: the only Go wrapper is a two-commit personal package from the same
      contributor whose `cmd/enrich` Jev PR (#3068) was closed for a bug, and this
      integration only needs one HTTP endpoint. Added no new dependency; implemented a
      minimal internal client instead (`internal/ai/autofillagent/jev.go`). Confirmed no
      official Go client exists either — `langchain-typesafe` is Python-only and alpha
      (see the `hire-typesafe-jev-langchain-python-only` research note).

## 3. Jev-backed Choose

- **Completed upstream** — 3.1 Write a failing test for a thin Jev choice client: given a question, options,
      and profile, it builds a `Choice` request with an explicit "none of these"
      alternative and maps that alternative back to `""`
- **Completed upstream** — 3.2 Implement the client against a mock HTTP server (no real network calls in tests);
      reuse the 8 cases from the 2026-10-08 spike as table-driven fixtures
- **Completed upstream** — 3.3 Write a failing test for `JevPlanner.Choose` falling back to the wrapped
      `LLMPlanner.Choose` when the Jev call errors. `JevPlanner` itself doesn't
      discriminate error type, so one generic-error test covers that branch; the
      network-failure and unparseable-response cases are exercised separately, one
      layer down, at `jevChooser` (tasks 3.1/3.2 and the review-added
      malformed-JSON/missing-answer-key tests)
- **Completed upstream** — 3.4 Implement the fallback in `JevPlanner.Choose`
- **Completed upstream** — 3.5 Write a failing test confirming `JevPlanner.Plan` delegates to
      `LLMPlanner.Plan` unchanged
- **Completed upstream** — 3.6 Write a failing test confirming that with `TYPESAFE_API_KEY` unset, no Jev
      request is attempted and `Choose` behaves exactly like `LLMPlanner.Choose`
- **Completed upstream** — 3.7 Implement the unconfigured-passthrough path

## 4. Wiring

- **Completed upstream** — 4.1 Swap `autofillagent.LLMPlanner{...}` for `autofillagent.JevPlanner{...}` at
      `internal/api/handler/autofill_agent.go:48` (also threaded `TypesafeAPIKey` through
      `handler.Config` and `cmd/server/main.go`, since it did not exist before this change)
- **Completed upstream** — 4.2 Run the full `internal/ai/autofillagent` and `internal/api/handler` test suites

## 5. Verification

- **Completed upstream** — 5.1 `go build ./...`, `go vet ./...`, `gofmt -l .`
- **Completed upstream** — 5.2 `go test ./...` (all packages pass, no failures)
- **Completed upstream** — 5.3 Manual smoke check against the live Typesafe API with a real key (not committed)
      to confirm the wired path behaves as the spike did, before opening the PR —
      caught and fixed a real bug: `model` is a required field (422 without it), not
      optional as the rejected gojev dependency implied via a client-side default

</details>
