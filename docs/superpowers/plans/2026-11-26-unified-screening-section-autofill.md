# Unified Screening, Location, and Self-ID Section Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a unified, DOM-ordered semantic AI autofill planning and execution pipeline across **location**, **work eligibility**, and **saved demographics** so portals asking the same candidate questions with varied wording, helper text, bundled checklists, segmented `[Yes]`/`[No]` buttons, or async typeaheads fill accurately from confirmed Supabase data—and leave unset/unbacked fields completely untouched.

**Architecture:** The extension extracts `label`, `helperText`, `widgetType`, `options`, and controls in DOM order (including segmented `[Yes] [No]` `<button>` pairs, distinct-name checkbox groups, and `MutationObserver`-backed async typeahead comboboxes). Unresolved fields across all three domains flow in DOM order into `planFormBatch` (`src/lib/ai/planner.ts`), backed by server-loaded Supabase `demographic_preferences` (`enabled === true` only), `screening_answers`, `screening_answer_bank` (`provenance = 'candidate'`), and `candidates` location/eligibility facts (`src/lib/ai/autofill-orchestrator.ts` -> `src/lib/ai/verified-facts.ts`), gated by `validateGroundedAnswer` (`src/lib/ai/grounded.ts`), and executed in DOM order in `extension/lib/formFill.ts` with committed-value dependency safety and per-batch fault isolation.

**Tech Stack:** TypeScript, Next.js App Router, WXT + Svelte extension, Vitest (`happy-dom`) for `extension/`, Node built-in test runner (`node --experimental-strip-types --test`) for `tests/ai/`, `esbuild` browser bundle (`scripts/bundle-extension-ai.mjs`).

**Spec:** [`docs/superpowers/specs/2026-11-26-unified-screening-section-autofill-design.md`](../specs/2026-11-26-unified-screening-section-autofill-design.md)

## Global Constraints

- **Strict DB-only / never-guess rule:** If `demographic_preferences.enabled === false` or a trait/field is unset in Supabase, leave the field untouched (`action: 'skip'` — select nothing). Explicit opt-out options (`"I prefer not to answer"`, `"Decline to self-identify"`, `"Prefer not to say"`) are selected ONLY when `enabled === true` and the candidate explicitly saved a decline value in Supabase. Never auto-select `"None of the above"` unless `enabled === true` and every offered identity option is explicitly contradicted by saved facts.
- **Hard privacy blocks preserved:** Passwords, SSNs/national IDs/passports, dates of birth, criminal history, CAPTCHAs, marketing/future-opportunity opt-ins, and `privacy_consent`/legal attestations remain blocked from LLM calls via `isBlockedAutofillField`.
- **Browser-safe `src/lib/ai/` core:** `planner.ts`, `chooser.ts`, `grounded.ts`, `verified-facts.ts`, and `provider-client.ts` must have zero Node-only imports so `npm run bundle:extension-ai` and WXT builds succeed.
- **Zero silent BYOK fallback & RLS preservation:** `public.demographic_preferences` is read server-side only for the authenticated `actorId` (`auth.uid() = user_id`), never exposed to public/recruiter endpoints; BYOK auth/SSRF failures never fall back to server keys.
- **Committed-value safety & batch resilience:** Never blindly click a dependent sponsorship/work-auth toggle when an upstream location combobox fails (`did_not_open`/`did_not_commit`); keep batches small (`batchSize = 5`), omit `jobDescription` on non-prose batches, avoid 3-tier serial fallback inside one 20s timeout on `'plan'`/`'choose'`, and continue remaining batches/comboboxes if one batch times out or errors.

## Review Focus

- **Upstream location combobox fails or commits a different country than planned:** Dependent `"require sponsorship... in this location?"` button must be skipped on failure (unless job posting location is unambiguous) or re-validated against the committed country, never blindly clicked (pinned in Task 6).
- **Bundled `"Communities"` checklist mixes mapped traits (`Veteran`, `Person with disability`, `Parent`) with unmapped traits (`Neurodivergent`, `Refugee or immigrant`) and `"None of the above"`:** When `enabled: false` or traits are unset, `"None of the above"` must be rejected and the field left untouched (`skip`) (pinned in Task 4 & Task 6).
- **Conflicting US work-authorization facts (`authorized_countries` vs `authorized_in_usa` / `us_auth`):** Direct contradiction for `'us'` must `skip` rather than emit an ungrounded `"Yes"` or `"No"` (pinned in Task 4).
- **HTTP 504 / slow provider mid-form:** Single-attempt fast failure without 3-tier serial retries inside one 20s window, and per-batch fault isolation so remaining batches and comboboxes still execute (pinned in Task 5 & Task 6).
- **Button/checkbox DOM quirks (`<button>` without `type="button"`, distinct-name checkboxes in `<fieldset>`):** `collectFillable` and `groupOf` must discover segmented `[Yes] [No]` buttons, combobox triggers, and distinct-name checkbox groups while still ignoring real form `submit`/`reset` buttons and keeping lone consent checkboxes ungrouped (pinned in Task 1).

---

### Task 1: DOM Extraction (`helperText`), Segmented `[Yes] [No]` Buttons, Combobox Triggers, and Checkbox Grouping

**Files:**
- Modify: `extension/lib/protocol.ts:24-64`
- Modify: `extension/lib/formLabel.ts:1-105`
- Modify: `extension/lib/form.ts:20-350,530-635`
- Test: `extension/lib/form.test.ts`
- Test: `extension/lib/form.group.test.ts`
- Test: `extension/lib/form.fill.test.ts`

