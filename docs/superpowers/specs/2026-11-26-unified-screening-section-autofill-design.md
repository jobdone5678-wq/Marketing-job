# Unified Screening, Location, and Self-ID Section Autofill Design

**Date:** 2026-11-26
**Status:** Approved
**Topic:** Ordered section AI planning, strict grounding, and DOM widget handling across work eligibility, location, and saved demographics

---

## 1. Intent & Why

Candidates already fill out and save their personal location, screening answers (`authorized_countries`, `us_auth` / `authorized_in_usa`, `visa_sponsorship_needed`, `willing_to_relocate`, `age_18_or_older`, `notice_period_days`, `privacy_consent`, `desired_salary_*`), and optional self-ID/demographic preferences (`public.demographic_preferences`) in the web portal (`Profile`, `Screening`, and `Demographics` tabs).

Job portals (especially Ashby, Lever, Greenhouse, and Workable) routinely ask for those same candidate facts using different phrasings, helper sub-labels, bundled checklists, segmented button toggles, and async typeaheads:
1. Work authorization asked as country-specific radio buttons (`"Are you authorized to work in the United States?"`) or phrased relative to a selected location.
2. Separate EEO dropdowns (`Gender`, `Race`, `Veteran status`) vs. a bundled multi-select checklist (`"Which of the following communities do you belong to?"` mixing `Person with disability`, `Neurodivergent`, `Veteran`, `Parent`, `Refugee or immigrant`, `None of the above`, `I prefer not to answer`).
3. Intended work location (`"Which country do you intend to work from?"` with helper subtitle `"Please list your city and country."` inside a `"Start typing..."` async combobox) followed immediately by a location-linked sponsorship toggle (`"Will you now or in the future require sponsorship for employment visa status to work in this location?"` rendered as `[Yes] [No]` `<button>` pairs).

Today, these fail because:
- `extension/lib/autofillSafety.ts` and `src/lib/ai/autofill-orchestrator.ts` block all demographic/self-ID fields from AI planning, and `src/lib/ai/verified-facts.ts` never loads `public.demographic_preferences`.
- `extension/lib/formFill.ts` removes comboboxes from `planFormBatch`, omits `helperText`, runs `requestAutofillChoice` in isolation without search-query typing or `previouslyResolved` context, and aborts remaining batches after consecutive batch errors/504s.
- `extension/lib/formLabel.ts`, `extension/lib/form.ts`, and `extension/lib/combobox.ts` miss helper sub-labels, segmented `[Yes] [No]` button pairs, non-`type="button"` combobox triggers, multi-checkbox groups with distinct `name` attributes inside `<fieldset>`/`[role="group"]`, and slower async typeahead population.
- `src/lib/ai/server-provider-client.ts` runs up to 3 serial fallback tiers inside a single 20s timeout window, causing 504s when an upstream provider is slow or returns a soft failure.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- Plan **saved demographics**, **location**, and **work eligibility** together in DOM order via one unified ordered section pipeline (`planFormBatch` + `chooseComboboxOption`), while keeping fast deterministic fills (`planLabelFills`) for trivial unambiguous profile fields.
- Pass `{ id, label, helperText, widgetType, options }` in DOM order so format instructions (e.g., `"Please list your city and country."`) and cross-field dependencies (`"to work in this location?"`) resolve accurately.
- Execute planned actions in DOM order and pass **actually committed** combobox values into `previouslyResolved`; skip dependent location-linked questions (or fall back only to unambiguous job posting location) if an upstream location combobox fails to open or commit.
- Strictly ground all three domains in `validateGroundedAnswer` (`src/lib/ai/grounded.ts`) using verified Supabase facts, including `public.demographic_preferences` (`enabled === true`), `screening_answers`, `screening_answer_bank` (`provenance = 'candidate'`), and `candidates` location/eligibility fields.
- Fix extension DOM extraction, grouping, segmented `[Yes] [No]` button driving, and async typeahead combobox resolution.
- Eliminate 504 cascades and ensure per-batch fault isolation so one failed batch never aborts remaining batches or comboboxes.

