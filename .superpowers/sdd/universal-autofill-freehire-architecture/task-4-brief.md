# Task 4: Verified Combobox Driver & Post-Fill Readback Verification

**Files:**
- Modify: `jobright_extension/core/field-writer.js:1-250`
- Create: `tests/verified-combobox-writer.test.mjs`

**Interfaces:**
- Consumes: Form plans (`planFill` output), document DOM.
- Produces: `applyFill(plans, context)` with native setters, combobox driver, and post-fill readback report `{ filled, unverified, manual, unmapped }`.

**Global Constraints:**
- Preserve all 74 existing adapters in `jobright_extension/adapters/ats-adapters.js` without deletion or regression.
- Safety invariants remain unconditionally active.
- All existing tests (`npm test`, `node tests/autofill-engine.test.mjs`) must continue to pass cleanly.

**Requirements & Steps:**
- [ ] **Step 1: Write the failing test in `tests/verified-combobox-writer.test.mjs`**
Test that:
1. Programmatic writes use native prototype descriptors (`HTMLInputElement.prototype`, `HTMLSelectElement.prototype`, `HTMLTextAreaElement.prototype`) and fire both `input` and `change` events so React and Angular forms register value changes.
2. Custom combobox (`[role="combobox"]`, `[aria-haspopup="listbox"]`) triggers option list opening, selects matching option text, and verifies the selected value.
3. Post-fill readback verification reads back element state 50ms after write and flags any field where a framework dropped the write as `unverified` in the post-fill report.
4. Returns a structured verification report `{ filled: [...], unverified: [...], manual: [...], unmapped: [...] }`.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/verified-combobox-writer.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement native setters, combobox protocol, and readback verification in `jobright_extension/core/field-writer.js`**
1. Implement `setNativeValue(element, value)` using `Object.getOwnPropertyDescriptor(prototype, 'value')` and dispatch `input`, `change`, `blur` events.
2. Port FreeHire's combobox interaction sequence: trigger open -> read available options -> match option text -> select option.
3. Add `verifyWrites(plans)` to re-read elements after write and return `{ filled, unverified, manual, unmapped }`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/verified-combobox-writer.test.mjs`
Expected: PASS

- [ ] **Step 5: Verify existing writer and autofill tests still pass**
Run: `node tests/autofill-engine.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add jobright_extension/core/field-writer.js tests/verified-combobox-writer.test.mjs
git commit -m "feat(writer): add framework-safe native value setters and post-fill readback verification"
```