**Interfaces:**
- Produces:
  - `WidgetType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox_group' | 'checkbox' | 'boolean_buttons' | 'combobox'` in `extension/lib/protocol.ts`
  - `FormField.helperText?: string` and `FormField.widgetType?: WidgetType` on `FormField` (`extension/lib/protocol.ts`)
  - `extractHelperText(el: Fillable, questionLabel: string): string` in `extension/lib/formLabel.ts`
  - `Question.helperText?: string` and `Question.widgetType?: WidgetType` in `extension/lib/form.ts`

- [ ] **Step 1: Write failing tests for `helperText`, `[Yes]`/`[No]` `<button>` pairs, combobox `<button>` triggers without `type="button"`, and distinct-name checkbox groups**

Add tests in `extension/lib/form.test.ts`, `extension/lib/form.group.test.ts`, and `extension/lib/form.fill.test.ts`:
```ts
// In extension/lib/form.test.ts
it('extracts helperText via aria-describedby and adjacent subtitle without polluting label', () => {
  document.body.innerHTML = `
    <div>
      <label for="work-loc">Which country do you intend to work from?*</label>
      <p id="work-loc-hint">Please list your city and country.</p>
      <input id="work-loc" role="combobox" aria-describedby="work-loc-hint" aria-expanded="false" />
    </div>`;
  const [f] = extractForm(document);
  expect(f.label).toBe('Which country do you intend to work from?*');
  expect(f.helperText).toBe('Please list your city and country.');
  expect(f.widgetType).toBe('combobox');
});

it('discovers combobox buttons lacking type="button" while skipping submit buttons', () => {
  document.body.innerHTML = `
    <form>
      <label for="race">Race</label>
      <button id="race" role="combobox" aria-expanded="false">Select ...</button>
      <button type="submit">Submit application</button>
    </form>`;
  const fields = extractForm(document);
  expect(fields).toHaveLength(1);
  expect(fields[0].label).toBe('Race');
  expect(fields[0].combo).toBe(true);
});

it('extracts Ashby-style segmented [Yes] [No] button pairs as boolean_buttons', () => {
  document.body.innerHTML = `
    <div>
      <span>Will you now or in the future require sponsorship for employment visa status to work in this location?*</span>
      <div>
        <button type="button" aria-pressed="false">Yes</button>
        <button type="button" aria-pressed="false">No</button>
      </div>
    </div>`;
  const [f] = extractForm(document);
  expect(f.label).toContain('require sponsorship');
  expect(f.widgetType).toBe('boolean_buttons');
  expect(f.options).toEqual(['Yes', 'No']);
  expect(f.value).toBe('');
});

// In extension/lib/form.group.test.ts
it('groups distinct-name checkboxes under shared fieldset legend while keeping lone consent box separate', () => {
  document.body.innerHTML = `
    <fieldset>
      <legend>Which of the following communities do you belong to? Please select all that apply.</legend>
      <label><input type="checkbox" name="comm_disability" /> Person with disability</label>
      <label><input type="checkbox" name="comm_neuro" /> Neurodivergent</label>
      <label><input type="checkbox" name="comm_veteran" /> Veteran</label>
      <label><input type="checkbox" name="comm_decline" /> I prefer not to answer</label>
    </fieldset>
    <fieldset>
      <legend>Consent</legend>
      <label><input type="checkbox" name="privacy" /> I agree to the privacy notice</label>
    </fieldset>`;
  const fields = extractForm(document);
  expect(fields).toHaveLength(2);
  expect(fields[0].widgetType).toBe('checkbox_group');
  expect(fields[0].options).toEqual(['Person with disability', 'Neurodivergent', 'Veteran', 'I prefer not to answer']);
  expect(fields[1].label).toBe('I agree to the privacy notice');
});

// In extension/lib/form.fill.test.ts
it('clicks the matching button in a segmented [Yes] [No] button group and respects aria-pressed', () => {
  document.body.innerHTML = `
    <div>
      <span>Will you require sponsorship?*</span>
      <div><button type="button" aria-pressed="false">Yes</button><button type="button" aria-pressed="false">No</button></div>
    </div>`;
  const outcomes = fillByLabel(document, [{ label: 'Will you require sponsorship?*', value: 'No', onlyEmpty: true }]);
  expect(outcomes[0].status).toBe('filled');
});
```

- [ ] **Step 2: Run extension form tests to verify they fail**

Run: `pnpm --dir extension test -- form.test.ts form.group.test.ts form.fill.test.ts`
Expected: FAIL because `helperText`, `widgetType`, and segmented `[Yes] [No]` button discovery/filling do not exist yet.

- [ ] **Step 3: Implement `WidgetType` & `helperText` in `extension/lib/protocol.ts` and `extractHelperText` in `extension/lib/formLabel.ts`**

- In `extension/lib/protocol.ts`: export `WidgetType` and add optional `helperText?: string` and `widgetType?: WidgetType` on `FormField`.
- In `extension/lib/formLabel.ts`: export `extractHelperText(el: Fillable, questionLabel: string): string` reading `aria-describedby` (ignoring error/location-rejection/live-status nodes and deduplicating against `questionLabel`) and falling back to immediate helper sibling/sub-label elements (`p, span, div`) in the same question container between the heading and control.

