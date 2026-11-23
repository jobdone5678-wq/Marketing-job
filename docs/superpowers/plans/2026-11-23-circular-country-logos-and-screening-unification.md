# Circular Country Logos & Screening Questions Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement crisp circular country vector flag logos via a dedicated `<CountryFlag />` component, and remove the dynamic per-country questions card in `ProfileView.tsx` so all selected countries share the clean universal 8-question screening form.

**Architecture:** Create `src/components/ui/country-flag.tsx` loading vector SVG circle flags (`https://hatscripts.github.io/circle-flags/flags/{code}.svg`) with an inline fallback. Update `src/components/profile/ProfileView.tsx` to use `<CountryFlag />` on pills, search dropdown, and badges, and delete the redundant dynamic `Country-Specific Screening Questions` section.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-23-circular-country-logos-and-screening-unification-design.md`

## Global Constraints
- Country flag icons must render as circular vector emblems, not raw Unicode text emojis.
- A failed or offline flag image load must degrade gracefully to a styled circular badge showing the 2-letter uppercase ISO code.
- Selecting any number of authorized countries must never spawn duplicate question forms; all countries share the exact 8 universal screening questions.
- Zero TypeScript typecheck errors (`npm run typecheck`) and all existing regression tests must pass.

## Review Focus
1. Lowercase code normalization: Ensure `CountryFlag` handles both uppercase (e.g. `US`, `IN`) and lowercase codes without 404s.
2. Graceful offline/error fallback: When SVG image load fails, an inline circular badge with the uppercase code is rendered.
3. Universal screening persistence: Ensure removing the per-country questions UI does not disrupt saving or loading the 8 universal screening answers (`visa_sponsorship_needed`, `willing_to_relocate`, `age_18_or_older`, `privacy_consent`, `notice_period_days`, `desired_salary_amount`, `currency`, `salary_period`).
4. Typecheck cleanliness: No unused imports or variables remain in `ProfileView.tsx`.
5. Parity with reference UI: Country pills render green when active and neutral when inactive, with the circular flag preceding the country name.

---

### Task 1: Create `CountryFlag` Component & Regression Tests

**Files:**
- Create: `src/components/ui/country-flag.tsx`
- Test: `tests/country-flag.test.mjs`

**Interfaces:**
- Produces: `export function CountryFlag({ code, name, className }: { code: string; name?: string; className?: string })`

- [ ] **Step 1: Write failing test in `tests/country-flag.test.mjs`**

Verify that:
1. `getCountryFlagUrl(code)` normalizes the code to lowercase and builds the proper HatScripts circle-flags SVG URL.
2. Component handles invalid or empty codes gracefully.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCountryFlagUrl } from '../src/components/ui/country-flag.tsx';

test('getCountryFlagUrl normalizes country codes to lowercase SVG URLs', () => {
  assert.equal(getCountryFlagUrl('US'), 'https://hatscripts.github.io/circle-flags/flags/us.svg');
  assert.equal(getCountryFlagUrl('in'), 'https://hatscripts.github.io/circle-flags/flags/in.svg');
  assert.equal(getCountryFlagUrl('AU'), 'https://hatscripts.github.io/circle-flags/flags/au.svg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/country-flag.test.mjs`  
Expected: FAIL ("cannot find module '../src/components/ui/country-flag.tsx'")

- [ ] **Step 3: Implement `src/components/ui/country-flag.tsx`**

Implement helper `getCountryFlagUrl(code: string): string` and client component `CountryFlag`:
```tsx
'use client';

import React, { useState } from 'react';

export function getCountryFlagUrl(code: string): string {
  if (!code) return '';
  return `https://hatscripts.github.io/circle-flags/flags/${code.trim().toLowerCase()}.svg`;
}

interface CountryFlagProps {
  code: string;
  name?: string;
  className?: string;
}

export function CountryFlag({ code, name, className = 'size-4 shrink-0 rounded-full' }: CountryFlagProps) {
  const [hasError, setHasError] = useState(false);
  const cleanCode = (code || '').trim().toLowerCase();
  const flagUrl = getCountryFlagUrl(cleanCode);

  if (!cleanCode) return null;

  if (hasError || !flagUrl) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center rounded-full bg-neutral-200 text-[9px] font-bold uppercase text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200 ${className}`}
      >
        {cleanCode.slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={flagUrl}
      alt={name ? `${name} flag` : `${cleanCode} flag`}
      className={`object-cover ${className}`}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/country-flag.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/country-flag.tsx tests/country-flag.test.mjs
git commit -m "feat: create CountryFlag component with circle-flags SVG and error fallback"
```

---

### Task 2: Integrate `CountryFlag` and Unify Screening Answers in `ProfileView.tsx`

**Files:**
- Modify: `src/components/profile/ProfileView.tsx`

**Interfaces:**
- Consumes: `<CountryFlag code={code} name={name} className="size-4 shrink-0 rounded-full" />` from `@/components/ui/country-flag`

- [ ] **Step 1: Update `ProfileView.tsx` to use `<CountryFlag />`**

1. Import `CountryFlag` from `@/components/ui/country-flag`.
2. Replace `{c.flag}` in country search dropdown with `<CountryFlag code={c.code} name={c.name} />`.
3. Replace `{country.flag}` in selected country badges with `<CountryFlag code={country.code} name={country.name} />`.
4. Replace `{country.flag}` in popular country pills (`POPULAR_COUNTRY_CODES`) with `<CountryFlag code={code} name={country.name} />`.

- [ ] **Step 2: Remove redundant dynamic `Country-Specific Screening Questions` card**

1. Remove `const countryQuestions = useMemo(...)` and unused `getCountrySpecificQuestions` import.
2. Remove JSX block `{countryQuestions.length > 0 && (<section>...</section>)}`.
3. Retain the universal 8-question screening form directly beneath the country pills.

- [ ] **Step 3: Run typecheck and full test suite**

Run: `npm run typecheck; node --experimental-strip-types --test tests/country-flag.test.mjs tests/no-mock-fallback.test.mjs tests/url-canonicalization.test.mjs tests/ats-scoring-feed.test.mjs tests/background-storage-proxy.test.mjs tests/universal-discovery-attachment.test.mjs tests/ai-screening-scoped.test.mjs tests/submission-pipeline-resilience.test.mjs tests/cross-tab-sync.test.mjs tests/application-lifecycle.test.mjs tests/job-details-match.test.mjs`  
Expected: PASS with 0 compiler errors and all 64 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/ProfileView.tsx
git commit -m "feat: use CountryFlag in profile screening and unify universal screening questions"
```
