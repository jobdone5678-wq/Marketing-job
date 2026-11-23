# Task 1 Implementation Report: Unconditional Field Safety & Strict 1-to-1 URL Slotting

**Task**: Task 1 - Unconditional Field Safety & Strict 1-to-1 URL Slotting  
**Status**: Completed  
**Commit**: `c4de859` (`feat(autofill): enforce unconditional 1-to-1 URL slotting and zero duplication`)  
**Target Repository**: `C:\Users\bharg\Downloads\marketing-job`  

---

## 1. Summary of Changes

Upgraded `jobright_extension/core/field-mapping.js` with FreeHire architectural patterns to guarantee unconditional 1-to-1 profile URL slotting and eliminate duplicate link injection and prose leakage into URL fields:

1. **`aliases.website` Sanitization**:
   - Removed `'urls other'` and `'other url'` from `aliases.website`.
   - Prevented ambiguous "other" link fields from erroneously resolving to the candidate's portfolio/website.

2. **Strict Profile URL Key Mapping (`linkFieldKey`)**:
   - Restricted `linkFieldKey` strictly to canonical candidate profile URL keys: `github_url`, `linkedin_url`, `portfolio_url`, and `website`.
   - Removed unmapped keys (`twitter_url`, `other_url`) so non-profile link inputs are recognized as unmapped link fields.

3. **Robust URL Field Identification (`isUrlField`)**:
   - Reliably identifies all URL and link controls across ATS platforms (including `type="url"`, `urls[...]` naming conventions, `_url`/`_link` suffixes, and link metadata).
   - Keeps actual URL fields out of screening admission and AI generation while preserving screening questions that incidentally mention keywords (e.g. *"Tell us about your experience with GitHub"*).

4. **Strict URL Format Validation (`candidateHttpUrl`)**:
   - Rejects any values containing whitespace (`\s`) or newlines (`\n`, `\r`, `\t`).
   - Requires protocol to be `http:` or `https:`.
   - Rejects credentials (`username`/`password`), empty hostnames, and invalid URLs via `new URL(value)` validation.

5. **Strict 1-to-1 Slotting & Zero Duplication (`planFill`)**:
   - Added `consumedUrls = new Set()` in `planFill`.
   - Mapped URL fields slot candidate links strictly 1-to-1.
   - Any extra link field attempting to reuse an already-consumed URL is blocked and marked `{ status: 'manual', reason: 'Unmapped link field; enter manually.' }`.
   - Unmapped link fields (e.g. `urls[Twitter]`, `urls[Other]`) receive `{ status: 'manual', reason: 'Unmapped link field; enter manually.' }`.
   - URL fields with invalid or missing candidate links receive `{ status: 'manual', reason: 'Enter a valid profile URL manually.' }`.

---

## 2. Test-Driven Development (TDD) Lifecycle

### Step 1: Failing Test Creation
Created `tests/strict-url-slotting.test.mjs` with comprehensive test cases:
1. Multi-URL forms (`urls[LinkedIn]`, `urls[GitHub]`, `urls[Twitter]`, `urls[Portfolio]`, `urls[Other]`, `urls[Website]`).
2. Verification of strict 1-to-1 slotting (`linkedin_url`, `github_url`, `portfolio_url`).
3. Unmapped link field manual marking (`'Unmapped link field; enter manually.'`).
4. Duplicate URL prevention across fields (reusing same URL for website/portfolio).
5. Validation that malformed URLs and whitespace/newlines are rejected.
6. Verification that zero prose or AI screening text can be slotted into URL fields during `NextkinApplication.fill`.

### Step 2: Test Failure Verification
Ran `node tests/strict-url-slotting.test.mjs`:
- Result: **FAILED** (as expected; unmapped link fields lacked consumed URL tracking, returned generic message, and accepted strings with leading whitespace).

### Step 3: Implementation
Implemented strict 1-to-1 URL slotting, `consumedUrls` set tracking, and whitespace rejection in `jobright_extension/core/field-mapping.js`.

### Step 4: Verification of Test Pass
Ran `node tests/strict-url-slotting.test.mjs`:
- Result: **PASS** (4/4 test suites passed).

### Step 5: Verification of Existing Test Suites
- Ran `node tests/autofill-url-fields.test.mjs`: **PASS** (6/6 tests passed).
- Ran full test suite `npm test` (`tests/*.test.mjs`): **PASS** (215/215 tests passed, 0 failures).

---

## 3. Git Diff Summary