### Non-Goals
- Inferring or guessing protected-class traits (race, ethnicity, gender, disability, veteran, neurodivergent, parent, refugee/immigrant) from resumes, names, locations, or employment history.
- Replacing `planLabelFills` for simple contact fields (`fullName`, `email`, `phone`, `linkedin`, etc.) or removing the user's `demographic_preferences.enabled` opt-in gate.
- Exposing `public.demographic_preferences` to any public, recruiter, or shared candidate-read endpoints.

### Anti-Goals
- Never auto-select `"None of the above"` in bundled self-ID checklists unless every option in the bundle is explicitly contradicted by saved demographic facts (`enabled === true`).
- Never blindly click a dependent sponsorship or work-authorization toggle when the upstream location combobox it depends on failed (`did_not_open` / `did_not_commit`).
- Never send passwords, SSNs, dates of birth, or marketing/future-opportunity opt-ins to any LLM.
- Never silently fall back from BYOK to server environment keys.

---

## 3. Approaches Considered

### Approach 1: Unified Ordered Section Pipeline *(Selected)*
Keep `planLabelFills` in `extension/lib/formFill.ts` for fast deterministic basic fields, and send all remaining unresolved fields—including `combo` widgets, segmented `[Yes] [No]` buttons, bundled checkboxes, and `helperText`—to `planFormBatch` in DOM order. For typeahead comboboxes, `planFormBatch` plans an optional `searchQuery` (formatted to `label` + `helperText`) alongside `defer_combobox`; `formFill.ts` executes in DOM order, resolves deferred comboboxes via `query(searchQuery)` -> `MutationObserver` wait -> `chooseComboboxOption` (with `helperText` and `previouslyResolved`), and feeds **actually committed** values forward to dependent questions.

- **Why selected:** Coupled questions like `"Which country do you intend to work from?"` (typeahead combobox) and `"require sponsorship... to work in this location?"` (button toggle) belong to one ordered reasoning context, and a single grounding gate (`validateGroundedAnswer`) validates all three domains uniformly.

### Approach 2: Combobox-First Two-Stage Pipeline *(Rejected)*
Run comboboxes first through `chooseComboboxOption` before calling `planFormBatch` on non-combobox fields.
- **Why rejected:** Duplicates location formatting and section context between chooser and planner, and prevents comboboxes from seeing neighboring fields below them when deciding formatting or intent.

### Approach 3: Open-Ended Per-Field Interactive Agent Loop *(Rejected)*
Replace `planLabelFills` and `planFormBatch` with step-by-step server tool calling per widget.
- **Why rejected:** Adds excessive round-trip latency and bypasses existing deterministic fills and batch grounding.

---

## 4. Architecture & Design Details

### 4.1 Supabase Data & Privacy Verification
- **Saved Demographics (`public.demographic_preferences`):**
  - Already defined in `supabase/migrations/20261126000100_demographic_preferences.sql` with `ENABLE ROW LEVEL SECURITY`, owner-only policies (`(SELECT auth.uid()) = user_id` for `SELECT`, `INSERT`, `UPDATE`, `DELETE`), `REVOKE ALL ... FROM anon`, and `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` (plus `service_role` for server-side orchestrator access).
  - Verify during implementation that no public or recruiter endpoint queries `demographic_preferences` (only `/api/v1/me/demographic-preferences` and server-side autofill orchestrator keyed by `actorId` may read it).
  - **Rule:** Load `demographic_preferences` in `loadVerifiedFacts` (`src/lib/ai/autofill-orchestrator.ts`) **only** for the authenticated `actorId`. Populate demographic `VerifiedFact` entries (`demographics.<key>`) **only when `enabled === true`** and the trait has non-empty saved answers.
  - **Strict DB-only rule (`enabled: false` / unset traits stay blank):** When `enabled === false` or a specific trait is unset (`"Not specified"`), `demographics.<key>` facts are not populated, and `grounded.ts` / `planner.ts` / `chooser.ts` **must leave the field completely untouched (`action: 'skip'`, select nothing)**. Explicit opt-out options (`"I prefer not to answer"`, `"Decline to self-identify"`, `"Prefer not to say"`) are selected **only** when `enabled === true` and the candidate explicitly saved a decline preference (such as `"Prefer not to say"`) in Supabase. `"None of the above"` is never auto-selected unless `enabled === true` and every offered identity option is explicitly contradicted by saved facts.
  - **Call made (reuse existing table):** Keep the existing `public.demographic_preferences` table rather than creating a duplicate `candidate_demographics` table, since it already implements the exact `auth.uid() = user_id` RLS and is wired to `DemographicPreferencesSection.tsx`.
  - **Call made (unmapped community traits):** Keep existing `demographicKeys` backwards-compatible without forcing portal UI changes; unmapped community traits like `Neurodivergent` or `Refugee or immigrant` have no saved `demographics.*` fact by default and therefore leave unset/unbacked choices unselected (`skip` unless backed by saved traits).

