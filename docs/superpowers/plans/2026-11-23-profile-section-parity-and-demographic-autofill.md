# Profile Section Parity & Demographic Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate the Freehire reference design for Profile (Summary, Language flags, Expanded Location with region & country flags, Demographics & EEO) and fix Gender, Ethnicity, and Veteran status autofill across live job applications using `jobright_extension`.

**Architecture:**
- **Profile Store & UI (`src/components/profile/ProfileView.tsx`, `src/lib/profile/`):** Expand `CandidateProfileState` to include `headline`, `summary`, `location.regions`, `location.countries`, `location.openToRelocation`, and `demographics` (`gender`, `raceEthnicity`, `veteranStatus`, `disabilityStatus`). Render Summary, Language flags, Remote Regions, Country tags with circular `CountryFlag` logos, Relocation checkbox, and Demographics card.
- **Backend API (`/api/jobseeker/resume`, `/api/extension/candidates`):** Store demographic fields in top-level Supabase `candidates` columns and `confirmed_facts`, ensuring backward-compatible hydration and exposing them to the extension.
- **Autofill Engine (`jobright_extension/core/field-mapping.js`):** Verify and enhance field aliases and semantic option matchers in `jobright_extension`, recompile `tests/autofill-bundle.js`, and remove legacy/unused `extension/` directory.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide React, Circle Flags SVG CDN, Vanilla JS Chrome Extension (`jobright_extension`), Node.js Test Runner.

