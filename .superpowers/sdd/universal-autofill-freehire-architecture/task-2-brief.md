# Task 2: Question-First DOM Discovery & Multi-Step Scoping

**Files:**
- Modify: `jobright_extension/core/form-discovery.js:188-250`
- Create: `tests/universal-question-discovery.test.mjs`

**Interfaces:**
- Consumes: Document DOM tree, iframes, shadow roots.
- Produces: `discoverFields(tree)` returning grouped `Question` structures and scoped application form boundaries.

**Global Constraints:**
- Preserve all 74 existing adapters in `jobright_extension/adapters/ats-adapters.js` without deletion or regression.
- Safety invariants remain unconditionally active.
- All existing tests (`npm test`, `node tests/universal-discovery-attachment.test.mjs`) must continue to pass cleanly.

**Requirements & Steps:**
- [ ] **Step 1: Write the failing test in `tests/universal-question-discovery.test.mjs`**
Test that:
1. Sibling radio/checkbox options inside a `<fieldset><legend>Work Authorization</legend>...</fieldset>` or `[role="group"][aria-label="..."]` are grouped into one Question field with `kind: 'choice'` or `kind: 'checkbox-group'`.
2. A lone checkbox ("I agree to terms") under a generic legend retains its own specific label rather than the fieldset legend.
3. A page with both an application form (containing `<input type="file">` for resume) and a job alert form only returns fields from the application form (`scopeToApplication`).
4. On a form without a file input (Step 2 of a multi-step wizard), scoping falls back cleanly to the active form container without dropping fields.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/universal-question-discovery.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `scopeToApplication` and question-first grouping in `jobright_extension/core/form-discovery.js`**
Port FreeHire's question aggregation pattern into `form-discovery.js`:
1. Group checkbox/radio siblings sharing a labelled container (`fieldset > legend` or `[role="group"][aria-label]`).
2. Add group-of-one exception for single controls.
3. Add `scopeToApplication` to anchor on `<input type="file">` matching resume criteria; fall back to the active form container containing submit/next controls when no file input is present.
4. Deep Shadow DOM traversal remains intact.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/universal-question-discovery.test.mjs`
Expected: PASS

- [ ] **Step 5: Verify existing discovery tests still pass**
Run: `node tests/universal-discovery-attachment.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add jobright_extension/core/form-discovery.js tests/universal-question-discovery.test.mjs
git commit -m "feat(discovery): implement question-first grouping and application form scoping"
```
