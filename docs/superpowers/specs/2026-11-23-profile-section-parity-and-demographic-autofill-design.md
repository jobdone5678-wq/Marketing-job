# Profile Section Parity & Demographic Autofill Design

## Goal & Intent
1. **Profile UI Parity**: Elevate the Next.js `ProfileView` tab to match the target Freehire reference design shown in the user's screenshots:
   - **Summary Card**: Headline input, multiline Summary textarea, and "As stated on your CV: {location}" notice.
   - **Job Languages**: Interactive language search dropdown with flag icons and tag management.
   - **Expanded Location Card**:
     - Work format toggles (Remote, Hybrid, On-site).
     - Where you're based input.
     - Remote regions multi-select pills (`Worldwide`, `North America`, `LATAM`, `Europe`, `UK`, `MENA`, `Africa`, `APAC`, `CIS`).
     - Specific country tags with circular vector country flag logos (`CountryFlag`), search typeahead across all 240+ countries.
     - `Open to relocation` checkbox.
     - Timezone selector.
   - **Demographics & Equal Employment Opportunity (EEO) Card**: Direct in-tab profile configuration for Gender, Race/Ethnicity, Veteran Status, and Disability Status.
2. **Single Source of Truth**: The details entered in the Profile section persist to the candidate record and act as the authoritative baseline for all job autofill operations.
3. **ATS Demographic Autofill Fix**: Resolve the issue where Gender, Ethnicity, and Veteran status fail to autofill on job applications (Greenhouse, Lever, Workday, Ashby, Taleo, etc.) across both `jobright_extension/` and `extension/`.

---

## Goals, Non-Goals, and Anti-Goals

### Goals
- Fully replicate the UI sections from the user's reference screenshots inside Tab 1 (Profile).
- Ensure all 240+ countries can be added as tags displaying circular vector flags (`CountryFlag`) and persisted cleanly.
- Persist profile headline, summary, location regions, location countries, relocation preference, and demographics to Supabase `candidates` and `confirmed_facts`.
- Expose these fields in `/api/extension/candidates` and `/api/jobseeker/resume`.
- Update both extensions (`jobright_extension/` and `extension/`) and rebuild `tests/autofill-bundle.js` so that `npm test` and `npm run pack:extension` pass with full demographic autofill support.
- Enable the browser extension to accurately detect and fill Gender, Race/Ethnicity, Veteran status, and Disability status on real job forms across `<select>`, radio groups, and text fields.

### Non-Goals
- Altering external ATS job application schemas or scraping third-party platforms directly.
- Overwriting explicit manual user answers if already chosen on a page.

### Anti-Goals
- Storing demographic fields only in extension client local storage (which would violate the single source of truth principle).
- Hardcoding exact literal string equality matching in the extension that breaks when an ATS labels an option slightly differently (e.g. "Male / Man" vs "Male").

---

## Constraints
- **Circular Country Flags**: Must use the established `CountryFlag` component with vector SVG URLs and 2-letter fallback badges.
- **Backwards Compatibility**: Existing candidate profiles without new fields must deserialize smoothly with standard defaults without breaking runtime or crashing on undefined.
- **Privacy & Compliance**: Demographics must allow standard "Decline to self-identify" / "Prefer not to say" choices.

---

## Approaches Considered

### Approach 1: Unified Profile & Resilient Cross-ATS Autofill Engine (Chosen)
- Provide full visual parity in `ProfileView.tsx` with all cards from the user's screenshots.
- Place Demographics & EEO directly in the Profile tab as requested by the user.
- Unify data flow: `ProfileView` ↔ `profile-store` ↔ `/api/jobseeker/resume` ↔ Supabase `candidates` ↔ `/api/extension/candidates` ↔ `jobright_extension/` & `extension/`.
- Equip both extensions with synonym mapping and semantic option-matching.

### Approach 2: Strict String Match Only (Rejected)
- Add the fields to the database and basic string matches to `fieldKeys.ts`.
- Rejected because real ATS forms frequently vary option labels (e.g., "Male (he/him)", "Asian (Not Hispanic or Latino)", "I am not a protected veteran"), causing autofill to fail without flexible matching.

### Approach 3: Client-Side Extension Storage Override (Rejected)
- Let the extension store demographics in Chrome local storage.
- Rejected because it violates the user's explicit requirement that autofill work based strictly on the web profile details as the single source of truth.

---

