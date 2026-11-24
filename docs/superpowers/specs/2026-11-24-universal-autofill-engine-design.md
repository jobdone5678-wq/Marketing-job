# Universal Autofill Engine Hardening Design

> **Date:** 2026-11-24  
> **Status:** Approved  
> **Target:** `jobright_extension/` (Manifest V3) & `src/app/api/extension/`

---

## 1. Intent & The Why

Job seekers using the NextKinHR Recruiting Copilot extension experience autofill failures across application forms on various Applicant Tracking Systems (ATS) and employer career portals. Rather than applying brittle, portal-by-portal patches, this project hardens the core autofill engine universally.

The objective is to guarantee seamless, reliable autofill across text inputs, checkboxes, radio groups, and custom comboboxes/dropdowns on any career portal, while smoothly observing and auto-filling multi-step (page-by-page) application wizards without infinite loops, race conditions, or overwriting manual candidate edits.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Universal Field Coverage:** Reliably populate text inputs, textareas, native `<select>`, custom comboboxes/listboxes (Radix UI, Headless UI, Select2, Workday prompt widgets, Kendo), checkboxes (native and ARIA), and radio groups (native and button-group Yes/No pills).
- **Airtight Candidate Data Delivery:** Ensure all candidate facts (contact details, work authorization, EEOC/demographics, education, skills, and answer bank entries) are projected intact from the API down to the content script with `provenance_status: 'confirmed'`.
- **Intelligent Value Preservation:** Differentiate between empty/placeholder defaults and genuine candidate manual edits. Never overwrite a user's intentional edit, and never trigger infinite fill loops.
- **Robust Event Simulation:** Dispatch framework-safe events (`pointerdown`, `mousedown`, `input`, `change`, `blur`) using native prototype descriptors and avoid checkbox double-toggling.
- **Cascading & Multi-Step Awareness:** Sequence dependent dropdowns (Country -> State -> City) with asynchronous option-settling waits, and observe multi-step wizard page transitions with debounced DOM and SPA route mutation tracking.
- **Structured Verification & Observability:** Perform post-write readback verification and produce structured logs detailing filled, preserved, manual, and unverified fields.

### Non-Goals
- Bypassing CAPTCHAs, Cloudflare gates, or bot challenges.
- Autonomous form submission or clicking "Submit Application" without candidate review.
- Auto-checking discretionary or promotional checkboxes (e.g., marketing texts, job alert emails).

### Anti-Goals
- Adding portal-specific domain branches or hardcoded site-specific selectors that fail when ATS markup updates.
- Aggressive background DOM thrashing or visible UI jitter from constantly opening/closing menus.
- Injecting disruptive floating overlay banners into employer web pages.

---

## 3. Constraints
- **Chrome Extension Manifest V3:** All DOM interactions execute within isolated content script contexts via `chrome.scripting.executeScript` (with `allFrames: true`) or injected content scripts without eval or remote code execution.
- **Reactive Framework Safety:** Must cooperate with React 17/18/19, Vue, Angular, and legacy jQuery form trackers without breaking internal framework state (including resetting `_valueTracker` before synthetic dispatch).
- **Data Integrity:** Consequential candidate disclosures (DOB, citizenship, legal consent) must follow verified candidate profile facts or explicit candidate decisions.

---

## 4. Approaches Considered

### Approach 1: Unified Semantic Engine & Reactive Event Pipeline *(Selected)*
- **Data Projection:** Unify SQL column selection and `confirmed_facts` in `api/extension/candidates/route.ts` and `panel.js:buildScopedProfile`.
- **Writer Intelligence:** Refine `hasAnswer` in `field-writer.js` to recognize blank/placeholder defaults and untouched initial DOM defaults (`el.defaultChecked` without user interaction) as overridable, while using a `WeakSet` + semantic identity map and an `isTrusted` event listener (tracking both native inputs and custom ARIA controls) to protect candidate manual edits.
- **Control Handlers:**
  - Checkboxes: State-guarded single toggle (verify `el.checked !== desired` before clicking or setter).
  - Radios: Pointer/click on both radio input and associated label/pill button containers with EEOC/Yes-No semantic option matching.
  - Custom Comboboxes: `pointerdown` + `mousedown` + `click` + `ArrowDown` trigger open, search `document.body` portals and open Shadow DOMs, type-to-filter fallback with 300–500ms option settling, handle cascading fields sequentially, and close/blur menus before proceeding.
  - Consent Checkboxes: Pre-filtered with a marketing blocklist before matching scoped legal/terms patterns.
