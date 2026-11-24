# Ashby Application Autofill Scoping & Resolution Design

**Date:** 2026-11-24  
**Topic:** Ashby ATS Form Discovery & Autofill Population  
**Status:** Approved  

---

## 1. Intent and Why

On Ashby ATS job application portals (`jobs.ashbyhq.com/<company>/<job-id>/application`), candidate autofill failed to populate any fields (finding 0 text/select/checkbox inputs, or only discovering the resume file input wrapper). The intent of this design is to ensure robust, complete autofill across all Ashby job applications—accurately discovering and filling candidate details (legal name, preferred name, email, phone, location, links, checkboxes, and custom screening questions) without regressing other supported ATS platforms (Greenhouse, Lever, Workday, BambooHR, etc.).

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Ensure `scopeToApplication()` correctly identifies the outer application container on div-based forms like Ashby instead of prematurely stopping at single-field leaf wrappers.
- Ensure all candidate fields on Ashby (legal name, preferred name, email, phone, location combobox, checkboxes, choice questions) are discovered.
- Support Ashby's location autocomplete typeahead (`.ashby-application-form-input-autocomplete`) with its popup (`.ashby-application-form-input-autocomplete-popup`).
- Maintain 100% pass rate on the existing test suite (all 284 tests).

### Non-Goals
- Bypassing CAPTCHAs or Cloudflare bot challenges (must remain manual).
- Submitting the application automatically without candidate review when review is required.

### Anti-Goals
- Adding brittle, host-specific hardcoded overrides in generic form discovery when generalized DOM structural heuristics solve the problem across all div-based ATS platforms.
- Over-scoping to elements outside the application (e.g. newsletter signups, header search bars, or footer links).

---

## 3. Constraints
- Manifest V3 Chrome Extension compatibility.
- Synchronized bundle: Any updates to `jobright_extension/` core files must be rebuilt into `tests/autofill-bundle.js` via `npm run build:bundle` or `node scripts/build-autofill-bundle.mjs`.
- Test safety: No regression of multi-step wizard scoping, shadow DOM traversal, or isolated iframe discovery.

---

## 4. Approaches

### Approach 1: Generic Application Container Scoping & Multi-Control Validation (Selected)
- **Mechanism**:
  - Enhance `scopeToApplication()` in `jobright_extension/core/form-discovery.js`: when walking upward from an input (e.g. the resume file input), reject candidate containers that are single-field wrappers (matching leaf class tokens such as `-input-`, `-field-entry`, `-row`, `-slot`) or contain `< 2` interactive controls when larger ancestor containers exist.
  - Resolve to the outermost valid container (`.ashby-application-form-container`, `#form`, `[class*="application-form-container"]`, `main`, etc.).
  - Update `jobright_extension/adapters/ats-adapters.js` to inspect `data-field-path` and label `for` attributes so Ashby's location input (`_systemfield_location`) maps to `current_location`.
  - Add Ashby autocomplete popup selector (`[class*="autocomplete-popup" i]`, `[class*="floatingContainer" i]`) to `listboxSelector` in `jobright_extension/core/field-writer.js`.
- **Trade-offs**: Robust, generalized architecture across all div-based modern ATS platforms.

### Approach 2: Ashby Host Hardcoding (Rejected)
- Hardcode an Ashby-only special case `if (location.hostname.includes('ashbyhq.com')) return ...`.
- **Trade-offs**: Brittle, does not help other div-based ATS platforms with similar leaf wrapper classes.

---

## 5. Specification of Changes

1. **`jobright_extension/core/form-discovery.js`**:
   - In `scopeToApplication(rootNode)`:
     - Ensure candidate containers traversed from `fileInput` are valid application containers:
       - Must not be a leaf wrapper matching `/(?:-input|-field|-entry|-group|-item|-row|-slot|-wrapper|-dropzone)\b/i`.
       - Must contain interactive controls beyond the single file input (or contain a submit/next button).
     - Traverse upward to find the highest valid application container within `rootNode`.
2. **`jobright_extension/adapters/ats-adapters.js`**:
   - In the Ashby adapter (`id: 'ashby'`):
     - Check `el.getAttribute('name')`, `el.id`, `el.getAttribute('data-field-path')`, `el.closest('[data-field-path]')?.getAttribute('data-field-path')`, and `el.closest('.ashby-application-form-field-entry')?.querySelector('label')?.getAttribute('for')`.
     - Map `_systemfield_location` to `current_location`.
3. **`jobright_extension/core/field-writer.js`**:
   - Add `[class*="autocomplete-popup" i]` and `[class*="floatingContainer" i]` to `listboxSelector`.
   - In `fillCombo`: ensure typeahead search input does not dispatch premature blur while awaiting async options.
4. **Rebuild Bundle & Test**:
   - Run `node scripts/build-autofill-bundle.mjs`.
   - Run unit/integration tests with `npm test`.
   - Verify on live Ashby application with `node tests/test-ashby-fill.mjs`.