## Key Decisions & Reconciliations (Builder Calls)

1. **Target Extension Scope (Both Extensions Supported)**:
   - `jobright_extension/` is the active extension bundled via `npm run pack:extension` and compiled into `tests/autofill-bundle.js` tested by the root test suite (`npm test`).
   - `extension/` is the modern WXT/TypeScript extension.
   - Both extensions will be kept in full parity for demographic autofill (`gender`, `race_ethnicity`, `veteran_status`, `disability_status`).
   - `scripts/build-autofill-bundle.mjs` will be run to recompile `tests/autofill-bundle.js`.
2. **Location Countries vs. Legal Work Authorization**:
   - `location.countries` and `location.regions` in Tab 1 represent **remote work and search location preferences** (where the candidate wishes to work from or for).
   - `screeningAnswers.authorized_countries` in Tab 4 represents **legal work authorization** (which countries the candidate has legal right to work in without sponsorship).
   - ATS questions about legal authorization will continue to map to `screeningAnswers.authorized_countries`, while ATS questions about preferred location / intended work country map to `location.whereBased` / `location.countries`.
3. **Relocation State Synchronization**:
   - The Tab 1 `[ ] Open to relocation` checkbox binds to `location.openToRelocation: boolean`.
   - When checked, it sets `candidates.open_to_relocation = true` and `screeningAnswers.willing_to_relocate = 'yes'`.
   - When unchecked, it sets `candidates.open_to_relocation = false` and `screeningAnswers.willing_to_relocate = 'no'`.
4. **Demographics Source of Truth & Legacy Migration**:
   - Tab 1 Demographics is the primary source of truth.
   - `fetchRemoteProfile` / `loadLocalProfile` will hydrate demographics from top-level candidate fields, falling back to legacy `confirmed_facts.gender` or `screeningAnswers.country_specific_answers.us` if top-level fields are not yet set.
   - When saving, `resume/route.ts` populates both top-level columns (`gender`, `race`, `veteran`, `disability`) and writes into `confirmed_facts` and `screeningAnswers.country_specific_answers.us` to ensure 100% backward and forward compatibility.

---

## Detailed Architecture & Implementation

### 1. Types & State (`src/lib/profile/types.ts`)
Update `CandidateProfileState`:
```ts
export interface CandidateLocation {
  workFormat: string[];
  whereBased: string;
  regions: string[];      // e.g. ['Worldwide', 'North America']
  countries: string[];    // ISO country codes e.g. ['in', 'af', 'us']
  openToRelocation: boolean;
  timezone: string;
}

export interface CandidateDemographics {
  gender: string;
  raceEthnicity: string;
  veteranStatus: string;
  disabilityStatus: string;
}

export interface CandidateProfileState {
  photoUrl: string | null;
  cv: { ... } | null;
  headline: string;
  summary: string;
  roles: string[];
  seniorities: string[];
  jobLanguages: string[];
  contacts: CandidateContacts;
  location: CandidateLocation;
  demographics: CandidateDemographics;
  skills: string[];
  excludedSkills: string[];
  excludedSources: string[];
  excludedCompanies: string[];
  workHistory: WorkExperience[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  languages: string[];
  certifications: string[];
  screeningAnswers: ScreeningAnswers;
}
```

### 2. Profile View UI (`src/components/profile/ProfileView.tsx`)
In Tab 1 (Profile):
1. **Summary Card**:
   - Headline text input (e.g., "Full Stack Developer - G2I Talent Pool").
   - Summary multiline textarea.
   - Subtitle: *"As stated on your CV: {location}"*.
2. **Roles & Level**: Preserve existing role search, chips, and seniority level pill selector.
3. **Job Languages**:
   - Add language search dropdown.
   - Display selected languages as pills with country flag icons (e.g. `[UK Flag] English ✕`).
4. **Your Contacts**: Preserve existing contact inputs (Full name, Email, Phone, Location, Links).
5. **Location Card**:
   - Work format pill toggles: `Remote`, `Hybrid`, `On-site`.
   - "Where you're based" input.
   - "Remote — regions you can work for (empty = worldwide)":
     Pills: `Worldwide`, `North America`, `LATAM`, `Europe`, `UK`, `MENA`, `Africa`, `APAC`, `CIS`.
   - "Add specific countries":
     - Search input with typeahead dropdown over all 240+ countries from `COUNTRIES`.
     - Selected tags with circular `<CountryFlag code={code} name={name} className="size-4 shrink-0 rounded-full" />` and remove button.
     - Quick-select popular country pills with flags.
     - Count indicator: `+242 more — type to search`.
   - `[ ] Open to relocation` checkbox.
   - Timezone selector.