- **Step Transitions:** Reactive step autofill (candidate navigates steps; debounced MutationObserver 350ms tracking `location.href` diffs + `popstate`/`hashchange` and `allFrames: true` auto-fills newly mounted, visible fields).
- **Trade-offs:** Cleanest architectural solution, portal-agnostic, zero UI jitter, highly resilient.

### Approach 2: Aggressive DOM Probing & Event Simulation *(Rejected)*
- Uses active polling and background opening of all listboxes on the page to discover options upfront.
- **Why rejected:** Heavy CPU/DOM thrashing, visual popover jitter, risk of tripping anti-bot detections.

### Approach 3: Two-Phase "Fill & In-Page Verification HUD" *(Rejected)*
- Injects a floating status widget into the employer's page with a manual "Fill Next Step" button.
- **Why rejected:** Intrusive DOM injection into employer forms, creates user friction instead of smooth automation.

---

## 5. Detailed Architecture & Implementation Specification

### 5.1 Area A: Profile Projection & API Endpoint Hardening
1. **Database Query (`src/app/api/extension/candidates/route.ts`)**:
   - Update `CANDIDATE_FIELDS` to explicitly select demographic and EEOC columns: `gender`, `race`, `race_ethnicity`, `veteran`, `veteran_status`, `disability`, `disability_status`, `work_authorization`.
   - In `savedOnly=true` handler:
     - Merge top-level candidate table columns with `candidate.confirmed_facts`.
     - Accept candidate if `candidate.full_name` is present on the record even if `confirmed_facts.full_name` was omitted.
     - Ensure returned profile maintains `provenance_status: 'confirmed'`.
2. **Side Panel Scoped Profile (`jobright_extension/panel.js:buildScopedProfile`)**:
   - Include `provenance_status: candidate.provenance_status || 'confirmed'`.
   - Include `race_ethnicity`, `primary_skills`, `skills`, `current_job_title`, `experience_years`, `total_experience_years` in `allowedKeys`.

### 5.2 Area B: Field Writer & Default Value Intelligence (`core/field-writer.js`)
1. **Smart `hasAnswer` & Dual-Layer User Edit Tracking**:
   - Install a window-level `isTrusted` listener capturing `change`, `input`, and `click`/`keydown` on both native inputs and custom ARIA controls (`[role="combobox"]`, `[role="radio"]`, `[role="checkbox"]`, `[role="switch"]`), recording modified nodes in `userEditedElements = new WeakSet()`.
   - Maintain a durable semantic map `durableFieldStore = new Map()` keyed by normalized field key/label (`preservedStore`) storing `{ value, userEdited: boolean }` so candidate edits survive SPA component unmounting/remounting across step navigation.
   - Evaluate `isFieldUnfilled(field, domVal)`:
     - Text/Textarea: Empty string, whitespace, or matches default placeholder regex (`placeholder.test(val)`).
     - Native `<select>`: `selectedIndex <= 0` with empty value or matching placeholder pattern (`/select|choose|--/i`).
     - Radios: Untouched initial DOM defaults (`el.defaultChecked` with no recorded `isTrusted` interaction) and unselected groups are considered overridable by confirmed candidate facts.
     - Checkboxes: Default unchecked state, or unselected state without user interaction.
   - Guard condition: If an element was modified by an `isTrusted` user event or is marked `userEdited` in `durableFieldStore`, preserve it. If it holds an unfilled or default portal state, allow candidate profile fact overwrite.
2. **Checkbox Toggling Without Double-Toggle Bug**:
   - Determine target state `desired = Boolean(value)`.
   - Read current state `current = checked(el)`.
   - If `current === desired`, write is already satisfied (`write = { expected: desired }`).
   - If `current !== desired`:
     - Apply single click on `findClickableTarget(el) || el`.
     - Check `checked(el) === desired`.
     - If not toggled (e.g. React controlled component ignoring synthetic click): reset `el._valueTracker?.setValue?.(prev)` and use native property descriptor `desc.set.call(el, desired)` + dispatch `input` and `change` events.
     - Re-verify `checked(el) === desired`.
3. **React `_valueTracker` Reset**:
   - Prior to dispatching synthetic `input` or `change` on React-controlled inputs, textareas, and checkboxes, reset `el._valueTracker?.setValue?.(previousValue)` ensuring React does not swallow the programmatic update.

### 5.3 Area C: Custom Dropdowns, Comboboxes & Cascading Sequence
1. **Opening Trigger**:
   - Dispatch `pointerdown`, `mousedown`, and `click` on `comboTrigger(el)`.
   - If unopened after 150ms, dispatch `KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 })`.