- [ ] **Step 4: Implement `collectFillable`, segmented `[Yes] [No]` button groups, distinct-name checkbox grouping, and `describeQuestion` metadata in `extension/lib/form.ts`**

- Update `collectFillable(doc)` to keep `[role="combobox"]`, `[aria-haspopup="listbox"]`, `[role="radio"]`, `[role="checkbox"]`, and segmented `[Yes]`/`[No]` `<button>` elements even if `type` attribute is omitted, while excluding `type="submit"` / `type="reset"` and non-choice submit buttons.
- Detect binary `[Yes]`/`[No]` `<button>` pairs (2 sibling/container `<button>` controls whose collapsed labels match `yes` and `no`, with no text/select/textarea siblings) as a single `Question` (`widgetType: 'boolean_buttons'`, `type: 'radio'`, `options: ['Yes', 'No']`); read `aria-pressed="true"` / `aria-checked="true"` for current `value` and click the chosen button in `fillField` / `applyExactChoices`.
- Verify `groupOf` groups distinct-name checkboxes under `<fieldset>` / `[role="group"]` even when `labelled.question` contains punctuation or varies across ATS forms, while keeping the single-checkbox fallback intact.
- Populate `helperText` and `widgetType` in `describeQuestion`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --dir extension test -- form.test.ts form.group.test.ts form.fill.test.ts`
Expected: PASS across all existing and new cases.

- [ ] **Step 6: Commit**

```bash
git add extension/lib/protocol.ts extension/lib/formLabel.ts extension/lib/form.ts extension/lib/form.test.ts extension/lib/form.group.test.ts extension/lib/form.fill.test.ts
git commit -m "feat(extension): capture helperText, segmented Yes/No buttons, and distinct-name checkbox groups"
```

---

### Task 2: Async Typeahead Combobox `MutationObserver` Wait (`combobox.ts`)

**Files:**
- Modify: `extension/lib/combobox.ts:30-35,155-166,247-254`
- Test: `extension/lib/combobox.test.ts`

**Interfaces:**
- Consumes: `comboOptionNodes`, `isLocationRejection`, `shownText` (`extension/lib/comboWidget.ts`)
- Produces: `runStep(doc, { action: 'query', ... })` waiting via `MutationObserver` (up to `2000ms`) for non-placeholder `[role="option"]` items before returning `{ status: 'queried' }`.

- [ ] **Step 1: Write failing test for async delayed typeahead options and loading-placeholder filtering**

Add to `extension/lib/combobox.test.ts`:
```ts
it('waits via MutationObserver up to 2s for async typeahead options and ignores loading placeholders', async () => {
  document.body.innerHTML = `
    <label for="work-loc">Which country do you intend to work from?</label>
    <input id="work-loc" role="combobox" aria-expanded="false" aria-controls="loc-list" />
    <div id="loc-list" role="listbox"></div>`;
  const input = document.getElementById('work-loc') as HTMLInputElement;
  const listbox = document.getElementById('loc-list') as HTMLElement;
  input.addEventListener('input', () => {
    input.setAttribute('aria-expanded', 'true');
    listbox.innerHTML = '<div role="option">Loading...</div>';
    setTimeout(() => {
      listbox.innerHTML = '<div role="option">Austin, United States</div>';
    }, 1150);
  });

  const reply = await combobox.runStep(document, { action: 'query', label: 'Which country do you intend to work from?', value: 'Austin, United States' });
  expect(reply).toEqual({ status: 'queried' });
  expect(combobox.options(document, 'Which country do you intend to work from?').options).toEqual(['Austin, United States']);
});
```

- [ ] **Step 2: Run test to verify it fails under the current `1000ms` poll**

Run: `pnpm --dir extension test -- combobox.test.ts`
Expected: FAIL (`options` empty or still `Loading...` after `1000ms`).

- [ ] **Step 3: Implement `MutationObserver`-backed `waitForOptions` (up to `2000ms`) in `extension/lib/combobox.ts`**

Update `query` in `runStep` (`extension/lib/combobox.ts`):
- Focus the input (`widget.focus({ preventScroll: true })`), dispatch pointer/open click if `aria-expanded !== 'true'`, call `setNativeValue(widget, step.value)` plus synthetic `KeyboardEvent('keyup')` if helpful for React listeners.
- Wait with `waitForCondition(doc, () => readyOptionNodes(widget).length > 0, 2000)` using `MutationObserver` on `doc.body ?? doc.documentElement` (falling back to timer cleanup on resolve/timeout), filtering out loading/no-match option texts (`/^loading[.…\s]*$/i`, `isLocationRejection`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension test -- combobox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/combobox.ts extension/lib/combobox.test.ts
git commit -m "feat(extension): wait via MutationObserver up to 2s on async typeahead combobox queries"
```

---

### Task 3: Safety Boundary Split (`autofillSafety.ts`) & Server Fact Loading (`verified-facts.ts`, `autofill-orchestrator.ts`)

**Files:**
- Modify: `extension/lib/autofillSafety.ts:1-43`
- Modify: `src/lib/ai/autofill-field-safety.ts:1-5`
- Modify: `src/lib/ai/verified-facts.ts:1-60,165-205,264-385`
- Modify: `src/lib/ai/autofill-orchestrator.ts:15-30,120-145,320-395`
- Test: `tests/ai/verified-facts.test.mjs`
- Test: `tests/ai/autofill-orchestrator-api.test.mjs`

