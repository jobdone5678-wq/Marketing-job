# Task 1: Unconditional Field Safety & Strict 1-to-1 URL Slotting

**Files:**
- Modify: `jobright_extension/core/field-mapping.js:610-675`
- Create: `tests/strict-url-slotting.test.mjs`

**Interfaces:**
- Consumes: Candidate confirmed facts, field descriptors (`field.label`, `field.name`, `field.hint`).
- Produces: `planFill(fields, candidate, options)` returning clean URL mappings with consumed tracking and manual status for extra links.

**Global Constraints:**
- Safety invariants (1-to-1 URL slotting, zero duplicate URLs, blocking prose in URLs, native event dispatching) remain unconditionally active across all matching and adapter execution.
- Sensitive disclosures must never be synthesized or guessed.
- All existing tests (`npm test`, `node tests/autofill-url-fields.test.mjs`) must continue to pass cleanly.

**Requirements & Steps:**
- [ ] **Step 1: Write the failing test in `tests/strict-url-slotting.test.mjs`**
Test that on forms with multiple URL fields (`urls[LinkedIn]`, `urls[GitHub]`, `urls[Twitter]`, `urls[Portfolio]`, `urls[Other]`):
1. `linkedin_url` and `github_url` map 1-to-1 to their respective fields.
2. `portfolio_url` maps once to Portfolio/Website.
3. Unrecognized or extra links (`urls[Twitter]`, `urls[Other]`) are marked `{ status: 'manual', reason: 'Unmapped link field; enter manually.' }`.
4. No URL value is duplicated across fields.
5. Zero prose / screening text can be slotted into any URL field.
6. Malformed URLs or strings with spaces/newlines are rejected.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/strict-url-slotting.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement strict 1-to-1 URL slotting in `jobright_extension/core/field-mapping.js`**
Update `isUrlField`, `linkFieldKey`, and `planFill` to track `consumedUrls = new Set()`. Enforce that once a URL is slotted into a field, it cannot be assigned to another field. Ensure unmapped extra link inputs receive `{ status: 'manual', reason: 'Unmapped link field; enter manually.' }`. Reject values containing whitespace, newlines, or failing `new URL()`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/strict-url-slotting.test.mjs`
Expected: PASS

- [ ] **Step 5: Verify existing URL tests still pass**
Run: `node tests/autofill-url-fields.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add jobright_extension/core/field-mapping.js tests/strict-url-slotting.test.mjs
git commit -m "feat(autofill): enforce unconditional 1-to-1 URL slotting and zero duplication"
```
