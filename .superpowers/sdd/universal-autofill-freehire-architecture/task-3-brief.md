# Task 3: Anchored Prefix Matching (`opensWith`) & Universal Adapter Fallback

**Files:**
- Modify: `jobright_extension/core/field-mapping.js:35-165`
- Modify: `jobright_extension/adapters/ats-adapters.js:1-85`
- Create: `tests/anchored-field-mapping.test.mjs`

**Interfaces:**
- Consumes: Question labels, adapter hints, field metadata.
- Produces: `resolveFact(label, hint)` returning canonical profile key with exact prefix boundaries.

**Global Constraints:**
- Preserve all 74 existing adapters in `jobright_extension/adapters/ats-adapters.js` without deletion or regression.
- Safety invariants (1-to-1 URL slotting, blocking prose, etc.) remain unconditionally active.
- All existing tests (`npm test`, `node tests/adapters.test.mjs`) must continue to pass cleanly.

**Requirements & Steps:**
- [ ] **Step 1: Write the failing test in `tests/anchored-field-mapping.test.mjs`**
Test that:
1. `"Are you legally authorized to work in this country?"` matches `authorized_in_usa` (or work authorization), NOT `country`.
2. `"First Name (required) id_1234"` matches `first_name` because `first name` opens the label.
3. Unlisted portal domains on custom URLs fall back to the registered `generic` adapter rather than returning null.
4. Multi-factor semantic evaluation checks question context, question kind, and options to prevent false positive keyword collisions.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/anchored-field-mapping.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `opensWith` matching and register the `generic` adapter**
1. In `jobright_extension/core/field-mapping.js`, implement `opensWith(label, synonym)` checking `label.startsWith(synonym)` and verifying non-alphanumeric trailing boundary (`!/[a-z0-9]/i.test(label.charAt(synonym.length))`).
2. Update `resolveFact` to use anchored prefix matching against canonical synonym lists instead of loose substring tests, so long questions don't trigger on incidental keywords trailing in the sentence.
3. In `jobright_extension/adapters/ats-adapters.js`, add the registered `generic` universal adapter that returns `canonicalHint(el)` so unlisted domains always have an active Tier 2 adapter.
4. Ensure Tier 1 adapter hints are sanitized through Tier 2 safety rules.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/anchored-field-mapping.test.mjs`
Expected: PASS

- [ ] **Step 5: Verify all adapter test suites still pass**
Run: `node tests/adapters.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add jobright_extension/core/field-mapping.js jobright_extension/adapters/ats-adapters.js tests/anchored-field-mapping.test.mjs
git commit -m "feat(mapping): add anchored prefix matching and universal generic adapter"
```
