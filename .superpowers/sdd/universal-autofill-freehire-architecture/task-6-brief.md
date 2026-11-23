# Task 6: Extension Answer Bank Client & Context-Aware Matching

**Files:**
- Create: `jobright_extension/core/answer-bank.js`
- Modify: `jobright_extension/core/field-mapping.js`
- Modify: `jobright_extension/panel.js`
- Create: `tests/answer-bank-extension.test.mjs`

**Interfaces:**
- Consumes: Saved answers from local storage / `/api/extension/answer-bank`, field question contexts.
- Produces: `matchAnswerBank(field, companySlug)` providing verified match or prompting candidate to save new answers with `[ Save for all jobs ]` / `[ Save for this company only ]`.

**Global Constraints:**
- Factual candidate profile data (`confirmed_facts`) always takes precedence over the Answer Bank.
- Universal answers (`company_scope: null`) match across any company.
- Company-specific answers match only when `companySlug` matches.
- Sensitive disclosures (legal consent, arbitration, background checks, electronic signatures, race, gender, disability, veteran status) are strictly barred from being saved or auto-matched from the Answer Bank.
- High-consequence answers (salary, visa sponsorship, work authorization) require exact option matching or candidate reconfirmation.
- All existing tests (`npm test`) must continue to pass cleanly.

**Requirements & Steps:**
- [ ] **Step 1: Write the failing test in `tests/answer-bank-extension.test.mjs`**
Test that:
1. Universal answers (`company_scope: null`) match across any company.
2. Company-specific answers match only when the company slug matches.
3. Factual profile data always overrides Answer Bank entries.
4. Sensitive disclosures (consent, signatures) are rejected from being saved to or matched from the Answer Bank.
5. In `planFill`, Answer Bank is checked as Tier 3 fallback before AI generation for unrecognized fields.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/answer-bank-extension.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `jobright_extension/core/answer-bank.js` and integrate into `field-mapping.js` and `panel.js`**
1. Implement `AnswerBankClient` in `jobright_extension/core/answer-bank.js` with local `chrome.storage.local` caching and API sync against `/api/extension/answer-bank`.
2. Integrate into `field-mapping.js` as Tier 3 fallback when `resolveFact` returns null, matching by question meaning, type, and options.
3. In `panel.js`, render the inline save prompt offering `[ Save for all jobs ]` and `[ Save for this company only ]` on manual answers/edits.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/answer-bank-extension.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add jobright_extension/core/answer-bank.js jobright_extension/core/field-mapping.js jobright_extension/panel.js tests/answer-bank-extension.test.mjs
git commit -m "feat(extension): integrate candidate answer bank with context-aware matching and offline caching"
```
