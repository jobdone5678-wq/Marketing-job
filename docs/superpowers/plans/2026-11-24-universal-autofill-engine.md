# Universal Autofill Engine Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Universally harden the Chrome extension autofill engine and candidate API projection so that input fields, checkboxes, radios, custom comboboxes/dropdowns, and multi-step wizard forms are reliably populated across all applicant tracking systems without overwriting candidate edits or causing infinite loops.

**Architecture:** Unify candidate profile column and fact delivery in `/api/extension/candidates` and `panel.js:buildScopedProfile`. In the DOM engine (`field-writer.js`, `field-mapping.js`, `application.js`), replace blanket value preservation with an intelligent edit tracker (`WeakSet` + durable semantic store), state-guarded single-toggle checkbox execution, portal-aware typeahead combobox resolution, marketing-blocklisted consent matching, and debounced SPA route/DOM mutation tracking for multi-step wizards.

**Tech Stack:** Chrome Extension Manifest V3 (JavaScript ES2022, `chrome.scripting`, `chrome.storage.session`), Next.js 15 / Node.js 22 backend, Node.js built-in test runner (`node:test`, `node:assert`).

**Spec:** [docs/superpowers/specs/2026-11-24-universal-autofill-engine-design.md](file:///C:/Users/bharg/Downloads/marketing-job/docs/superpowers/specs/2026-11-24-universal-autofill-engine-design.md)

## Global Constraints

- Must run in Chrome Manifest V3 isolated world content scripts with zero remote eval or inline code execution.
- Script execution across frames must support `allFrames: true` for embedded career board iframes (Greenhouse/Ashby).
- Must cooperate with React 17/18/19, Vue, Angular, and legacy jQuery frameworks, resetting React `_valueTracker` before dispatching synthetic events.
- Consequential disclosures (DOB, citizenship, work authorization) must strictly follow verified candidate facts.
- Must preserve user-edited values: if an element received an `isTrusted` interaction, the extension must never overwrite it.
- Must run and pass all 256 existing test suites without regressions.

## Review Focus

- Pre-checked default radios (e.g. "No" for work authorization/sponsorship) must be overwritten by confirmed candidate facts if untouched by the candidate, but preserved if modified via an `isTrusted` click.
- Checkbox single toggle must never flip back to false on React controlled components (verify state before and after).
- Comboboxes whose options are virtualized or rendered in `document.body` portals must be discovered and filtered via typeahead typing with settling waits.
- Checkboxes with "I agree to receive marketing SMS" must NOT be auto-checked, whereas "I agree to the privacy policy and terms" must be auto-checked.
- Navigating "Next" on a multi-step form must auto-fill newly revealed visible fields without re-filling already completed fields or entering an infinite loop.

---

### Task 1: API Candidate Fact Projection & Provenance Preservation

**Files:**
- Modify: `src/app/api/extension/candidates/route.ts:21-205`
- Test: `tests/candidates-endpoint-autofill.test.mjs`

**Interfaces:**
- Consumes: Database `candidates` table records and `confirmed_facts` JSON.
- Produces: Sanitized candidate array in `/api/extension/candidates` where `savedOnly=true` includes all EEOC/demographic columns, preserves `provenance_status: 'confirmed'`, and accepts candidates with valid `candidate.full_name`.

- [x] **Step 1: Write the failing test in `tests/candidates-endpoint-autofill.test.mjs`**

```javascript
test('GET /api/extension/candidates with savedOnly=true projects EEOC columns and merges row with confirmed_facts', async () => {
  // Test mock returns candidate with row columns gender, race, veteran, disability, full_name
  // Verifies response.candidates[0] has provenance_status === 'confirmed' and contains all fields
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/candidates-endpoint-autofill.test.mjs`
Expected: FAIL (missing columns or rejected candidate facts)

- [x] **Step 3: Implement candidate projection in `src/app/api/extension/candidates/route.ts`**

Update `CANDIDATE_FIELDS` to include `gender, race, race_ethnicity, veteran, veteran_status, disability, disability_status, work_authorization`. In `savedOnly` branch, merge row columns with `confirmed_facts`, check `facts.full_name || candidate.full_name`, and return merged facts with `provenance_status: 'confirmed'`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/candidates-endpoint-autofill.test.mjs`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/app/api/extension/candidates/route.ts tests/candidates-endpoint-autofill.test.mjs
git commit -m "feat(api): project candidate EEOC columns and merge row facts in candidates endpoint"
```

---

### Task 2: Side Panel Scoped Profile Expansion

**Files:**
- Modify: `jobright_extension/panel.js:348-378`
- Test: `tests/panel-scoped-profile.test.mjs`

**Interfaces:**
- Consumes: Candidate object returned by `/api/extension/candidates`.
- Produces: `scopedProfile` object passed to `NextkinApplication.startAutofill` via `chrome.scripting.executeScript`.

- [ ] **Step 1: Write the failing test in `tests/panel-scoped-profile.test.mjs`**

```javascript
test('buildScopedProfile preserves provenance_status and extended demographics/skills keys', () => {
  const profile = {
    id: 'cand-1',
    provenance_status: 'confirmed',
    race_ethnicity: 'Asian',
    primary_skills: 'React, Node',
    skills: ['React', 'Node'],
    current_job_title: 'Senior Engineer',
  };
  const scoped = buildScopedProfile(profile);
  assert.strictEqual(scoped.provenance_status, 'confirmed');
  assert.strictEqual(scoped.race_ethnicity, 'Asian');
  assert.strictEqual(scoped.current_job_title, 'Senior Engineer');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/panel-scoped-profile.test.mjs`
Expected: FAIL with `scoped.provenance_status undefined`

- [ ] **Step 3: Update `buildScopedProfile` in `jobright_extension/panel.js`**

Add `provenance_status: candidate.provenance_status || 'confirmed'` to the returned object. Add `'race_ethnicity', 'primary_skills', 'skills', 'current_job_title', 'experience_years', 'total_experience_years'` to `allowedKeys`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/panel-scoped-profile.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/panel.js tests/panel-scoped-profile.test.mjs
git commit -m "fix(panel): retain provenance_status and extended keys in buildScopedProfile"
```

---

### Task 3: Field Writer Smart Overwrite Guard & Edit Tracking

**Files:**
- Modify: `jobright_extension/core/field-writer.js:1030-1170`
- Test: `tests/verified-combobox-writer.test.mjs`

**Interfaces:**
- Consumes: `plans` array and DOM elements from form discovery.
- Produces: Smart write decision: overwrites untouched portal defaults (`defaultChecked`, blank `<select>`, placeholder text), preserves `isTrusted` user edits across radio groups and label clicks, and stores values in `durableFieldStore`.

- [ ] **Step 1: Write the failing test in `tests/verified-combobox-writer.test.mjs`**

```javascript
test('writer overwrites untouched initial default radio (e.g. pre-checked "No") with confirmed candidate fact', async () => {
  // Radio group with "No" defaultChecked: true, but candidate fact is "Yes"
  // Writer must update radio to "Yes" because it was untouched by user
});

test('writer strictly preserves field if modified by an isTrusted user event', async () => {
  // Input received an isTrusted input event
  // Writer must preserve the user-edited value
});

test('writer tracks isTrusted clicks on <label> or sibling radio across the entire radio group', async () => {
  // Radio group where Option B's label received an isTrusted click
  // Writer must recognize the entire radio group as user-edited and preserve it
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/verified-combobox-writer.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement edit tracking & smart `hasAnswer` in `jobright_extension/core/field-writer.js`**

1. Install global `isTrusted` listener capturing `change`, `input`, and `click`/`keydown` on native controls and custom ARIA controls (`[role="combobox"], [role="radio"], [role="checkbox"]`).
   - If target is a `<label>` with a `control` property or `for` attribute, resolve and mark the associated control.
   - For radio inputs, mark all sibling radio inputs in the same named group (`input[name="..."]`) or parent `[role="radiogroup"]` as user-edited in `userEditedElements = new WeakSet()`.
2. Update `durableFieldStore = new Map()` (`preservedStore`) to record `{ value, userEdited: boolean }` keyed by normalized field key/label.
3. Define `isFieldUnfilled(field, domVal)`: true if empty, placeholder string, `<select>` index 0 without meaningful value, or radio with untouched `defaultChecked`.
4. Update `applyFill`: If `hasAnswer` is true but `!userEditedElements.has(el)` and `!durableFieldStore.get(fieldKey)?.userEdited`, allow overwrite by profile facts.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/verified-combobox-writer.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/field-writer.js tests/verified-combobox-writer.test.mjs
git commit -m "feat(writer): add smart edit tracking for radio groups, labels and allow overwriting untouched portal defaults"
```

---

### Task 4: State-Guarded Checkbox Single Toggle & Universal React `_valueTracker` Reset

**Files:**
- Modify: `jobright_extension/core/field-writer.js:250-305, 1170-1185`
- Test: `tests/autofill-engine.test.mjs`

**Interfaces:**
- Consumes: Target boolean value and checkbox DOM element, or text/select element with target value.
- Produces: Guaranteed checkbox toggle without flipping back, universal `_valueTracker` reset across native text inputs, textareas, `<select>`, and checkboxes using `String(!desired)` for React string comparisons.

- [ ] **Step 1: Write the failing test in `tests/autofill-engine.test.mjs`**

```javascript
test('setCheckbox toggles an unchecked React controlled checkbox to true without double-toggling', () => {
  // Mock React checkbox that flips state on click and updates _valueTracker
  // Verifies element ends up checked: true and event dispatched once
});

test('setNativeValue resets React _valueTracker on text input, textarea, and select controls', () => {
  // Mock React text input and select with _valueTracker
  // Verifies tracker.setValue is invoked with previous value before dispatch
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/autofill-engine.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement state-guarded toggle & universal `_valueTracker` reset in `jobright_extension/core/field-writer.js`**

1. In `setNativeValue(el, val)`:
   - For text inputs, textareas, and `<select>`: reset `el._valueTracker?.setValue?.(prevValue)` before applying prototype setter and dispatching events.
2. In `setCheckbox(el, desired)`:
   - Check `if (checked(el) === desired) return true;`
   - Single click target: `target = findClickableTarget(el) || el; click(target);`
   - If `checked(el) === desired`, return true.
   - If not toggled: reset `el._valueTracker?.setValue?.(String(!desired))`, apply native prototype descriptor `desc.set.call(el, desired)`, and dispatch synthetic `input` and `change` events.
   - Return `checked(el) === desired`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/autofill-engine.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/field-writer.js tests/autofill-engine.test.mjs
git commit -m "fix(writer): prevent checkbox double-toggling and universal React _valueTracker reset"
```

---

### Task 5: Custom Comboboxes, Portals, Search Typeahead, Cascading Sequence & Safe Close

**Files:**
- Modify: `jobright_extension/core/field-writer.js:530-615`
- Test: `tests/verified-combobox-writer.test.mjs`

**Interfaces:**
- Consumes: Fields representing custom comboboxes (`[role="combobox"]`, `[aria-haspopup="listbox"]`, Radix, Select2) and target values.
- Produces: Opens menu via pointerdown/click/ArrowDown, searches body portals/shadow DOMs, falls back to typeahead typing with 300–500ms settling wait, executes cascading fields (Country -> State/Province -> City) sequentially with option settling, selects options, and safely closes menus without accidentally closing employer modal dialogs.

- [ ] **Step 1: Write the failing test in `tests/verified-combobox-writer.test.mjs`**

```javascript
test('fillCombo searches document.body portal listbox when opened via pointerdown and selects option', async () => {
  // Mock Radix combobox rendering options inside document.body portal
  // Verifies options are discovered, selected, and popover closed
});

test('fillCombo uses type-to-filter fallback when initial open shows no matching option', async () => {
  // Combobox requires typing search query to render asynchronous filtered results
});

test('cascading dropdowns populate sequentially (Country -> State -> City) with option settling wait', async () => {
  // Dependent dropdowns where State options only populate after Country is selected
});

test('closeCombo only dispatches Escape if listbox is still open, never closing employer modal', async () => {
  // Dialog containing a combobox: if already closed, Escape is NOT sent
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/verified-combobox-writer.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement portal discovery, typeahead, cascading sequence & safe close in `jobright_extension/core/field-writer.js`**

1. In `comboTrigger(el)` and `fillCombo`: dispatch `pointerdown` + `mousedown` + `click` (with `ArrowDown` keydown fallback).
2. Expand `getListboxRoots(el)` to query `document.body` for `[data-radix-popper-content-wrapper]`, `[data-floating-ui-portal]`, `.select2-dropdown`, `.k-animation-container`, and open shadow roots.
3. If `choose({ options }, desired)` finds no immediate match, detect `comboSearchInput(el, roots)`, type desired value via `setNativeValue`, await 350ms, and re-query options.
4. Support cascading sequence: Sort fill plans so `country` precedes `state`/`province`, which precedes `city`. When filling dependent location fields, wait up to 400ms for options to settle before matching.
5. In `closeCombo(el)`: Inspect whether the listbox or popup is still visibly open or `el.getAttribute('aria-expanded') === 'true'`. Only dispatch `Escape` key event if the combobox is STILL open, preventing accidental closure of employer application modals. Blur `el` before returning.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/verified-combobox-writer.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/field-writer.js tests/verified-combobox-writer.test.mjs
git commit -m "feat(writer): support body portal listboxes, type-to-filter fallback, cascading sequence, and safe modal close"
```

---

### Task 6: Scoped Consent & Acknowledgements with Marketing Blocklist

**Files:**
- Modify: `jobright_extension/core/field-mapping.js:820-826`
- Test: `tests/manual-fields-autofill.test.mjs`

**Interfaces:**
- Consumes: Form field candidate plans for checkboxes.
- Produces: Auto-checks mandatory legal/privacy terms while rejecting marketing/SMS/promotional checkboxes.

- [ ] **Step 1: Write the failing test in `tests/manual-fields-autofill.test.mjs`**

```javascript
test('planFill auto-checks privacy/terms legal acknowledgement checkboxes', () => {
  const field = { label: 'I agree to the Terms of Service and Privacy Policy', kind: 'checkbox' };
  const plan = planFill([field], candidate);
  assert.strictEqual(plan[0].status, 'supported');
  assert.strictEqual(plan[0].value, true);
});

test('planFill rejects marketing, SMS, and promotional checkboxes from auto-checking', () => {
  const field = { label: 'I agree to receive promotional SMS messages and job alerts', kind: 'checkbox' };
  const plan = planFill([field], candidate);
  assert.notStrictEqual(plan[0].status, 'supported');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/manual-fields-autofill.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement marketing blocklist in `jobright_extension/core/field-mapping.js`**

Add marketing exclusion regex:
`const MARKETING_REGEX = /(marketing|promotional|newsletter|sms|text message|job alert|future opportunit|talent network|third[- ]?party|partner)/i;`
If `MARKETING_REGEX.test(label || hint)`, keep `status: 'manual'` or `'needs_review'`.
If non-marketing and matches `/(agree|consent|terms|privacy|arbitration|acknowledg|certify|declare|confirm.*(?:terms|agreement|policy))/i`, set `factKey: 'consent'`, `status: 'supported'`, `value: true`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/manual-fields-autofill.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/field-mapping.js tests/manual-fields-autofill.test.mjs
git commit -m "feat(mapping): add marketing blocklist and auto-check scoped legal consent"
```

---

### Task 7: Debounced Multi-Step Transition Observer, Visible Field Tracking & Multi-Frame Aggregation

**Files:**
- Modify: `jobright_extension/core/application.js:1290-1360`, `jobright_extension/panel.js:1020-1040`
- Test: `tests/autofill-engine.test.mjs`

**Interfaces:**
- Consumes: DOM mutations and SPA route changes on multi-step wizard applications.
- Produces: Reactive execution of autofill on newly mounted, visible fields for Step 2/3/etc. (including visually-hidden native checkboxes/radios styled via labels) with in-flight fill lock, and multi-frame result aggregation across `allFrames: true` execution in `panel.js`.

- [ ] **Step 1: Write the failing test in `tests/autofill-engine.test.mjs`**

```javascript
test('step transition observer detects visible fields on SPA route change and triggers fill', async () => {
  // Simulates multi-step form step advancement and location.href diff
  // Verifies only newly mounted visible fields are processed
});

test('visible(el) treats sr-only or visually-hidden native checkboxes and radios as visible if associated label or wrapper has rects', () => {
  // Native input with 0x0 rect or display:none but visible <label>
  // Verifies field is not skipped as hidden
});

test('panel.js aggregateAutofillResults merges results across all returned frame outputs', () => {
  // Array of frame execution outputs from chrome.scripting.executeScript({ allFrames: true })
  // Verifies filled fields, unverified, and errors from all frames are aggregated cleanly
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/autofill-engine.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement debounced observer, label visibility & multi-frame aggregation in `jobright_extension/core/application.js` & `panel.js`**

1. In `core/application.js:observeStepTransitions` and visibility check:
   - Debounce `MutationObserver` 350ms on `document.body`.
   - Track `lastHref !== location.href` alongside `popstate` and `hashchange`.
   - For `visible(el)`: Check `el.getClientRects().length > 0`. If `el` is a checkbox or radio (`el.type === 'checkbox' || el.type === 'radio' || el.getAttribute('role') === 'checkbox' || el.getAttribute('role') === 'radio'`) and has no client rects, check its associated `<label>` (`el.labels`, `label[for="..."]`, or closest `label`/wrapper container). If that label/wrapper is visible, treat the field as visible.
   - Maintain `seenElements = new WeakSet()` and only add elements when `visible(el)`.
   - Use in-flight fill mutex to prevent overlapping fill runs.
2. In `jobright_extension/panel.js:fillForm`:
   - Pass `allFrames: true` in `chrome.scripting.executeScript`.
   - Aggregate results across all returned frame injection objects: merge `filled` arrays, `unverified` arrays, `warnings`, and overall status, instead of reading only `results[0].result`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/autofill-engine.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/application.js jobright_extension/panel.js tests/autofill-engine.test.mjs
git commit -m "feat(application): debounced multi-step transition observer with label visibility and multi-frame result aggregation"
```

---

### Task 8: Full Test Suite Verification & Package Build

**Files:**
- Test: all test suites
- Command: `npm test` and `node scripts/pack-extension.mjs`

**Interfaces:**
- Consumes: All 8 tasks.
- Produces: Passing test suite across all 256+ tests and clean extension zip.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: PASS (all tests pass, 0 failures)

- [ ] **Step 2: Package the extension**

Run: `node scripts/pack-extension.mjs`
Expected: Creates `dist/jobright_extension-v3.3.19.zip` cleanly.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(release): verify all test suites and package hardened extension"
```