**Spec:** [`docs/superpowers/specs/2026-11-23-profile-section-parity-and-demographic-autofill-design.md`](file:///C:/Users/bharg/OneDrive/Desktop/Marketing-job-main/docs/superpowers/specs/2026-11-23-profile-section-parity-and-demographic-autofill-design.md)

---

## Global Constraints
- Target extension is `jobright_extension/` ONLY. Legacy `extension/` directory must be removed.
- Circular vector country flags must use the `<CountryFlag>` component with `https://hatscripts.github.io/circle-flags/flags/{code}.svg` and 2-letter fallback badges.
- `location.countries` and `location.regions` in Tab 1 represent remote work / search preferences; `screeningAnswers.authorized_countries` in Tab 4 represents legal work authorization.
- `candidates.open_to_relocation` and `screeningAnswers.willing_to_relocate` must stay bidirectionally synchronized with Tab 1's checkbox.
- Demographics must allow standard voluntary self-identification and decline options.
- `npm run typecheck` must pass with 0 errors.
- `npm test` must pass.

## Review Focus
1. **Unanswered Demographics**: If a candidate leaves gender, race, or veteran status unselected in the profile, autofill must leave the field untouched rather than selecting an arbitrary or default option.
2. **EEOC Phrasing Variations**: When an ATS dropdown labels race as "Asian (Not Hispanic or Latino)" or "Asian", or veteran status as "I am not a protected veteran" vs "Not a veteran" vs "No", the matcher must correctly pick the equivalent option.
3. **Empty Location Countries**: When `location.countries` is empty, remote regions (`location.regions`) and worldwide preferences must continue to operate without breaking filters or profile loading.
4. **Relocation Deserialization**: Deserializing an existing candidate with `open_to_relocation: null` or undefined must default cleanly to `false` for the checkbox without crashing or generating false-positive "No" writes.
5. **Autofill Bundle Freshness**: Any change to `jobright_extension/core/field-mapping.js` must be recompiled into `tests/autofill-bundle.js` using `node scripts/build-autofill-bundle.mjs`.

---

## Tasks

### Task 1: Retire and Remove Legacy `extension/` Directory

**Files:**
- Delete: `extension/` (recursively remove entire directory)

**Interfaces:**
- Consumes: Nothing
- Produces: Project clean of duplicate/legacy extension codebase, ensuring all tooling points strictly to `jobright_extension/`.

- [ ] **Step 1: Check git status and list `extension/` directory**
Verify that `jobright_extension/` is intact and `extension/` is ready for deletion.
Run: `powershell -Command "Test-Path extension; Test-Path jobright_extension"`
Expected: Both return `True`.

- [ ] **Step 2: Delete `extension/` directory**
Remove the legacy `extension/` folder recursively.
Run: `powershell -Command "Remove-Item -Path extension -Recurse -Force"`

- [ ] **Step 3: Verify deletion**
Run: `powershell -Command "Test-Path extension"`
Expected: `False`.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "chore: remove legacy extension directory, keeping jobright_extension as primary"
```

---

### Task 2: Extend Candidate Profile Types and Profile Store

**Files:**
- Modify: `src/lib/profile/types.ts`
- Modify: `src/lib/profile/profile-store.ts`
- Test: `tests/profile-types.test.mjs`

**Interfaces:**
- Consumes: None
- Produces:
  - `CandidateLocation`: `{ workFormat: string[]; whereBased: string; regions: string[]; countries: string[]; openToRelocation: boolean; timezone: string }`
  - `CandidateDemographics`: `{ gender: string; raceEthnicity: string; veteranStatus: string; disabilityStatus: string }`
  - `CandidateProfileState`: includes `headline: string`, `summary: string`, `location: CandidateLocation`, `demographics: CandidateDemographics`
  - `DEFAULT_PROFILE`: provides valid default empty values for all new fields
  - `loadLocalProfile()` & `fetchRemoteProfile()`: deserialize and hydrate all new fields with backward-compatible fallbacks

- [ ] **Step 1: Write the failing test for profile types and serialization**
Create `tests/profile-types.test.mjs` validating that `DEFAULT_PROFILE` has `headline`, `summary`, `demographics`, `location.regions`, `location.countries`, `location.openToRelocation`, and that `loadLocalProfile` / `fetchRemoteProfile` preserve them.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE } from '../src/lib/profile/profile-store.ts';

test('DEFAULT_PROFILE contains all extended profile fields', () => {
  assert.equal(typeof DEFAULT_PROFILE.headline, 'string');
  assert.equal(typeof DEFAULT_PROFILE.summary, 'string');
  assert.ok(Array.isArray(DEFAULT_PROFILE.location.regions));
  assert.ok(Array.isArray(DEFAULT_PROFILE.location.countries));
  assert.equal(typeof DEFAULT_PROFILE.location.openToRelocation, 'boolean');
  assert.equal(typeof DEFAULT_PROFILE.demographics.gender, 'string');
  assert.equal(typeof DEFAULT_PROFILE.demographics.raceEthnicity, 'string');
  assert.equal(typeof DEFAULT_PROFILE.demographics.veteranStatus, 'string');
  assert.equal(typeof DEFAULT_PROFILE.demographics.disabilityStatus, 'string');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --experimental-strip-types tests/profile-types.test.mjs`
Expected: FAIL (fields undefined).

- [ ] **Step 3: Update `src/lib/profile/types.ts` and `src/lib/profile/profile-store.ts`**
In `src/lib/profile/types.ts`:
- Add `CandidateDemographics` interface.
- Add `regions: string[]; countries: string[]; openToRelocation: boolean;` to `CandidateLocation`.
- Add `headline: string; summary: string; demographics: CandidateDemographics;` to `CandidateProfileState`.

In `src/lib/profile/profile-store.ts`:
- Update `DEFAULT_PROFILE` with initial empty values.
- In `loadLocalProfile()`: extract and provide defaults for `headline`, `summary`, `location.regions`, `location.countries`, `location.openToRelocation`, `demographics`.
- In `fetchRemoteProfile()`: map remote candidate facts (`c.headline || facts.headline || ''`, `c.summary || facts.summary || ''`, `demographics: { gender: c.gender || facts.gender || '', raceEthnicity: c.race || facts.race_ethnicity || facts.race || '', veteranStatus: c.veteran || facts.veteran_status || facts.veteran || '', disabilityStatus: c.disability || facts.disability_status || facts.disability || '' }`, `location.regions: facts.location?.regions || []`, `location.countries: facts.location?.countries || []`, `location.openToRelocation: c.open_to_relocation ?? facts.location?.openToRelocation ?? false`).
- In `persistProfileToServer()`: include `headline`, `summary`, `location`, `demographics` in the payload sent to `/api/jobseeker/resume`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --experimental-strip-types tests/profile-types.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/profile/types.ts src/lib/profile/profile-store.ts tests/profile-types.test.mjs
git commit -m "feat(profile): expand profile types and store with demographics and location preferences"
```

---

### Task 3: Backend API Integration for Demographics & Extended Profile Facts

**Files:**
- Modify: `src/app/api/jobseeker/resume/route.ts`
- Modify: `src/app/api/extension/candidates/route.ts`
- Test: `tests/backend-profile-demographics.test.mjs`

**Interfaces:**
- Consumes: `CandidateProfileState` payload from `persistProfileToServer`
- Produces:
  - `POST /api/jobseeker/resume`: writes `headline`, `summary`, `gender`, `race`, `veteran`, `disability`, `open_to_relocation` to Supabase `candidates` and `confirmed_facts`.
  - `GET /api/extension/candidates?savedOnly=true`: returns `gender`, `race`, `race_ethnicity`, `veteran`, `veteran_status`, `disability`, `disability_status`, `headline`, `summary`, and `confirmed_facts`.

- [ ] **Step 1: Write the failing test for API route mappings**
Create `tests/backend-profile-demographics.test.mjs` testing that the API handlers extract and preserve `headline`, `summary`, `gender`, `race_ethnicity`, `veteran_status`, `disability_status`, and `open_to_relocation`.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --experimental-strip-types tests/backend-profile-demographics.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Update `src/app/api/jobseeker/resume/route.ts` and `src/app/api/extension/candidates/route.ts`**
In `src/app/api/jobseeker/resume/route.ts`:
- Extract `headline = body.headline || null`, `summary = body.summary || null`.
- Extract `demographics = body.demographics || {}`.
- Map:
  - `gender = demographics.gender || body.gender || usAnswers.gender || null`
  - `race = demographics.raceEthnicity || body.race || usAnswers.race_ethnicity || null`
  - `veteran = demographics.veteranStatus || body.veteran || countryAnswers.us_veteran || usAnswers.veteran_status || null`
  - `disability = demographics.disabilityStatus || body.disability || countryAnswers.us_disability || usAnswers.disability_status || null`
  - `openToRelocation = body.location?.openToRelocation ?? (screening.willing_to_relocate === 'yes' ? true : screening.willing_to_relocate === 'no' ? false : body.open_to_relocation ?? null)`
- Save these directly in `candidateUpdate` for `candidates` table and in `mergedFacts` for `confirmed_facts`.

In `src/app/api/extension/candidates/route.ts`:
- Ensure `autofillKeys` or facts mapping retains `gender`, `race`, `race_ethnicity`, `veteran`, `veteran_status`, `disability`, `disability_status`, `headline`, `summary`.
- In `resolvedCandidates`, guarantee that `gender`, `veteran`, `veteran_status`, `disability`, `disability_status`, `race`, `race_ethnicity` are always forwarded from `facts` or candidate columns.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --experimental-strip-types tests/backend-profile-demographics.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/app/api/jobseeker/resume/route.ts src/app/api/extension/candidates/route.ts tests/backend-profile-demographics.test.mjs
git commit -m "feat(api): persist and emit candidate demographics and profile summary to extension"
```

---

### Task 4: Enhance `jobright_extension` Demographic Autofill & Rebuild Bundle

**Files:**
- Modify: `jobright_extension/core/field-mapping.js`
- Test: `tests/demographics-autofill.test.mjs`
- Generated: `tests/autofill-bundle.js`

**Interfaces:**
- Consumes: `candidate` / `candidate.confirmed_facts` containing `gender`, `race`, `veteran`, `disability`
- Produces:
  - `planFill()` in `jobright_extension`: successfully maps form fields for gender, race/ethnicity, veteran status, and disability status to candidate facts with status `'supported'` and exact/fuzzy matched options.
  - `tests/autofill-bundle.js`: updated bundle reflecting all field mapping additions.

- [ ] **Step 1: Write unit tests for demographic autofill in `tests/demographics-autofill.test.mjs`**
Create `tests/demographics-autofill.test.mjs` that loads `tests/autofill-bundle.js` and verifies that forms asking for Gender, Race/Ethnicity, and Veteran status are planned and filled correctly:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bundle = fs.readFileSync('tests/autofill-bundle.js', 'utf8');
const fn = new Function(bundle + '\nreturn { fieldMapping: globalThis.FieldMapping || window.FieldMapping };');
const { fieldMapping } = fn();

test('demographics autofill resolves Gender, Race, and Veteran status', () => {
  const candidate = {
    full_name: 'Bhargav Reddy',
    confirmed_facts: {
      gender: 'Male',
      race: 'Asian (Not Hispanic or Latino)',
      veteran: 'I am not a protected veteran',
      disability: 'No, I do not have a disability'
    }
  };

  const fields = [
    { key: 'f1', label: 'Gender', kind: 'select', options: [{ text: 'Select' }, { text: 'Male' }, { text: 'Female' }] },
    { key: 'f2', label: 'Race/Ethnicity', kind: 'select', options: [{ text: 'White' }, { text: 'Asian (Not Hispanic or Latino)' }] },
    { key: 'f3', label: 'Veteran Status', kind: 'select', options: [{ text: 'I am not a protected veteran' }, { text: 'Protected veteran' }] },
    { key: 'f4', label: 'Disability Status', kind: 'select', options: [{ text: 'No, I do not have a disability' }, { text: 'Yes, I have a disability' }] }
  ];

  const plans = fieldMapping.planFill(fields, candidate);
  assert.equal(plans[0].value, 'Male');
  assert.equal(plans[0].status, 'supported');
  assert.equal(plans[1].value, 'Asian (Not Hispanic or Latino)');
  assert.equal(plans[1].status, 'supported');
  assert.equal(plans[2].value, 'I am not a protected veteran');
  assert.equal(plans[2].status, 'supported');
  assert.equal(plans[3].value, 'No, I do not have a disability');
  assert.equal(plans[3].status, 'supported');
});
```

- [ ] **Step 2: Run test to verify it executes (or fails if edge cases exist)**
Run: `node --experimental-strip-types tests/demographics-autofill.test.mjs`

- [ ] **Step 3: Enhance option matching in `jobright_extension/core/field-mapping.js`**
Review `pickOption` in `jobright_extension/core/field-mapping.js`:
- Add aliases for common ATS demographic dropdowns:
  - Gender: `"man"`, `"woman"`, `"male"`, `"female"`, `"non-binary"`, `"decline"`, `"prefer not to answer"`.
  - Veteran: `"i am not a protected veteran"`, `"not a veteran"`, `"i identify as one or more classifications of protected veteran"`, `"protected veteran"`, `"i do not wish to self-identify"`.
  - Race: `"asian"`, `"white"`, `"black or african american"`, `"hispanic or latino"`, `"two or more races"`, `"decline"`.
  - Disability: `"no, i do not have a disability"`, `"no disability"`, `"yes, i have a disability"`, `"i do not wish to answer"`.
- Run: `node scripts/build-autofill-bundle.mjs` to regenerate `tests/autofill-bundle.js`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --experimental-strip-types tests/demographics-autofill.test.mjs`
Expected: PASS.

- [ ] **Step 5: Pack extension and verify archive**
Run: `npm run pack:extension`
Expected: `Created jobright_extension.zip successfully!`.

- [ ] **Step 6: Commit**
```bash
git add jobright_extension/core/field-mapping.js tests/autofill-bundle.js tests/demographics-autofill.test.mjs jobright_extension.zip
git commit -m "feat(extension): harden demographic field mapping and recompile autofill bundle"
```

---

### Task 5: Upgrade `ProfileView.tsx` with Full Screenshot Parity

**Files:**
- Modify: `src/components/profile/ProfileView.tsx`
- Test: Manual browser verification and typecheck

**Interfaces:**
- Consumes: `CandidateProfileState`, `CountryFlag`, `COUNTRIES`, `POPULAR_COUNTRY_CODES`
- Produces: Complete Profile tab UI conforming to reference screens (Summary, Language flags, Location with regions & country tags, Demographics & EEO).

- [ ] **Step 1: Implement Summary Card in Tab 1 (Profile)**
Right below **Your CV**, add the **Summary** card:
- Headline input bound to `profile.headline`.
- Summary multiline textarea bound to `profile.summary`.
- Notice text: `As stated on your CV: {profile.contacts.location || profile.location.whereBased || 'Austin, TX'}`.

- [ ] **Step 2: Implement Language Flags & Search in Job Languages**
In the **Job languages** section:
- Add a language search dropdown filter.
- Render selected languages with circular flags: e.g. `<CountryFlag code="gb" name="English" className="size-3.5 shrink-0 rounded-full" /> English ✕`.
- Allow adding languages and removing selected language badges.

- [ ] **Step 3: Implement Expanded Location Section**
In the **Location** card:
- Work format pills: `Remote`, `Hybrid`, `On-site`.
- "Where you're based" input bound to `profile.location.whereBased`.
- "Remote — regions you can work for (empty = worldwide)" multi-select pill row:
  `Worldwide`, `North America`, `LATAM`, `Europe`, `UK`, `MENA`, `Africa`, `APAC`, `CIS`.
- "Add specific countries":
  - Search input with typeahead dropdown listing all 240+ countries from `COUNTRIES`.
  - Selected country badges with circular vector flags `<CountryFlag code={c.code} name={c.name} className="size-4 shrink-0 rounded-full" />` and remove button.
  - Popular country pills (`POPULAR_COUNTRY_CODES`) with flag + country name for 1-click add.
  - Count text: `+242 more — type to search`.
- `[ ] Open to relocation` checkbox bound to `profile.location.openToRelocation` (updating both `openToRelocation` and `screeningAnswers.willing_to_relocate`).
- Timezone selector dropdown.

- [ ] **Step 4: Implement Demographics & Equal Employment Opportunity (EEO) Card**
Add a dedicated card in Tab 1 (Profile) titled **Demographics & Equal Employment Opportunity (EEO)**:
- Explanation: *"Used by autofill for voluntary demographic disclosures on job applications. Never shared publicly."*
- Dropdown fields:
  - **Gender**: `Select Gender`, `Male`, `Female`, `Non-Binary`, `Prefer not to say`.
  - **Race / Ethnicity**: `Select Race / Ethnicity`, `Hispanic or Latino`, `White (Not Hispanic or Latino)`, `Black or African American (Not Hispanic or Latino)`, `Asian (Not Hispanic or Latino)`, `Native Hawaiian or Other Pacific Islander`, `American Indian or Alaska Native`, `Two or More Races`, `Decline to self-identify`.
  - **Veteran Status**: `Select Veteran Status`, `I am not a protected veteran`, `I identify as one or more classifications of protected veteran`, `I do not wish to self-identify`.
  - **Disability Status**: `Select Disability Status`, `No, I do not have a disability`, `Yes, I have a disability`, `I do not wish to answer`.
- Each dropdown binds to `profile.demographics.{field}` and autosaves via `updateProfile`.

- [ ] **Step 5: Run typecheck to verify no errors**
Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**
```bash
git add src/components/profile/ProfileView.tsx
git commit -m "feat(profile): add summary, language flags, expanded location, and demographics EEO card"
```

---

### Task 6: End-to-End Test Suite & Verification

**Files:**
- Create: `tests/profile-autofill-e2e.test.mjs`
- Test: All tests in `tests/*.test.mjs`

**Interfaces:**
- Consumes: Complete profile flow, Supabase candidate data structure, `tests/autofill-bundle.js`
- Produces: Proof that a candidate configured with Summary, Location preferences, and Demographics saves and translates cleanly into ATS autofill plans.

- [ ] **Step 1: Write `tests/profile-autofill-e2e.test.mjs`**
Write a comprehensive test that simulates:
1. Candidate profile state with Headline, Summary, Location countries/regions, and Demographics.
2. Conversion of profile to candidate record in database.
3. Fetching candidate via `/api/extension/candidates`.
4. Running `jobright_extension` `planFill` on simulated ATS form containing standard and demographic questions.
5. Verifying that Gender, Race, Veteran, and Disability fields are all planned with status `'supported'` and correct values.

- [ ] **Step 2: Run the test**
Run: `node --experimental-strip-types tests/profile-autofill-e2e.test.mjs`
Expected: PASS.

- [ ] **Step 3: Run the full test suite**
Run: `npm test`
Expected: All offline tests pass.

- [ ] **Step 4: Commit**
```bash
git add tests/profile-autofill-e2e.test.mjs
git commit -m "test: add comprehensive end-to-end test for profile demographics and autofill"
```

---

### Task 7: Final Verification & Clean Build

**Files:**
- None (verification only)

- [ ] **Step 1: Run TypeScript Typecheck**
Run: `npm run typecheck`
Expected: Exit code 0, 0 errors.

- [ ] **Step 2: Run Extension Packaging**
Run: `npm run pack:extension`
Expected: `jobright_extension.zip` created cleanly.

- [ ] **Step 3: Git status verification**
Run: `git status`
Expected: Clean working tree, all changes committed.