- **Location & Screening Data:**
  - Load `candidates` (`confirmed_facts`, `current_city`, `current_state`, `full_address`, `authorized_in_usa`, `need_sponsorship_now`, `need_sponsorship_future`, `open_to_relocation`), `screening_answers` (`authorized_countries`, `visa_sponsorship_needed`, `willing_to_relocate`, `age_18_or_older`, `notice_period_days`, `desired_salary_*`), and `screening_answer_bank` (`WHERE provenance = 'candidate'`) in `loadVerifiedFacts`.
  - **Call made (`privacy_consent` out of scope):** Keep `privacy_consent` / legal attestation / marketing checkboxes blocked in `isBlockedAutofillField` (unchanged; not part of the 3 target domains).
  - Ensure `location_preferences` (`confirmed_facts.location.whereBased`, `countries`, `regions`, `workFormat`, `openToRelocation`) and `candidate_contacts.location` (`confirmed_facts.contacts.location`) are surfaced as structured `VerifiedFact`s (`profile.location.base`, `profile.location.city`, `profile.location.country`, `profile.location.intended_work_country`, `profile.location.remote_regions`, `profile.location.work_format`, `profile.preferences.open_to_relocation`), alongside `profile.work_auth.authorized_in_usa` (honoring `country_specific_answers.us_auth` persisted on `candidates`).

### 4.2 Safety & Privacy Filter (`autofillSafety.ts` & `autofill-orchestrator.ts`)
- Stop treating EEO / self-ID fields (`gender`, `sex`, `pronouns`, `race`, `ethnicity`, `veteran`, `disability`, `parent`, `neurodivergent`, `refugee`, `communities`, `self identify`, `demographics`) as blocked from Phase B AI planning.
- Split `isPrivateAutofillField` (or introduce `isBlockedAutofillField` used by `executePlan`, `executeChoose`, and `formFill.ts` Phase B filtering) so the following remain **strictly blocked** from any LLM call:
  - Passwords, passcodes, SSN / national ID / passport numbers, dates of birth / birth year (`dob`), criminal history / convictions, CAPTCHAs.
  - Marketing, newsletter, SMS, and future-opportunity opt-ins (`"contact me about future job opportunities"`).
  - Unrequested legal/signature/attestation checkboxes (preserving `privacy_consent` only via explicit confirmed `screening.privacy_consent` handling, never via LLM guessing).
- Also ensure `formFill.ts` no longer executes a separate Phase-0 local demographic loop that bypasses the unified ordered plan—OR if it only pre-fills nothing private, let Phase B plan all three domains in DOM order while keeping `demographicChoices` / `mixedDemographicChoices` helpers available as deterministic pre-checks or grounding validators inside `grounded.ts` / `planner.ts`.
  - **Design choice:** Handle saved demographics inside the unified ordered pipeline (`planFormBatch` + `chooseComboboxOption` + `validateGroundedAnswer`), so bundled/reworded controls (e.g. `"Which of the following communities do you belong to?"` and `"Race"` custom dropdowns) are planned in DOM order alongside location and work eligibility using `demographic_preferences` facts loaded server-side.

### 4.3 Ordered Section Planning, `helperText`, Cross-Field Linking & Grounding

#### Field & Contract Shapes (`planner.ts`, `structured-contracts.ts`, `protocol.ts`)
- Extend `FormField` / planner `Field` with:
  - `helperText?: string` (captured subtitle/description text, separate from `label`).
  - `widgetType?: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox_group' | 'checkbox' | 'boolean_buttons' | 'combobox'` (derived in `formFill.ts` / `form.ts` alongside `type` and `combo`).