2. **Portal & Shadow DOM Search**:
   - Locate options across `document.body` (outside the parent form), `[data-radix-popper-content-wrapper]`, `[data-floating-ui-portal]`, `.select2-dropdown`, `.k-animation-container`, and open shadow roots.
3. **Type-to-Filter Fallback**:
   - If opening the menu does not reveal a matching option immediately:
     - Detect embedded `<input>` / `[contenteditable]` within or attached to the combobox.
     - Type target query via `setNativeValue(input, query)`.
     - Await 300–500ms for asynchronous/virtualized options to settle.
     - Select matching option element.
4. **Sequential Cascading Wait**:
   - Identify dependent fields (Country -> State/Province -> City).
   - After selecting Country, await child field `waitForFieldReady(childField, ctx, 1200)` allowing asynchronous option population.
5. **Clean Closure**:
   - Dispatch `Escape` or `blur` on the active combobox before initiating the next control fill so open floating popovers do not steal subsequent pointer clicks.

### 5.4 Area D: Scoped Consent & Acknowledgement Checkboxes (`core/field-mapping.js` & `core/application.js`)
1. **Marketing Blocklist & Consent Filter**:
   - Run an exclusion blocklist first:
     Reject any checkbox whose label/hint matches:
     `/(marketing|promotional|newsletter|sms|text message|job alert|future opportunit|talent network|third[- ]?party|partner)/i`
   - Only for non-blocked checkboxes matching mandatory legal/terms acknowledgements:
     `/(agree|consent|terms|privacy|arbitration|acknowledg|certify|declare|confirm.*(?:terms|agreement|policy))/i`
     Map matching fields with `factKey: 'consent'`, `status: 'supported'`, `value: true`.
   - Discretionary or promotional checkboxes remain `status: 'needs_review'` or `status: 'manual'` and are never auto-checked.

### 5.5 Area E: Debounced Multi-Step, Conditional Fields & SPA Navigation (`core/application.js`)
1. **Reactive Step Autofill Model**:
   - Candidate clicks "Next" / "Continue" at their own pace; the extension does NOT auto-click navigation buttons.
2. **MV3-Safe SPA Route & DOM Mutation Tracking**:
   - Do NOT monkey-patch `pushState`/`replaceState` (fails across MV3 isolated worlds).
   - Track `lastHref !== location.href` inside a 350ms debounced `MutationObserver` on `document.body`, alongside `popstate` and `hashchange` event listeners.
   - Service worker forwards `chrome.webNavigation.onHistoryStateUpdated` to active tabs.
3. **Conditional Fields & In-Flight Lock**:
   - Maintain `seenElements = new WeakSet()` and an in-flight fill lock.
   - Only add elements to `seenElements` once they are **visible and interactable** (`getClientRects().length > 0` and not hidden). Conditionally revealed fields (e.g., questions appearing after selecting "Yes") are evaluated and filled as soon as they become visible.
4. **Iframe & Frame Contexts**:
   - Ensure script execution and messaging pass `allFrames: true` so application forms embedded in third-party iframes (e.g. Greenhouse/Ashby boards on employer sites) are discovered and filled.

### 5.6 Area F: Readback Verification & Diagnostics
- Verify writes 50ms post-fill using `read(field)`.
- Emit detailed diagnostic summary to console/return payload:
  ```json
  {
    "filled": [{ "key": "first_name", "value": "Jane", "verified": true }],
    "unverified": [],
    "preserved": [{ "key": "custom_note", "reason": "user_edited" }],
    "manual": []
  }
  ```

---

## 6. Sizing & Builder Decisions Summary

### Work Sizing: **Project**
Touches API routes, extension panel, DOM discovery, field mapping, field writer, and multi-step lifecycle across Manifest V3 boundaries.

### Consolidated Decisions
1. **MV3 Route Detection:** Uses `location.href` diffs in debounced MutationObserver + `popstate`/`hashchange` + `webNavigation.onHistoryStateUpdated` instead of isolated world monkey-patching.
2. **Overridable Untouched Radios:** `defaultChecked` controls without `isTrusted` interaction can be overwritten by candidate profile facts; custom ARIA widget edits are captured via `click`/`keydown`.
3. **Marketing Exclusion Blocklist:** Strict regex blocklist prevents promotional/marketing auto-checks.
4. **Type-to-Filter & `_valueTracker`:** Comboboxes support typeahead search with 300–500ms debounce; React `_valueTracker` reset ensures synthetic events are recognized.
5. **Visible-Only Seen Tracking & `allFrames: true`:** Elements are only marked seen when visible, ensuring conditionally revealed inputs are processed; iframe application forms are fully supported.