**Interfaces:**
- Consumes: `getDemographicPreferences` (`src/lib/candidate/demographic-preferences-store.ts`), `DemographicPreferences` (`src/lib/profile/demographic-preferences.ts`)
- Produces:
  - `isBlockedAutofillField(field: { label?: string; type?: string; name?: string; options?: readonly string[] }): boolean` exported from `extension/lib/autofillSafety.ts` and re-exported by `src/lib/ai/autofill-field-safety.ts`
  - `buildVerifiedFacts(candidate, answerBank?, screening?, demographics?)` adding `demographics.<key>` facts ONLY when `demographics?.enabled === true`, plus `profile.location.base`, `profile.location.remote_regions`, `profile.location.work_format`, and `country_specific_answers.*` facts
  - `loadVerifiedFacts` in `src/lib/ai/autofill-orchestrator.ts` loading `getDemographicPreferences(actorId, db)` server-side

- [ ] **Step 1: Write failing tests for `isBlockedAutofillField`, `buildVerifiedFacts(..., demographics)`, and orchestrator loading**

Add assertions to `tests/ai/verified-facts.test.mjs` and `tests/ai/autofill-orchestrator-api.test.mjs`:
- `isBlockedAutofillField({ label: 'Race', options: ['Asian', 'White'] })` -> `false`
- `isBlockedAutofillField({ label: 'Which of the following communities do you belong to?', options: ['Person with disability', 'Veteran', 'I prefer not to answer'] })` -> `false`
- `isBlockedAutofillField({ label: 'Date of birth' })` -> `true`
- `isBlockedAutofillField({ label: 'Contact me about future job opportunities' })` -> `true`
- `isBlockedAutofillField({ label: 'I agree to the privacy policy' })` -> `true`
- `buildVerifiedFacts(candidate, [], screening, { enabled: false, answers: { gender: ['Male'], raceEthnicity: ['Asian'] } })` -> has NO `demographics.*` facts
- `buildVerifiedFacts(candidate, [], screening, { enabled: true, answers: { gender: ['Male'], veteran: ['No'] } })` -> sets `demographics.gender` (`['Male']`) and `demographics.veteran` (`['No']`)
- `executePlan` / `executeChoose` in `tests/ai/autofill-orchestrator-api.test.mjs` accepts demographic questions (`Race`, `Communities`) without returning 422 and loads `demographic_preferences` scoped to `actorId`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test tests/ai/verified-facts.test.mjs tests/ai/autofill-orchestrator-api.test.mjs`
Expected: FAIL (`isBlockedAutofillField` undefined; `executeChoose` rejects demographic questions with 422; `demographics.*` facts missing).

- [ ] **Step 3: Implement `isBlockedAutofillField` in `extension/lib/autofillSafety.ts` and re-export in `src/lib/ai/autofill-field-safety.ts`**

Keep `isPrivateAutofillField` intact for Phase A EEO exclusion checks if any existing unit tests call it, and add `isBlockedAutofillField` that blocks ONLY:
- `password|hidden|file|submit|button|reset`
- `date of birth|birth date|birthday|birth year|dob|password|passcode|social security|ssn|national (id|identification)|passport|criminal history|convictions?|marketing|newsletter|sms|consent|certify|attest|signature|terms of (service|use)|privacy policy|agree|acknowledg|opt in|captcha|contact me about future (job|career) opportunities`
while allowing EEO / self-ID fields (`gender`, `race`, `veteran`, `disability`, `communities`, etc.) through to Phase B.

- [ ] **Step 4: Extend `buildVerifiedFacts` (`src/lib/ai/verified-facts.ts`) and `loadVerifiedFacts` (`src/lib/ai/autofill-orchestrator.ts`)**

- In `src/lib/ai/verified-facts.ts`:
  - Add optional 4th arg `demographics?: DemographicPreferences` (type-only / pure data import so it stays browser-safe).
  - When `demographics?.enabled === true`, emit `demographics.<key>` (`type: 'string[]'`, `category: 'demographics'`, `source: 'profile'`) for each non-empty key in `demographics.answers`. When `enabled !== true`, emit zero `demographics.*` facts.
  - Surface `profile.location.base` (from `cf.location.whereBased` or `cf.contacts.location` or `pickVal('location', 'current_location')`), `profile.location.remote_regions` (`cf.location.regions`), `profile.location.work_format` (`cf.location.workFormat`), and `country_specific_answers.*` (`screeningAnswers.country_specific_answers`, e.g., `us_sponsorship`, `us_auth`) when present.
- In `src/lib/ai/autofill-orchestrator.ts`:
  - Call `getDemographicPreferences(actorId, db)` inside `loadVerifiedFacts` (gracefully returning `{ enabled: false, answers: {} }` if a mock DB in existing tests lacks `demographic_preferences`).
  - Switch `executePlan` and `executeChoose` private-field gates from `isPrivateAutofillField` to `isBlockedAutofillField`, and forward `req.context` into `chooseComboboxOption`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/ai/verified-facts.test.mjs tests/ai/autofill-orchestrator-api.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/lib/autofillSafety.ts src/lib/ai/autofill-field-safety.ts src/lib/ai/verified-facts.ts src/lib/ai/autofill-orchestrator.ts tests/ai/verified-facts.test.mjs tests/ai/autofill-orchestrator-api.test.mjs
git commit -m "feat(ai): load enabled demographic preferences server-side and allow self-ID fields into Phase B"
```

