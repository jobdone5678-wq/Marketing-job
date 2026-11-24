# Ashby Application Autofill Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix form discovery and field resolution on Ashby ATS application pages so all candidate fields (name, email, phone, location, custom screening questions, checkboxes, and resume) are discovered and filled.

**Architecture:** Enhance `scopeToApplication()` in `form-discovery.js` to reject single-field leaf wrappers and anchor on the outer application container holding all controls. Update the Ashby adapter in `ats-adapters.js` to inspect container `data-field-path` and label `for` attributes for field hint extraction. Update `field-writer.js` to include autocomplete popup containers in listbox selection without premature blur during async typeahead option settlement.

**Tech Stack:** JavaScript (ESM / Chrome Extension MV3), Playwright, Node.js built-in test runner (`node --test`).

**Spec:** [docs/superpowers/specs/2026-11-24-ashby-autofill-fix-design.md](file:///c:/Users/bharg/Downloads/marketing-job/docs/superpowers/specs/2026-11-24-ashby-autofill-fix-design.md)

## Global Constraints
- Manifest V3 Chrome Extension compatibility.
- Synchronized bundle: Any updates to `jobright_extension/` files must be rebuilt into `tests/autofill-bundle.js` using `node scripts/build-autofill-bundle.mjs`.
- All 284 existing tests must remain passing (`npm test`).

## Review Focus
1. An application page where `<input type="file">` is wrapped in `<div class="ashby-application-form-input-file">` inside `<div class="ashby-application-form-container">` must return all fields in the container, not just the file input.
2. A single standalone file upload form on non-application pages must not crash or scope out of bounds.
3. An input without a `name` attribute whose parent has `data-field-path="_systemfield_location"` must resolve hint `current_location`.
4. Multi-step wizards (Step 2+ without file inputs) must continue scoping correctly without regressions.
5. Location combobox typing must allow async option population without closing prematurely.

---

### Task 1: Form Discovery Scoping Fix for Div-Based ATS Containers

**Files:**
- Modify: `jobright_extension/core/form-discovery.js:280-334`
- Test: `tests/ashby-discovery-scoping.test.mjs`

**Interfaces:**
- Consumes: DOM nodes passed to `scopeToApplication(rootNode)`
- Produces: Outermost application container element containing candidate controls

- [ ] **Step 1: Write the failing test**

Create `tests/ashby-discovery-scoping.test.mjs` simulating Ashby's DOM structure (nested `.ashby-application-form-input-file` within `.ashby-application-form-container` containing `_systemfield_name`, `_systemfield_email`, `_systemfield_phone`, and file input) and asserting `discoverFields(document)` finds all 4 fields instead of only 1.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ashby-discovery-scoping.test.mjs`  
Expected: FAIL (only 1 field discovered due to leaf container scoping).

- [ ] **Step 3: Implement container filtering in `scopeToApplication`**

In `jobright_extension/core/form-discovery.js`, update `scopeToApplication(rootNode)`:
- When walking ancestors from `fileInput`, check whether candidate container is a leaf wrapper:
  ```javascript
  const isLeafWrapper = el => /(?:-input|-field|-entry|-group|-item|-row|-slot|-wrapper|-dropzone)\b/i.test(el.className || '');
  ```
- Check if container contains other controls beyond the file input:
  ```javascript
  const hasMultipleControls = el => el.querySelectorAll('input:not([type="file"]):not([type="hidden"]), select, textarea, [role="combobox"]').length >= 1;
  ```
- Walk upward to the highest matching application container within `rootNode`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ashby-discovery-scoping.test.mjs`  
Expected: PASS (all 4 fields discovered).

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/form-discovery.js tests/ashby-discovery-scoping.test.mjs
git commit -m "fix(discovery): prevent scopeToApplication from stopping at leaf field wrappers"
```

---

### Task 2: Ashby Adapter Field Identification & Attribute Resolution

**Files:**
- Modify: `jobright_extension/adapters/ats-adapters.js:95-113`
- Test: `tests/ashby-adapter-hints.test.mjs`

**Interfaces:**
- Consumes: `el` (HTMLElement) in Ashby adapter `hint(el)`
- Produces: Standard canonical fact hint string (e.g. `'full_name'`, `'email'`, `'current_location'`, `'phone'`)

- [ ] **Step 1: Write the failing test**

Create `tests/ashby-adapter-hints.test.mjs` testing Ashby adapter against inputs with:
1. `name="_systemfield_name"` -> `'full_name'`
2. `name=""` but container has `data-field-path="_systemfield_location"` -> `'current_location'`
3. `name=""` but `<label for="_systemfield_location">` -> `'current_location'`
4. `id="09a328e0-..."` with label "Preferred Name" -> canonical resolution.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ashby-adapter-hints.test.mjs`  
Expected: FAIL on `data-field-path` and label `for` resolution for location.

- [ ] **Step 3: Implement enhanced hint extraction in Ashby adapter**

In `jobright_extension/adapters/ats-adapters.js`, update the Ashby adapter `hint`:
```javascript
const name = el.getAttribute('name') || el.id || '';
const path = el.getAttribute('data-field-path') || el.closest?.('[data-field-path]')?.getAttribute('data-field-path') || el.closest?.('.ashby-application-form-field-entry')?.querySelector('label')?.getAttribute('for') || '';
const identifier = name || path;
if (identifier === '_systemfield_name') return 'full_name';
if (identifier === '_systemfield_email') return 'email';
if (identifier === '_systemfield_location') return 'current_location';
if (identifier === '_systemfield_phone') return 'phone';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ashby-adapter-hints.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/adapters/ats-adapters.js tests/ashby-adapter-hints.test.mjs
git commit -m "fix(adapters): resolve Ashby data-field-path and label-for attributes to canonical hints"
```

---

### Task 3: Autocomplete Popup Listbox Selector & Combo Option Settlement

**Files:**
- Modify: `jobright_extension/core/field-writer.js:37-55, 706-745`
- Test: `tests/ashby-combobox-autocomplete.test.mjs`

**Interfaces:**
- Consumes: Combobox element and typeahead search input
- Produces: Selected option matching desired location without premature blur or closed popup

- [ ] **Step 1: Write the failing test**

Create `tests/ashby-combobox-autocomplete.test.mjs` verifying that `fillCombobox` recognizes options rendered inside `.ashby-application-form-input-autocomplete-popup` and selects the option matching `'Austin, TX'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ashby-combobox-autocomplete.test.mjs`  
Expected: FAIL (popup not found in listbox roots).

- [ ] **Step 3: Update `listboxSelector` and `fillCombo`**

In `jobright_extension/core/field-writer.js`:
- Add `[class*="autocomplete-popup" i]` and `[class*="floatingContainer" i]` to `listboxSelector`.
- In `fillCombo`, when typing into typeahead search input, do not dispatch `blur` until options have settled or the dropdown is explicitly closed.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ashby-combobox-autocomplete.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/field-writer.js tests/ashby-combobox-autocomplete.test.mjs
git commit -m "fix(writer): support autocomplete popups and prevent premature blur in combobox filling"
```

---

### Task 4: Bundle Rebuild & Live Ashby Verification Test

**Files:**
- Modify: `tests/autofill-bundle.js`
- Test: `tests/test-ashby-fill.mjs`

**Interfaces:**
- Consumes: Rebuilt `tests/autofill-bundle.js` from all updated extension core sources
- Produces: Full field population on live Ashby application URL

- [ ] **Step 1: Rebuild `tests/autofill-bundle.js`**

Run: `node scripts/build-autofill-bundle.mjs`

- [ ] **Step 2: Run full regression test suite**

Run: `npm test`  
Expected: All 284+ tests pass.

- [ ] **Step 3: Run live Ashby test**

Run: `node tests/test-ashby-fill.mjs`  
Expected: Filled 13+ out of 14 fields (Legal Name, Preferred Name, Email, Phone, Location, Checkboxes, Questions, Resume).

- [ ] **Step 4: Commit**

```bash
git add tests/autofill-bundle.js tests/test-ashby-fill.mjs
git commit -m "test: verify complete field autofill on Ashby application"
```
