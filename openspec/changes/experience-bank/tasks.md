## Current-stack tasks

Supabase-backed employments and evidence atoms are implemented. The imported assistant presets, full tailoring workflow, and every historical backfill are parity requirements where the associated surfaces are absent.

### Verification

- [ ] Run the profile, experience, and screening contract tests.
- [ ] Verify import replay, owner isolation, provenance gates, deterministic relevance, review/merge, and historical assistant or tailoring behavior where exposed.

Implementation references include [experience service](../../../src/lib/candidate/experience.ts), [owner-scoped routes](../../../src/app/api/v1/me/experience/route.ts), [CV import and composition](../../../src/lib/candidate/resumeextract.ts), [candidate review UI](../../../src/components/candidate-profile-workspace.tsx), [embedding architecture](../../../docs/agents/pgvector-embeddings.md).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## 1. Stage 1 — the bank exists and fills (additive, nothing reads it)

- **Completed upstream** — 1.1 Write `migrations/0047_experience_bank.sql`: `experience_employments` (uuid pk, user_id fk, kind, company, role, location, start, end, current, summary, timestamps) and `experience_atoms` (uuid pk, user_id fk, employment_id nullable fk, claim, context, metrics text[], skills text[], provenance, source_ref, timestamps); index `(user_id, employment_id)` and a GIN index on `skills`
- **Completed upstream** — 1.2 Add the queries to `internal/db/queries/` (owner-scoped list/get/insert/update/delete for both entities, plus the retrieval query) and run `make sqlc`. Also added `sqlc.yaml` overrides so bank ids generate as `uuid.UUID` / `*uuid.UUID` like every other opaque id, not `pgtype.UUID`
- **Completed upstream** — 1.3 Create `internal/experience` with the wire shape only — `Employment`, `Atom`, the `Provenance` values and their `Publishable()` rule, and `Sanitize` bounding every string and capping every array — in its own file, so `cmd/gen-contracts` can emit the TS type without the server-only store (mirroring `cv.go` vs `store.go`)
- **Completed upstream** — 1.4 Test `Sanitize`: over-long claim clipped, oversized metrics/skills capped, empty atom dropped, unknown provenance rejected
- **Completed upstream** — 1.5 Canonicalize atom skills through `internal/skilltag` on write; drop unrecognized tokens. Test that "k8s" persists as `kubernetes` and that an out-of-dictionary token is dropped rather than stored raw. **Required adding `skilltag.Canonicalize`** — the explicit-token entry to the dictionary, which skips the corroboration rule (an asserted token is not prose) and accepts an already-canonical slug (the assistant is prompted to speak canonical slugs, and `go` has no alias entry of its own)
- **Completed upstream** — 1.6 Implement `experience.Store` — owner-scoped CRUD over both entities, `WHERE user_id = $1` on every path, a not-owned entry reported as missing. Unit-tested over an in-memory fake (`internal/cv`'s pattern); the two guarantees a fake cannot prove — the unique index behind `InsertAtomIfNew` and the `coalesce/nullif` blanks fill — are covered by `internal/db/experience_integration_test.go` against a real Postgres
- **Completed upstream** — 1.7 Implement `experience.Import(userID, entries, sourceRef)` — takes `[]ImportEntry` rather than `resumeextract.Structured`, so the bank is not coupled to one importer and the CV mapping lives at the handler seam: employments matched case-insensitively on (company, role) filling only empty fields; atoms matched on a normalized claim; provenance `cv_import`, `source_ref` = upload stamp; never deletes
- **Completed upstream** — 1.8 Test import reconciliation: a trimmed re-upload does not shrink the bank; a repeat upload creates no duplicates; a user-edited employment field survives re-import; a late extraction for a superseded CV still lands
- **Completed upstream** — 1.9 Wire `Import` into `deriveResumeArtifacts` beside `embedResume`, so the storage path and the extract path cannot drift; an LLM/PII failure leaves the bank untouched
- **Completed upstream** — 1.10 Test the upload path end to end: successful upload populates the bank; unconfigured LLM, unavailable PII detector and a failing extraction each leave the bank exactly as it was
- **Completed upstream** — 1.11 Add `cmd/backfill-experience` — keyset pass over users with a stored CV, reusing a fresh `resume_structured` where present and invoking the extractor only where absent; idempotent, exits non-zero on failure
- **Completed upstream** — 1.12 Test the backfill: a user with a stored structure costs no model call, and a second run creates no duplicates

## 2. Stage 2 — the read path moves to the bank

- **Completed upstream** — 2.1 Implement `experience.Retrieve(userID, query, skills)` — deterministic scoring on canonical skill intersection (dominant), claim/context token overlap, employment recency, and an `agent_inferred` penalty, returning a bounded top-N
- **Completed upstream** — 2.2 Test retrieval: skill-carrying evidence outranks incidental text overlap; a large bank returns a capped result; no LLM call is made
- **Completed upstream** — 2.3 Compose the `Professional` projection from the bank (experience) plus `Structured` (education, languages, summary, total years), keeping the contact whitelist intact so a new field is withheld until explicitly projected
- **Completed upstream** — 2.4 Test the projection: contacts never appear; a populated bank with a stale structure yields experience and no education; an `agent_inferred` atom is absent
- **Completed upstream** — 2.5 Move `matchanalysis.Input.StructuredResume` to the composed projection; an empty bank means no analysis, a stale structure no longer blocks one
- **Completed upstream** — 2.6 Serve banked experience on `GET /api/v1/me/resume` and in `GET /api/v1/me/profile`'s `cv` block; regenerate the TS contract via `cmd/gen-contracts`
- **Completed upstream** — 2.7 Move `cv.Seed` to the bank for the work history and `Structured` for the rest, omitting non-publishable atoms
- **Completed upstream** — 2.8 Test seeding: experience confirmed in chat reaches a newly created CV; an `agent_inferred` atom does not; an empty bank and no structure still yields a valid empty skeleton
- **Completed upstream** — 2.9 ~~Update `ResumeStructuredView.svelte`~~ — **no change needed**: the wire shape is byte-identical (`structured.experience` is still `resumeextract.Experience[]`), only its source moved, so the component renders the banked history as-is. `make gen-contracts` produced no diff, which is the evidence

## 3. Stage 3 — the agent gets hands

- **Completed upstream** — 3.1 Add `internal/handler/assistant_experience_tools.go` with `experience_search`, `experience_add`, `experience_update` and `experience_employments`, each decoding via `assistant.DecodeArgs`, acting as the session owner, and returning structured data
- **Completed upstream** — 3.2 ~~Derive `provenance` from turn position~~ — **the spec was wrong and is corrected here.** Turn position cannot distinguish the two: every turn opens with a user message, and the model may call `experience_add` at step 1 or step 5. The working mechanism is a **citation**: `experience_add` takes a `said` field holding the candidate's words verbatim, and `assistant.UserSaid` checks it against the session transcript. A quote that checks out makes the atom `stated_in_chat`; anything else — a paraphrase, an invention, an unreadable transcript — is `agent_inferred`. The model supplies evidence, not a verdict, which is what the spec scenario actually demands
- **Completed upstream** — 3.3 Register the experience tools under every preset in `assistantRegistry`
- **Completed upstream** — 3.4 Test tool behaviour: a malformed call and a rejected write both come back as `{"error": ...}` naming the invalid field, and neither fails the turn; an atom for a known company attaches to the existing employment
- **Completed upstream** — 3.5a Migration: extend the `assistant_sessions_preset_check` constraint to admit `'profile'` — a CHECK pins the preset vocabulary in `0044`, so a new preset is a schema change, not just a Go constant
- **Completed upstream** — 3.5 Add the `PresetProfile` constant and its interviewer system prompt in `internal/assistant/prompt.go` — find employments with no atoms, profile skills with no evidence, achievements with no metric, and ask about those
- **Completed upstream** — 3.6 Reduce `get_profile` to the bank's shape: employments, per-employment atom counts, and which saved profile skills lack evidence — no atom bodies
- **Completed upstream** — 3.7 Test that a several-hundred-atom bank produces a bounded `get_profile` result and that an uncovered profile skill is marked
- **Completed upstream** — 3.8 Gate `cv_edit` on provenance in the service path — **strengthened beyond the written spec.** The spec assumed a patch arrives with a known backing atom; nothing made it arrive. So `add_bullet`/`replace_bullet` now REQUIRE `evidence_id`, and an omitted id is refused like a non-publishable one. Every bullet traces to something the candidate asserted, or it does not reach the page. Ops that rearrange or delete (`remove_bullet`, `reorder_bullets`, `set_stack`, `set_skill_group`) assert nothing new and are not gated
- **Completed upstream** — 3.9 Test the gate directly — it is the requirement the whole change exists to make durable
- **Completed upstream** — 3.10 Revise `tailorPrompt`: search the bank before asking, for `missing_have` and `missing_gap` alike; persist a confirmed answer before writing it into the CV; a declined question writes nothing

## 4. Stage 4 — the user can see and correct what was recorded

> 4.1–4.3 are done: the bank is readable, editable and deletable by its owner, and the
> profile page links into the interviewer. **4.4 — the visual pass against a real account —
> is the one thing left**, and it is not something automated tests substitute for.

- **Completed upstream** — 4.1 Add the owner-scoped HTTP surface for the bank (list, update, delete) under `/api/v1/me/experience`, cookie-or-key per the existing profile conventions
- **Completed upstream** — 4.2 Add the experience tab to `/my/profile` — employments with their atoms, provenance shown per atom, inline edit and delete
- **Completed upstream** — 4.3 Add the entry point that opens an assistant session in the `profile` preset from the profile page
- **Open upstream** — 4.4 Verify the tab against a real account: an atom deleted in the UI disappears from search results and from CV seeding

## 5. Documentation and close-out

- **Completed upstream** — 5.1 Write `internal/experience/AGENTS.md` — the provenance rule, additive import, the retrieval contract, and the boundaries against `resumeextract`, `cv` and `userprofile`
- **Completed upstream** — 5.2 Update `internal/resumeextract/AGENTS.md` (it is an importer now; the staleness rule governs only the sections it still owns) and `internal/assistant/AGENTS.md` (third preset, experience tools everywhere)
- **Completed upstream** — 5.3 Add the experience-bank row and the new module reference to the table in `CLAUDE.md`
- **Completed upstream** — 5.4 `go build ./... && go vet ./... && go test ./...` (107 packages), `go vet`, `gofmt`, `make sqlc` and `make gen-contracts` both drift-free, and the full `-tags=integration ./internal/db/` suite green
- **Open upstream** — 5.5 Offer a `/blog` changelog entry — this is user-facing

</details>