6. **Demographics & Equal Employment Opportunity (EEO) Card**:
   - Responsive grid with clean dropdowns:
     - **Gender**: `Select Gender`, `Male`, `Female`, `Non-Binary`, `Prefer not to say`.
     - **Race / Ethnicity**: `Select Race / Ethnicity`, `Hispanic or Latino`, `White (Not Hispanic or Latino)`, `Black or African American (Not Hispanic or Latino)`, `Asian (Not Hispanic or Latino)`, `Native Hawaiian or Other Pacific Islander`, `American Indian or Alaska Native`, `Two or More Races`, `Decline to self-identify`.
     - **Veteran Status**: `Select Veteran Status`, `I am not a protected veteran`, `I identify as one or more classifications of protected veteran`, `I do not wish to self-identify`.
     - **Disability Status**: `Select Disability Status`, `No, I do not have a disability`, `Yes, I have a disability`, `I do not wish to answer`.

### 3. Backend Persistence & Extension API
1. **`src/lib/profile/profile-store.ts`**:
   - Update `DEFAULT_PROFILE`, `loadLocalProfile`, `fetchRemoteProfile`, and `persistProfileToServer` to include `headline`, `summary`, `location.regions`, `location.countries`, `location.openToRelocation`, and `demographics`.
2. **`src/app/api/jobseeker/resume/route.ts`**:
   - Extract `body.headline`, `body.summary`, `body.demographics`, `body.location`.
   - Save to candidate columns: `gender`, `race`, `veteran`, `disability`, `open_to_relocation`.
   - Save to `confirmed_facts`: `headline`, `summary`, `demographics`, `gender`, `race_ethnicity`, `veteran_status`, `disability_status`, `location`.
3. **`src/app/api/extension/candidates/route.ts`**:
   - Ensure `gender`, `race`, `race_ethnicity`, `veteran`, `veteran_status`, `disability`, `disability_status`, `headline`, `summary` are preserved in `saved` candidate objects and in `resolvedCandidates`.

### 4. Extension Autofill Fix
1. **`jobright_extension/core/field-mapping.js`**:
   - Confirm demographic extraction and option mapping for `gender`, `race`, `veteran`, and `disability`.
   - Rebuild `tests/autofill-bundle.js` via `node scripts/build-autofill-bundle.mjs`.
2. **`extension/lib/nextkinhr.ts`**:
   - Add `gender?: string; race_ethnicity?: string; veteran_status?: string; disability_status?: string;` to `Candidate` interface.
3. **`extension/entrypoints/sidepanel/NextKinActions.tsx`**:
   - Update `candidateValues(candidate)` to pass `gender`, `raceEthnicity`, `veteranStatus`, `disabilityStatus`.
4. **`extension/lib/fieldKeys.ts`**:
   - Add field synonyms:
     ```ts
     gender: ['gender', 'geschlecht', 'sex', 'what is your gender', 'how do you identify'],
     raceEthnicity: ['race', 'ethnicity', 'race/ethnicity', 'ethnic background', 'demographic background', 'please identify your race'],
     veteranStatus: ['veteran', 'veteran status', 'protected veteran', 'are you a veteran', 'military status'],
     disabilityStatus: ['disability', 'disability status', 'handicap', 'do you have a disability'],
     ```
5. **`extension/lib/form.ts`**:
   - Update `profileToValues(p)` to include `gender`, `raceEthnicity`, `veteranStatus`, `disabilityStatus`.
   - In `fillField` and `chosenOptions`, add semantic option matchers for select dropdowns and radio buttons.

---

## Verification Plan
1. **Automated Tests**:
   - Run Next.js typecheck (`npm run typecheck` or `npx tsc --noEmit`).
   - Run root test suite (`npm test`).
   - Ensure 0 type errors or test regressions.
2. **Manual & Visual Inspection**:
   - Verify `ProfileView` renders the Summary card, Job languages with flags, Location card with regions & country flags, and Demographics card.
   - Verify selecting countries displays circular vector flags.
   - Verify saving the profile persists all fields to Supabase and localStorage.
   - Verify the extension extracts and autofills gender, race/ethnicity, veteran status, and disability on test form elements.