- Extend `PlanFillSchema` / `Fill` with optional `searchQuery?: string` (for `defer_combobox` actions on typeahead widgets, e.g., `"Austin, United States"` when `label` asks `"Which country do you intend to work from?"` and `helperText` says `"Please list your city and country."`) and optional `dependsOnFieldId?: string` (linking a location-dependent fill such as `"require sponsorship... in this location?"` to the upstream location field in the same section).
- **Call made (same-batch orchestration):** Use a single-pass tentative plan (`defer_combobox` + `searchQuery` and `dependsOnFieldId` on dependent fills) in `planFormBatch`, and have `formFill.ts` execute in DOM order: commit the combobox first, write the **actually committed** value to `previouslyResolved`, and if the combobox failed (`did_not_open` / `did_not_commit`) or committed a different country than planned, withhold the tentative fill (skipping on failure unless job posting location is unambiguous, or re-planning/re-validating the dependent field with the actual committed country).
- Expose `searchQuery` and `dependsOnFieldId` on `PlanApiResponse.plan` / `executableFills` / deferred metadata so `extension/lib/formFill.ts` has typed access without label heuristics.
- Extend `ChooseApiRequest` (`autofill-orchestrator.ts` & `chooseComboboxOption` in `chooser.ts`) to accept `context?: FormContext` (already declared on `ChooseApiRequest`!), including `helperText`, `previouslyResolved`, and `jobPosting` location/title.

#### Planner Prompt & Batching (`planner.ts`)
- Pass fields in DOM order with `{ fieldId, label, helperText, widgetType, required, combo, options }`.
- Prompt rules explicitly instruct the planner:
  1. **Formatting with `helperText`:** Use `helperText` to format location/text values (`"City, Country"` vs `"Country"` vs `"State"`), and set `searchQuery` when `combo: true` is a `"Start typing..."` / typeahead field.
  2. **Cross-field location linking:** When a work-authorization or sponsorship question references `"this location"` / `"this country"` / `"the location above"`, resolve the target country from the earlier planned or `previouslyResolved` location field (or `context.jobLocation` / `jobTitle` if unambiguous).
  3. **Verbatim options:** For `select`, `radio`, `boolean_buttons`, and `checkbox_group`, copy option strings **verbatim** from `field.options` (comma-separated for multi-select `checkbox_group`).
  4. **Strict self-ID / EEO rule:** NEVER infer protected-class traits from resume, name, or location. Only select options explicitly backed by saved `demographics.*` facts. If `demographics` are disabled (`enabled === false`) or the asked trait(s) are unset in Supabase, return `action: 'skip'` and leave the field untouched—do not select anything. Only pick an explicit opt-out option (`"I prefer not to answer"`, `"Decline to self-identify"`, `"Prefer not to say"`) when the candidate explicitly saved `"Prefer not to say"` in Supabase (`enabled === true`). Never pick `"None of the above"` unless `enabled === true` and every offered identity option in the group is explicitly contradicted by saved `demographics.*` facts.
- **Keep deterministic shortcut (`uniqueConfirmedChoice`)** safe:
  - Do not let `uniqueConfirmedChoice` fire on location-dependent sponsorship questions before an earlier unresolved/combo location field in the same section has committed, unless the target country is already unambiguous.

#### Grounding Rules (`verified-facts.ts` & `grounded.ts`)
1. **Saved Demographics:**
   - Detect demographic/self-ID questions by inspecting **both** `question.label` AND `question.options` (catching indirect headings like `"Which of the following communities do you belong to?"` via options such as `"Person with disability"`, `"Veteran"`, `"Neurodivergent"`, `"Parent"`, `"Refugee or immigrant"`).
   - If `demographic_preferences.enabled === false` (no `demographics.*` facts loaded), reject all demographic/self-ID answers (`action: 'skip'`) so the field stays blank.
   - If the proposed answer is an explicit opt-out phrase (`decline` regex: `"I prefer not to answer"`, `"Decline to self-identify"`, `"Prefer not to say"`, `"I don't wish to answer"`, etc.) offered verbatim in `question.options`, **allow only when** `enabled === true` and the relevant saved `demographics.<key>` fact(s) explicitly hold a decline value (`"Prefer not to say"`). Otherwise reject (`action: 'skip'`) so unset traits stay blank.
   - If the proposed answer is `"None of the above"` on a bundled demographic checklist, **reject** unless `demographic_preferences.enabled === true` AND every identity option in `question.options` maps to a saved demographic key whose saved answer explicitly contradicts that option (e.g., `"No"`). Note: unmapped traits like `Neurodivergent` or `Refugee or immigrant` have no saved contradiction by default, so `"None of the above"` is blocked and the checklist is skipped unless a saved positive trait matches.
   - If the proposed answer selects one or more identity options (single choice or comma-separated `checkbox_group`), validate **each** chosen option individually against `demographics.<key>` facts using `demographicChoices` / alias matching; reject (`action: 'skip'`) if any option lacks an explicit saved `demographics.*` match.
