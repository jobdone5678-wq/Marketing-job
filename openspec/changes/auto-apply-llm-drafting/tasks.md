## Current-stack tasks

Grounded answer generation exists for extension autofill. Integrating its rules with an unattended attempt is proposed.

### Implementation

- [ ] Run deterministic resolution first. Check geography, sensitive categories, consent, and other exclusions before any drafting request. A missing factual or sensitive answer remains unresolved.
- [ ] For eligible free text, build structured grounding from owner-scoped, publishable experience atoms and explicitly permitted profile facts. Require an explicit no-basis outcome and verify any enumerated answer against the offered values.
- [ ] Bind provider resolution and usage to the candidate on the leased attempt. Reuse current encryption, SSRF protections, and explicit BYOK failure behavior.

### Verification

- [ ] Use a fake provider to cover deterministic priority, no-basis, excluded fields, invalid options, and attribution.
- [ ] Verify that unresolved required answers park the attempt before any browser write.

Implementation references include [provider and candidate context](../../../src/lib/ai/autofill-orchestrator.ts), [grounding gate](../../../src/lib/ai/grounded.ts), [experience provenance](../../../src/lib/candidate/experience.ts), [worker execution](../../../docs/agents/workers.md).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## 1. Per-user LLM attribution for cmd/auto-apply

- **Completed upstream** — 1.1 Extract `userLLM` (the `llmkey.Resolver.For` + `llm.Client.As` composition in `internal/handler/user_llm.go`) into `internal/llmkey`, renamed to fit that package (e.g. `Bind`); update `internal/handler`'s call sites to the moved function; no behavior change
- **Completed upstream** — 1.2 Update `internal/llmkey/scope_test.go`'s allowlist to admit `cmd/auto-apply` by name alongside the existing `cmd/server` exemption, with a one-line comment carrying the same reasoning
- **Completed upstream** — 1.3 Wired `cmd/auto-apply/main.go`: constructs `llm.NewClient`/`llmkey.New`/`llmkey.NewResolver`/`experience.NewStore`, passed into `atsapply.NewClient`. Binding itself happens per-attempt in `atsapply.Client.resolve` (`llmkey.Bind(ctx, c.llmKeys, c.llmClient, claimed.UserID, tagAutoApplyDrafting)`), landed together with 4.3 as planned.

## 2. Sensitive-field gate

- **Completed upstream** — 2.1 Port `freehire-apply/internal/drafting`'s `isSensitive` keyword list into `internal/atsapply` (compensation, work authorization/visa sponsorship, EEO/demographic categories) as a pure, unit-tested function over a question's label text
- **Completed upstream** — 2.2 Unit test: every category in the ported list is caught; a representative set of non-sensitive labels (language proficiency, referral source, "why this company") are not

## 3. Grounding source

- **Completed upstream** — 3.1 Add a grounding-context builder that reads `experience.Store.ListAtoms`/`ListEmployments` for the attempt's candidate and filters to `Provenance.Publishable()` atoms only
- **Completed upstream** — 3.2 Unit test: an `agent_inferred` atom is excluded from the grounding context even when it would otherwise answer the question well

## 4. Drafter

- **Completed upstream** — 4.1 Define the `Drafter` interface (`Draft(ctx, question MergedField, grounding GroundingContext) (answer string, ok bool, err error)`) in `internal/atsapply`
- **Completed upstream** — 4.2 Implement the real `Drafter` over `internal/llm.Client` with a structured-output schema (grounded answer, or an explicit "no basis" signal — never an empty string standing in for "nothing to say")
- **Completed upstream** — 4.3 Wire the drafter into `Resolve`'s (or a new orchestration step's) handling of an unmapped, non-sensitive, free-text-kind field: draft, then re-run the existing "must match an offered option, where the field has any" check before accepting the value
- **Completed upstream** — 4.4 Unit test the wiring with a fake `Drafter`: a sensitive field never reaches `Draft` at all; a drafted value that fails the offered-options check still parks; a `Drafter` returning `ok=false` still parks; a successful, grounded draft fills the field

## 5. Verification and documentation

- **Completed upstream** — 5.1 (partial — honest scope adjustment: this dev environment has no `LLM_*` credentials configured, so an actual model call could not be verified live) Ran the real `applyform.Fetchers`→`ScanGreenhouseForm`→`Reconcile`→`Resolve` chain (throwaway driver, not committed) against the same live Greenhouse posting `auto-apply-worker`'s task 7.1 used, then checked the sensitive-gate against every real unmapped required field's actual label. **Found and fixed a real bug this way**: the ported term `"work authoriz"` is fixed-order and never matches the live posting's actual phrasing, `"...legal authorization to work..."` — the words are reversed. Replaced with the standalone `"authoriz"` (catches either ordering); regression test added with the exact real label. The rest of the live check matched expectations: consent, language-proficiency, and "where did you hear about us" questions correctly identified as draftable; the EEO/visa questions correctly excluded once the fix landed.
- **Completed upstream** — 5.2 Update `internal/atsapply/AGENTS.md`'s custom-question gap note (currently describes only the visa-sponsorship label match) to describe the drafting fallback, the sensitive-gate, and what still parks (ungroundable non-sensitive questions, all sensitive questions, any drafted value that fails the offered-options check)
- **Completed upstream** — 5.3 Note the new LLM-call cost and the `feature:auto-apply-drafting` tag in `internal/config`'s `LoadAutoApply` doc comment or `internal/atsapply/AGENTS.md`, wherever this worker's other real-side-effect costs are already flagged

</details>