---

### Task 4: Strict Grounding Engine (`grounded.ts`) for Saved Demographics, Country-Resolved Eligibility, and Formatted Location

**Files:**
- Modify: `src/lib/profile/demographic-preferences.ts:1-70,171-226`
- Modify: `src/lib/ai/grounded.ts:23-45,157-170,255-370,632-685`
- Test: `tests/ai/grounded.test.mjs`

**Interfaces:**
- Consumes: `demographics.*`, `screening.*`, `profile.location.*`, `profile.work_auth.*` (`VerifiedFact` map from Task 3)
- Produces:
  - `QuestionDescriptor.helperText?: string`, `QuestionDescriptor.resolvedCountryCode?: string`, `QuestionDescriptor.hasUnresolvedUpstreamLocation?: boolean`
  - `isExplicitDemographicDecline(option: string): boolean` exported from `src/lib/profile/demographic-preferences.ts`
  - Updated `validateGroundedAnswer` and `uniqueConfirmedChoice` in `src/lib/ai/grounded.ts`

- [ ] **Step 1: Write failing grounding tests in `tests/ai/grounded.test.mjs`**

Add test cases covering:
1. **Saved demographics (`enabled: true` vs `false` / unset):**
   - `"Which of the following communities do you belong to?"` with options `['Person with disability', 'Neurodivergent', 'Veteran', 'Parent', 'Refugee or immigrant', 'None of the above', 'I prefer not to answer']`:
     - `demographics.veteran = ['Yes']` -> `'Veteran'` valid; `'Person with disability'` rejected; `'None of the above'` rejected.
     - No `demographics.*` facts (`enabled: false` or all unset) -> `'Veteran'`, `'None of the above'`, AND `'I prefer not to answer'` all rejected (`action: 'skip'`).
     - `enabled: true` with saved `['Prefer not to say']` on the mapped keys -> `'I prefer not to answer'` valid.
   - Standalone `"Race"` with `demographics.raceEthnicity = ['Asian']` -> `'Asian'` valid, `'White'` rejected, `'Prefer not to say'` rejected; when no `demographics.raceEthnicity` -> all options rejected (`skip`).
2. **Country-resolved US & non-US work authorization:**
   - `"Are you authorized to work in the United States?"`:
     - `screening.authorized_countries = ['us']` -> `'Yes'` valid, `'No'` rejected.
     - `screening.authorized_countries = ['in']` (non-empty, excludes `'us'`, no `authorized_in_usa`) -> `'No'` valid, `'Yes'` rejected.
     - `screening.authorized_countries = ['in']` AND `profile.work_auth.authorized_in_usa = true` (contradiction) -> both `'Yes'` and `'No'` rejected (`skip`).
     - `screening.authorized_countries = []` and no `authorized_in_usa` -> both `'Yes'` and `'No'` rejected (`skip`).
3. **Location-linked sponsorship (`resolvedCountryCode`):**
   - `"Will you now or in the future require sponsorship for employment visa status to work in this location?"` with `resolvedCountryCode: 'us'` and `screening.visa_sponsorship_needed = true` -> `'Yes'` valid, `'No'` rejected.
   - Same question with NO `resolvedCountryCode` and `hasUnresolvedUpstreamLocation: true` -> `uniqueConfirmedChoice` returns `undefined` and `validateGroundedAnswer` rejects (`skip`).
4. **Formatted location (`helperText: "Please list your city and country."`):**
   - `"Which country do you intend to work from?"` with `profile.location.city = 'Austin'`, `profile.location.country = 'United States'` -> `'Austin, United States'` valid.

- [ ] **Step 2: Run grounded tests to verify they fail**