2. **Work Authorization & Sponsorship (Country-Resolved):**
   - Pass resolved target country (from question text, linked planned/committed `previouslyResolved` location field, or job posting location) into `validateGroundedAnswer` via `QuestionDescriptor` (e.g., `resolvedCountryCode` or `context`).
   - **Country-specific work authorization (Call made on US conflict handling):** Resolve target country to ISO alpha-2:
     - For non-US countries: if `screening.authorized_countries` includes that ISO code -> `"Yes"` is valid (`"No"` rejected); if `screening.authorized_countries` is non-empty and excludes it -> `"No"` is valid; if empty -> `skip`.
     - For the United States (`'us'`): if `profile.work_auth.authorized_in_usa` (`us_auth`) and `screening.authorized_countries` are both explicitly set and directly contradict each other (e.g., `authorized_in_usa === false` while `'us'` is in `authorized_countries`, or `authorized_in_usa === true` while `authorized_countries` is non-empty and excludes `'us'`), `skip` rather than guessing; otherwise honor whichever explicit fact is present (`authorized_in_usa` if set, or `authorized_countries` if non-empty), and `skip` if neither is set.
   - **Sponsorship (Call made on global `visa_sponsorship_needed`):**
     - Check `country_specific_answers.<iso>_sponsorship` first if present; otherwise validate `"Yes"` / `"No"` (and verbose option equivalents via `matchChoice` / `offeredChoice`) directly against the candidate's saved `screening.visa_sponsorship_needed` (and `now`/`future` profile facts) once a target country has resolved/committed (or unambiguous job posting location fallback).
     - Accept `[Yes] [No]` button options and verbose radio/select options verbatim.
3. **Formatted Location:**
   - When `helperText` or `label` requests `"City, Country"` (or `"City, State, Country"`), allow combined answers constructed from `profile.location.city` + `profile.location.country` (or `profile.location.base` / `whereBased`) instead of rejecting `"City, Country"` as a mismatch against `profile.location.country` alone.

### 4.4 Timeout & Batch Resilience (`server-provider-client.ts`, `provider-client.ts`, `planner.ts`, `formFill.ts`)
- **Pre-filter before planning:** Strip already-filled fields (Phase A deterministic fills and user-filled values) and blocked fields (`isBlockedAutofillField`) before batching.
- **Small focused batches & trimmed context:**
  - Use batch size `5` (within 5–8) in `formFill.ts` and `planner.ts`.
  - Omit `jobDescription` completely for batches containing only structured/factual/location/eligibility/demographic fields; only pass a trimmed `jobDescription` (`slice(0, 1200)`) when a batch actually includes an open-ended prose question.
- **Remove 3-tier serial fallback inside one 20s timeout:**
  - In `ServerVercelProviderClient.generateChatCompletion` (and `ProviderClient` retries), do **not** chain Tier 1 -> Tier 2 -> Tier 3 serially inside the same 20s request budget when `schemaName` is `'plan'` or `'choose'`. Pick one direct request format per provider capability (e.g., cached single tier or direct `json_prompt` / `Output.object` without cascading retries inside the same request deadline) so a slow or non-conforming response fails fast once instead of burning multiple round-trips up to 504.
- **Per-batch fault isolation in `formFill.ts`:**
  - Remove the `consecutiveFailures >= 2` early `break` on transient/504 batch errors. Log/surface a single non-blocking notice on batch error or 504 timeout and **continue** processing remaining batches, comboboxes, and prose fields (still stopping immediately on auth/plan refusals `401`, `403`, `429`, or `PlanRefused`).