```diff
diff --git a/jobright_extension/core/field-mapping.js b/jobright_extension/core/field-mapping.js
index 2274588..db1e100 100644
--- a/jobright_extension/core/field-mapping.js
+++ b/jobright_extension/core/field-mapping.js
@@ -68,3 +68,3 @@
-    website: ['website', 'portfolio', 'personal website', 'portfolio url', 'urls portfolio', 'urls other', 'personal url', 'homepage', 'home page', 'personal site', 'other url', 'blog url'],
+    website: ['website', 'portfolio', 'personal website', 'portfolio url', 'urls portfolio', 'personal url', 'homepage', 'home page', 'personal site', 'blog url'],
@@ -511,1 +511,2 @@
-      website: facts.website || candidate.website || candidate.portfolio_url || '',
+      portfolio_url: facts.portfolio_url || candidate.portfolio_url || facts.website || candidate.website || '',
+      website: facts.website || candidate.website || facts.portfolio_url || candidate.portfolio_url || '',
@@ -610,16 +610,14 @@
   function linkFieldKey(field) {
-    const element = field.element;
-    const candidates = [element?.name, element?.id, field.name, field.id, field.hint, field.label];
+    const element = field?.element;
+    const candidates = [element?.name, element?.id, field?.name, field?.id, field?.key, field?.hint, field?.label];
     for (const value of candidates) {
+      if (!value) continue;
       const name = linkMetadata(value);
-      if (/^(?:urls? )?(?:twitter|x twitter|twitter x)(?: (?:profile|url|link)){0,2}$|^(?:urls? x|x (?:profile|url|link))$/.test(name))
-        return 'twitter_url';
       if (aliases.github_url.includes(name) || /^(?:urls? )?git ?hub(?: (?:profile|url|link)){0,2}$/.test(name)) return 'github_url';
       if (aliases.linkedin_url.includes(name) || /^(?:urls? )?linked ?in(?: (?:profile|url|link)){0,2}$/.test(name)) return 'linkedin_url';
       if (/^(?:urls? )?(?:personal |professional )?portfolio(?: (?:website|url|link)){0,2}$/.test(name)) return 'portfolio_url';
-      if (/^(?:urls? other|other (?:url|link|website))$/.test(name)) return 'other_url';
       if (aliases.website.includes(name) || /^(?:urls? )?(?:personal (?:website|site|url)|website|blog)(?: (?:website|url|link)){0,2}$/.test(name))
         return 'website';
     }
@@ -627,7 +625,15 @@
   function isUrlField(field) {
+    if (!field) return false;
     if (field.type === 'url' || field.kind === 'url' || field.element?.type === 'url' || linkFieldKey(field)) return true;
-    return [field.label, field.name, field.id, field.hint, field.element?.name, field.element?.id].some(value =>
-      /^(?:urls?|(?:profile|social|personal|professional|website|external) (?:urls?|links?))$/
-        .test(linkMetadata(value))
-    );
+    const candidates = [field.label, field.name, field.id, field.hint, field.key, field.element?.name, field.element?.id];
+    return candidates.some(value => {
+      if (!value) return false;
+      const str = String(value);
+      if (/^urls?\[/i.test(str) || /[_-]urls?(?:[_-]|$)/i.test(str) || /[_-]links?(?:[_-]|$)/i.test(str)) return true;
+      const meta = linkMetadata(str);
+      return /^(?:urls?|links?|websites?)$/.test(meta) ||
+        /^(?:urls? )?(?:twitter|x twitter|twitter x|x|other|additional|social|blog|portfolio|website|github|linkedin|custom)(?: (?:profile|url|link|website)){0,2}$/.test(meta) ||
+        /^(?:profile|social|personal|professional|website|external|other|additional|custom) (?:urls?|links?)$/.test(meta) ||
+        /^(?:urls? )?(?:other|additional)$/.test(meta);
+    });
   }
@@ -636,4 +642,4 @@
   function candidateHttpUrl(value) {
     if (typeof value !== 'string') return null;
-    const text = value.trim();
-    if (!/^https?:\/\/[^\s\\/?#][^\s\\]*$/i.test(text)) return null;
+    if (/\s/.test(value)) return null;
+    if (!/^https?:\/\/[^\s\\/?#][^\s\\]*$/i.test(value)) return null;
@@ -660,1 +660,2 @@
     const aiPlan = (field, reason) => ({ field, status: 'ai', reason, options: (field.options || []).map(o => optionText(o)), aiPrompt: field.label });
+    const consumedUrls = new Set();
@@ -666,9 +667,21 @@
         const factKey = linkFieldKey(field);
+        if (!factKey) {
+          return { field, factKey: null, status: 'manual', reason: 'Unmapped link field; enter manually.' };
+        }
         const facts = candidate.confirmed_facts || candidate;
         const candidateLink = factKey === 'linkedin_url'
           ? (facts.linkedin_url || facts.linkedin || candidate.linkedin_url || candidate.linkedin)
           : facts[factKey];
-        const fallback = factKey === 'portfolio_url' ? (values.portfolio_url || values.website) : values[factKey];
-        const value = factKey && candidateHttpUrl(candidateLink || fallback);
-        return value
-          ? { field, factKey, status: 'supported', value }
-          : { field, factKey, status: 'manual', reason: 'Enter a valid profile URL manually.' };
+        const fallback = (factKey === 'portfolio_url' || factKey === 'website')
+          ? (facts.portfolio_url || facts.website || candidate.portfolio_url || candidate.website || values.portfolio_url || values.website)
+          : values[factKey];
+        const rawUrl = candidateLink || fallback;
+        const value = candidateHttpUrl(rawUrl);
+        if (!value) {
+          return { field, factKey, status: 'manual', reason: 'Enter a valid profile URL manually.' };
+        }
+        const normalizedUrl = value.toLowerCase();
+        if (consumedUrls.has(normalizedUrl)) {
+          return { field, factKey: null, status: 'manual', reason: 'Unmapped link field; enter manually.' };
+        }
+        consumedUrls.add(normalizedUrl);
+        return { field, factKey, status: 'supported', value };
```