Run: `node --experimental-strip-types --test tests/ai/grounded.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement demographic, work-auth/sponsorship, and location grounding in `src/lib/profile/demographic-preferences.ts` and `src/lib/ai/grounded.ts`**

- In `src/lib/profile/demographic-preferences.ts`: export `isExplicitDemographicDecline(text: string): boolean` (wrapping the existing `decline` pattern) and `isNoneOfTheAboveOption(text: string): boolean`.
- In `src/lib/ai/grounded.ts`:
  - **Demographics gate (before fallback):** Detect self-ID/EEO when `category === 'demographics'`, `isDemographicQuestion(qText)`, OR any offered option in `question.options` maps via `demographicKey(opt)` / `demographicOptionKey(opt)` / /\b(?:neurodivergent|refugee|immigrant)\b/i.
    - Collect all `demographics.*` facts from `facts`. If none exist (`enabled === false` or all unset), return `unresolvedResult('Demographic preferences are disabled or unset')`.
    - For single or comma-separated multi-select answers: split options against `question.options` (matching offered verbatim choices cleanly so commas inside an option name don't split falsely).
    - If `isNoneOfTheAboveOption(ans)`: allow ONLY if `question.options` has at least one demographic option and every non-decline/non-none option maps to a saved `demographics.<key>` fact whose saved answer is explicitly negative (`statusChoice(key, ...) === false` or `'No'`)—meaning unmapped options like `Neurodivergent` or `Refugee or immigrant` have no contradiction fact and cause `"None of the above"` to be rejected.
    - If `isExplicitDemographicDecline(ans)`: allow ONLY if at least one relevant `demographics.<key>` fact (the field's `demographicKey(qText)` for standalone questions, or mapped keys present in `question.options` for bundled questions) explicitly holds a decline value (`isExplicitDemographicDecline`).
    - Otherwise validate every chosen option against its `demographics.<key>` fact via `demographicChoices(key, saved, [option])`, returning `validResult(['demographics.' + key])` only when every chosen option is backed.
  - **Work authorization:**
    - Resolve target country code from `workAuthorizationCountry(qText)` or `question.resolvedCountryCode`.
    - For `'us'`: read both `screening.authorized_countries` (if non-empty) and `profile.work_auth.authorized_in_usa`. If both are present and disagree, return `unresolvedResult('Conflicting US work authorization facts')`. Otherwise honor whichever is present (`'us'` in `authorized_countries` -> Yes; excluded from non-empty `authorized_countries` -> No; `authorized_in_usa` -> Yes/No).
    - For non-US ISO code: if `screening.authorized_countries` is non-empty, allow Yes iff included, No iff excluded; if empty, skip.
  - **Sponsorship:**
    - If `question.hasUnresolvedUpstreamLocation && !question.resolvedCountryCode`, reject (`unresolvedResult`) and guard `uniqueConfirmedChoice` so it returns `undefined`.
    - Check `country_specific_answers.<iso>_sponsorship` when `resolvedCountryCode` is present; else validate against `screening.visa_sponsorship_needed` / `now` / `future`.
  - **Formatted location:**
    - For `intended_work_country`, `country`, `location`, allow `'City, Country'` / `'City, State, Country'` when built from `profile.location.city` + `profile.location.country` (or matching `profile.location.base`).

- [ ] **Step 4: Run grounded tests to verify they pass**

Run: `node --experimental-strip-types --test tests/ai/grounded.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/demographic-preferences.ts src/lib/ai/grounded.ts tests/ai/grounded.test.mjs
git commit -m "feat(ai): enforce strict DB-only demographic, country-resolved eligibility, and formatted location grounding"
```

---

### Task 5: Unified Ordered Planner, Chooser, Contracts, and Provider Timeout Resilience

**Files:**
- Modify: `src/lib/ai/structured-contracts.ts:1-24`
- Modify: `src/lib/ai/planner.ts:1-456`
- Modify: `src/lib/ai/chooser.ts:1-173`
- Modify: `src/lib/ai/server-provider-client.ts:488-775`
- Modify: `src/lib/ai/provider-client.ts:180-210`
- Modify: `src/lib/ai/autofill-orchestrator.ts:55-82,320-415`
- Test: `tests/ai/planner.test.mjs`
- Test: `tests/ai/chooser.test.mjs`
- Test: `tests/ai/server-provider-client.test.mjs`

**Interfaces:**
- Consumes: `validateGroundedAnswer`, `uniqueConfirmedChoice` (Task 4), `loadVerifiedFacts` (Task 3)
- Produces:
  - `Field` with `helperText?: string`, `widgetType?: string` (`planner.ts`)
  - `Fill` with `searchQuery?: string`, `dependsOnFieldId?: string` (`planner.ts`, `structured-contracts.ts`)
  - `PlanResult.deferredPlans?: Array<{ fieldId?: string; label: string; searchQuery?: string; dependsOnFieldId?: string }>` (`planner.ts`, `autofill-orchestrator.ts`)
  - `chooseComboboxOption(question, options, facts, client, fastChoice?, context?)` accepting `FormContext` (`chooser.ts`)

- [ ] **Step 1: Write failing tests for planner context (`helperText`, `searchQuery`, `dependsOnFieldId`, EEO), chooser context, and single-attempt timeout behavior**

Add tests to `tests/ai/planner.test.mjs`, `tests/ai/chooser.test.mjs`, and `tests/ai/server-provider-client.test.mjs`:
- `planner.test.mjs`:
  - Ordered batch containing `combo` `"Which country do you intend to work from?"` (`helperText: "Please list your city and country."`) followed by `boolean_buttons` `"Will you now or in the future require sponsorship ... to work in this location?"` produces `defer_combobox` with `searchQuery: "Austin, United States"` and `dependsOnFieldId` linking sponsorship to the location field, passing grounding with `resolvedCountryCode: "us"` and omitting `jobDescription` when no prose `textarea` is present.
  - Bundled `"Which of the following communities do you belong to?"` (`checkbox_group`) with `enabled: true` (`veteran: ['Yes']`) fills `'Veteran'`; with `enabled: false` leaves it unmapped (`skip`).
- `chooser.test.mjs`:
  - `chooseComboboxOption` receives `context.helperText` / `context.previouslyResolved`, resolves standalone `"Race"` verbatim when `enabled: true`, and returns `choice: null` when `enabled: false`.
- `server-provider-client.test.mjs`:
  - For `schemaName: 'plan'` or `'choose'`, `generateChatCompletion` makes a single direct attempt without chaining Tier 1 -> Tier 2 -> Tier 3 serially on slow/malformed calls.

- [ ] **Step 2: Run AI planner/chooser/client tests to verify they fail**

Run: `node --experimental-strip-types --test tests/ai/planner.test.mjs tests/ai/chooser.test.mjs tests/ai/server-provider-client.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Update `structured-contracts.ts`, `planner.ts`, `chooser.ts`, `autofill-orchestrator.ts`, and provider clients**