### 4.5 DOM Discovery, Grouping, Execution Order & Widgets (`extension/lib/`)

1. **`formLabel.ts` — `helperText` extraction:**
   - Add `extractHelperText(el: Fillable, questionLabel: string): string`:
     - Check `aria-describedby` element text (excluding validation error/location-rejection live regions).
     - Otherwise check immediate sibling/sub-label text nodes inside the question container (e.g., `<p>`, `<span>`, `<div>` between the question heading and the control, such as `"Please list your city and country."`) that are not the question `label`, not an option label, and not an error message.
     - Keep `label` clean so `fieldKeys.ts` prefix matching continues to work unchanged.

2. **`form.ts` — `collectFillable`, segmented `[Yes] [No]` buttons, and checkbox grouping:**
   - **Expand `collectFillable`:**
     - Keep matching `input, select, textarea, ${COMBO_TRIGGER}, ${CHOICES}` where `COMBO_TRIGGER = '[role="combobox"], [aria-haspopup="listbox"]'` (works with or without `type="button"`).
     - Fix `HTMLButtonElement` filtering so `<button>` elements without `type` (HTML default `'submit'`) are NOT dropped when they belong to a `COMBO_TRIGGER`, `[role="radio"]`, `[role="checkbox"]`, or a segmented Yes/No button group (still drop actual form submit/reset buttons via `type="submit"`, `type="reset"`, or explicit submit button labels outside choice groups).
     - **Segmented `[Yes] [No]` `<button>` pairs:** Detect containers (nearest ancestor holding no text/select/textarea inputs) whose visible `<button>` children form a binary choice pair (e.g., 2 adjacent `<button>` elements labeled `Yes` and `No`, optionally using `aria-pressed` or active styling inside an Ashby-style question container). Group them as a single `Question` with `widgetType: 'boolean_buttons'`, `type: 'radio'`, `options: ['Yes', 'No']`, and `fillField` clicking the target `<button>` (and reading `aria-pressed="true"` / selected state so `onlyEmpty` and `describeQuestion` know if one is already chosen).
   - **Multi-checkbox grouping fix (`groupOf`):**
     - Inside a `<fieldset>` or `[role="group"]` with a shared parent question label (`labelledContainer`), group checkboxes even when each `<input type="checkbox">` or `[role="checkbox"]` carries a distinct `name` attribute (e.g., Ashby/Greenhouse community or country checklists), while preserving the single-checkbox fallback (`groups` length === 1 -> use the control's own label) so lone consent checkboxes keep their consent label.
   - **Verbatim option matching (`applyExactChoices` / `answerQuestion`):**
     - Ensure `planFormBatch` and `chooser.ts` receive and emit the exact verbatim strings from `field.options` (with `offeredChoice` fallback only for trivial whitespace/case normalization) so `applyExactChoices` never fails with `no_option`.

3. **`combobox.ts` — Async typeahead `query` with `MutationObserver`:**
   - Upgrade `query` step in `runStep` (`extension/lib/combobox.ts`):
     - Focus the widget, click/open if needed, dispatch `input` / `change` via `setNativeValue(widget, step.value)` (and keyboard/input events expected by React typeaheads).
     - Replace the fixed 1000ms poll with a `MutationObserver`-backed wait (up to **1800–2000ms**) watching `document.body` / listbox container for visible `[role="option"]` items to populate (resolving immediately as soon as non-loading `[role="option"]` nodes appear, ignoring `"Loading..."` / `"No matching locations found"` placeholders).
     - Support `select` matching & `verify` commitment check against the populated options.

4. **`formFill.ts` — DOM-Order Execution & Dependent Field Safety:**
   - Run Phase A deterministic fills ONLY for unambiguous non-dependent profile fields (contact, URLs, etc.—and skip any location-dependent work-auth/sponsorship field when an unresolved location field sits above it in the form!).
   - Build the unresolved field list in **DOM order** (including `combo` widgets, `boolean_buttons`, `checkbox_group`, `select`, `radio`, and text inputs, excluding only `isBlockedAutofillField` and long open-ended prose `textarea`s).
   - Run `planFormBatch` in DOM-ordered batches of 5.
   - Execute planned results in **DOM order**:
     - For a normal field (`fill`): write via `walkFills`, record committed value in `previouslyResolved`, and notify `hooks.answered`.
     - For a deferred/typeahead `combo` field: open -> read options -> if empty or typeahead (`searchQuery` provided by planner), run `query(searchQuery)` -> read populated options -> call `requestAutofillChoice` with `{ candidateId, question (including helperText), options, context: { ...context, previouslyResolved } }` -> select & verify commitment.
     - **Committed-value safety:** Only write the **actually committed** combobox display string into `previouslyResolved`! Track failed comboboxes (`did_not_open` / `did_not_commit` / `no_option`). If a dependent field (e.g., `"require sponsorship... to work in this location?"`) references an upstream location combobox that failed to commit, **do NOT blindly click** the sponsorship/work-auth toggle based on an unconfirmed location—skip it unless the job posting context itself unambiguously determines the location.
     - If a deferred location combobox commits *during* DOM-order execution and later batches or dependent fields haven't been planned yet (or need re-evaluation with the real committed value), pass the updated `previouslyResolved` forward to subsequent `planFormBatch` / `requestAutofillChoice` calls.

---

## 5. Testing & Verification Plan

Unit tests (Vitest) covering:
1. **(a) Typeahead location + linked `[Yes]`/`[No]` sponsorship button toggle:**
   - DOM extraction of `"Which country do you intend to work from?"` + `helperText: "Please list your city and country."` + async `MutationObserver` typeahead population + segmented `<button>Yes</button><button>No</button>` discovery & click.
   - Planner + `formFill.ts` linking committed location -> sponsorship button toggle, AND verifying that when the location combobox fails (`did_not_commit`), the dependent sponsorship button is safely skipped rather than blindly clicked.
2. **(b) US work-auth radio grounded to `authorized_countries`:**
   - `"Are you authorized to work in the United States?"` radio group grounded deterministically: `"Yes"` when `authorized_countries` contains `'us'`, `"No"` when non-empty and excludes `'us'`, `skip` when empty (unless `authorized_in_usa` explicitly set).
3. **(c) Bundled communities checkboxes with `enabled: true` vs `enabled: false`:**
   - Multi-checkbox `<fieldset>`/`[role="group"]` with distinct `name` attributes (`Person with disability`, `Neurodivergent`, `Veteran`, `Parent`, `Refugee or immigrant`, `None of the above`, `I prefer not to answer`).
   - `enabled: true` with saved `veteran: ['Yes']` -> selects `'Veteran'`; `enabled: true` with saved decline (`['Prefer not to say']`) on the mapped traits -> selects `'I prefer not to answer'`; unset traits -> leaves unchecked, never guesses, never picks `'None of the above'`.
   - `enabled: false` -> `demographic_preferences.answers` not loaded; leaves the checklist completely untouched (`skip` — selects nothing, neither `'I prefer not to answer'` nor `'None of the above'`).
4. **(d) Standalone `"Race"` dropdown:**
   - Custom combobox (`Select ...`) with `enabled: true` and saved `raceEthnicity` maps verbatim to the offered option (or `'Decline to self-identify'` / `'Prefer not to say'` when the saved preference itself is `'Prefer not to say'`); with `enabled: false` or unset `raceEthnicity`, leaves the dropdown blank (`skip`, selects nothing).
5. **Batch fault isolation & timeout guardrails:**
   - One batch returning 504 / error does not abort subsequent batches or comboboxes.
   - Blocked fields (password, SSN, DOB, marketing opt-ins) are still stripped before Phase B.

---

## 6. What Is Left to the Builder

- Exact DOM selector heuristics for `extractHelperText` in `extension/lib/formLabel.ts` and Ashby segmented button container detection in `extension/lib/form.ts` (avoiding false positives on form submit/navigation buttons).
- Exact prompt phrasing in `planner.ts` and `chooser.ts` within the existing `PlanContractSchema` / `ChooseContractSchema` structure.
- Exact test fixture HTML/DOM structure in `extension/lib/*.test.ts` and `src/lib/ai/*.test.ts`.