- `structured-contracts.ts`: add optional `searchQuery: z.string().optional()` and `dependsOnFieldId: z.string().optional()` to `PlanFillSchema`.
- `planner.ts`:
  - Include `helperText` and `widgetType` in `serializedTargetFields` and `neighborFields`.
  - Keep `batchSize` clamped `[4, 8]` (default `5`), omit `jobDescription` unless `targetFields.some(f => f.type === 'textarea' && f.widgetType !== 'text')` (and trim to `1200` chars).
  - Update `SYSTEM_PROMPT` to explain semantic intent mapping across location, work eligibility, and saved demographics, `helperText` formatting, cross-field location linking (`dependsOnFieldId`), `searchQuery` for `combo` fields, strict DB-only EEO (`skip` when unset/`enabled: false`, never guess, never auto-pick `"None of the above"`), and verbatim option copying.
  - In `planFormBatch`: prevent `uniqueConfirmedChoice` from short-circuiting location-dependent sponsorship fields if an earlier unresolved `combo`/location field exists in `fields`; store `searchQuery` in `deferredPlans` when `defer_combobox` (or empty `combo` value) is emitted; track planned location country by `fieldId` and `label` in `previouslyResolved` / local map so `validateGroundedAnswer` receives `resolvedCountryCode` and `helperText` in `descriptor`; attach `dependsOnFieldId` when a fill relies on an earlier location field.
  - Update `inferQuestionDescriptor` to also inspect `field.options` for demographic detection and forward `field.helperText`.
- `chooser.ts`: accept optional `context?: FormContext`, include `helperText: question.helperText` and `previouslyResolved: context?.previouslyResolved` in `userPayload`, infer `resolvedCountryCode` from `previouslyResolved` / `context` for `validateGroundedAnswer`, and require exact verbatim option match.
- `server-provider-client.ts` & `provider-client.ts`: when `options?.schemaName === 'plan' || options?.schemaName === 'choose'`, execute a single direct completion attempt (using cached provider capability or prompt-constrained JSON without cascading through 3 serial tiers inside one 20s deadline).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/ai/planner.test.mjs tests/ai/chooser.test.mjs tests/ai/server-provider-client.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/structured-contracts.ts src/lib/ai/planner.ts src/lib/ai/chooser.ts src/lib/ai/server-provider-client.ts src/lib/ai/provider-client.ts src/lib/ai/autofill-orchestrator.ts tests/ai/planner.test.mjs tests/ai/chooser.test.mjs tests/ai/server-provider-client.test.mjs
git commit -m "feat(ai): add ordered semantic planning, helperText, cross-field linking, and fast single-tier timeouts"
```

---

### Task 6: Extension DOM-Order Execution, Committed-Value Dependency Gate, Fault Isolation, and End-to-End Unit Tests

**Files:**
- Modify: `extension/lib/freehire.ts` (update `requestAutofillPlan` / `requestAutofillChoice` request/response types for `helperText`, `widgetType`, `deferredPlans`, `dependsOnFieldId`, `context`)
- Modify: `extension/lib/formFill.ts:60-452`
- Modify: `extension/lib/formFill.test.ts`

**Interfaces:**
- Consumes: `FormField.helperText` & `FormField.widgetType` (Task 1), `combobox.runStep` `query` (Task 2), `isBlockedAutofillField` (Task 3), `PlanApiResponse` (`deferredPlans`, `dependsOnFieldId`, `searchQuery`) & `ChooseApiRequest.context` (Task 5)
- Produces: Complete DOM-ordered `fillApplication` orchestrating Phase A (simple contact/non-dependent fields) + Phase B (all three domains in DOM order, committed combobox feedback, dependency skip/re-eval on combobox failure/change, per-batch fault isolation).

- [ ] **Step 1: Write failing unit tests in `extension/lib/formFill.test.ts` covering all 4 required scenarios + batch fault isolation**

Add tests in `extension/lib/formFill.test.ts`:
1. **(a) Typeahead location + linked `[Yes]`/`[No]` sponsorship button toggle:**
   - Ordered form with `"Which country do you intend to work from?"` (`combo: true`, `helperText: "Please list your city and country."`) followed by `"Will you now or in the future require sponsorship for employment visa status to work in this location?"` (`widgetType: 'boolean_buttons'`, `options: ['Yes', 'No']`).
   - When `requestAutofillPlan` returns `deferredPlans: [{ fieldId, searchQuery: 'Austin, United States' }]` and `executableFills: [{ fieldId: sponId, value: 'Yes', dependsOnFieldId: locId, grounded: true }]`:
     - Success path: `query('Austin, United States')` -> `requestAutofillChoice` receives `helperText` + `options` -> selects `'Austin, United States'` -> verifies commitment -> sponsorship `'Yes'` button is clicked and `previouslyResolved` contains committed `'Austin, United States'`.
     - Failure path: location combobox returns `did_not_commit` -> dependent sponsorship `'Yes'` button is NOT clicked (skipped safely).
2. **(b) US work-auth radio grounded to `authorized_countries`:**
   - `"Are you authorized to work in the United States?"` (`radio`, `options: ['Yes', 'No']`) filled via planned fill when `authorized_countries` includes `'us'` (`'Yes'`) or excludes `'us'` (`'No'`).
3. **(c) Bundled communities checkboxes with `enabled: true` vs `enabled: false`:**
   - `"Which of the following communities do you belong to?"` (`checkbox_group`) passed to `requestAutofillPlan` (not blocked by `isBlockedAutofillField`): with `enabled: true` plan checks `'Veteran'`; with `enabled: false` plan skips and leaves all checkboxes unchecked.
4. **(d) Standalone `"Race"` dropdown:**
   - Custom combobox `"Race"` (`combo: true`) resolved via `requestAutofillChoice` when `enabled: true`, and skipped (not selected) when `enabled: false`.
5. **Batch 504 fault isolation:**
   - Batch 1 throws HTTP 504 `ExtensionApiError`; Batch 2 and remaining comboboxes still execute and fill.

- [ ] **Step 2: Run `formFill.test.ts` to verify new tests fail**

Run: `pnpm --dir extension test -- formFill.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `extension/lib/freehire.ts` and `extension/lib/formFill.ts`**

- In `extension/lib/freehire.ts`: extend `requestAutofillPlan` / `requestAutofillChoice` TypeScript payload/response interfaces with `helperText`, `widgetType`, `searchQuery`, `dependsOnFieldId`, `deferredPlans`, and `context`.
- In `extension/lib/formFill.ts`:
  - Update `plannerField(field)` to include `helperText: field.helperText` and `widgetType: field.widgetType`.
  - Remove the Phase-0 local demographic loop (`if (demographics?.enabled) ...`) and switch Phase B filtering from `isPrivateAutofillField` to `isBlockedAutofillField`.
  - In Phase A (`planLabelFills`), skip `visaSponsorshipNeeded` / `workAuthorizationCountry` fields if an unfilled location/intended-work-country field appears before them in DOM order so Phase B links them cleanly.
  - Build `candidates` in DOM order including `combo` widgets (excluding only `isBlockedAutofillField` and long open-ended prose `textarea`s), with `batchSize = 5`.
  - On batch failure (including 504): only `break` on `PlanRefused` or `401`/`403`/`429`; on any other error/504, log a single non-blocking notice and `continue` to remaining batches.
  - Execute each batch's planned items (fills + deferred comboboxes) in **DOM order**:
    - Maintain `previouslyResolved: Record<string, string>`, `committedByFieldId: Map<string, string>`, and `failedFieldIds: Set<string>`.
    - When encountering a deferred `combo` field:
      - Call `fillCombobox` supporting `searchQuery` from `deferredPlans`: `open` -> `options` -> if `!options.length` and `searchQuery` (or profile fallback) is present, `query(searchQuery)` -> `options` -> `requestAutofillChoice({ candidateId, question: plannerField(field), options, context: { ...context, previouslyResolved } })` -> `select` -> `verify`.
      - Record the **actually committed** display value in `committedByFieldId` and `previouslyResolved[field.label]`; if `open`/`query`/`select`/`verify` failed, add `fieldId` to `failedFieldIds`.
    - When encountering a planned `fill`:
      - If `fill.dependsOnFieldId` is in `failedFieldIds`, skip it unless `context` job location is unambiguous (if not unambiguous, skip—never blindly click!).
      - If `fill.dependsOnFieldId` committed a value different from what the tentative plan assumed (check committed country vs tentative country), re-request `requestAutofillPlan` for that single field with the updated `previouslyResolved` before writing.
      - Write via `walk` (`choices: fill.choices` or `value.split(', ')` for `checkbox_group` so `applyExactChoices` selects multiple checkboxes cleanly!) and update `previouslyResolved`.

- [ ] **Step 4: Run extension tests, root AI tests, typechecks, and extension bundle/build**

Run:
```bash
pnpm --dir extension test -- formFill.test.ts form.test.ts form.group.test.ts form.fill.test.ts combobox.test.ts
node --experimental-strip-types --test tests/ai/*.test.mjs
pnpm typecheck
pnpm bundle:extension-ai
pnpm --dir extension check
pnpm --dir extension build
```
Expected: All tests pass, zero TypeScript/Svelte errors, and both `bundle:extension-ai` and `extension build` succeed.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/freehire.ts extension/lib/formFill.ts extension/lib/formFill.test.ts
git commit -m "feat(extension): execute unified ordered AI plan with committed-value safety and batch fault isolation"
```

---

## Self-Review Notes

- **Spec coverage:**
  - Supabase `demographic_preferences` (`enabled: true` gate, `auth.uid() = user_id` RLS, no exposure on public/recruiter endpoints) -> Task 3.
  - `AutofillSafety` split (`isBlockedAutofillField` keeping DOB/SSN/password/marketing/privacy blocked while letting self-ID into Phase B) -> Task 3.
  - Strict grounding (DB-only demographics, no `"None of the above"` unless contradicted, `skip` when `enabled: false` or unset, country-resolved work auth & sponsorship, US conflict skip, formatted location) -> Task 4.
  - Unified ordered `planFormBatch` + `chooseComboboxOption` (`helperText`, `widgetType`, `searchQuery`, `dependsOnFieldId`, `jobDescription` omission, single-attempt fast failure without 3-tier serial cascade) -> Task 5.
  - DOM discovery (`helperText`, segmented `[Yes] [No]` `<button>` pairs, non-`type="button"` comboboxes, distinct-name checkbox groups), async `MutationObserver` typeahead `query`, DOM-order execution, committed-value safety, per-batch 504 fault isolation, and unit tests (a)–(d) -> Tasks 1, 2, and 6.
- **Type consistency check:** `WidgetType`, `helperText`, `searchQuery`, `dependsOnFieldId`, `deferredPlans`, `isBlockedAutofillField`, `resolvedCountryCode`, and `hasUnresolvedUpstreamLocation` match verbatim across Tasks 1–6.
