# Circular Country Logos & Screening Questions Unification Design

## Goal
1. Replace raw Unicode text country emojis with crisp, circular vector flag logos (`CountryFlag` component) on country pills, search dropdowns, and selected badges.
2. Unify the screening questions interface in `ProfileView.tsx`: eliminate the redundant dynamic per-country questions card so that selecting any number of authorized countries maintains the single, clean universal set of 8 screening questions.

## Approaches Considered
- **Approach 1 (Chosen)**: Dedicated `CountryFlag` component rendering standard circular vector SVGs (`https://hatscripts.github.io/circle-flags/flags/{code}.svg`) with an inline fallback to a styled 2-letter uppercase circular badge on error/offline. Completely eliminates repo bloat while delivering crisp circular flags on Windows and all platforms.
- **Approach 2 (Rejected)**: Bundling 138+ static SVG files directly into `public/flags/`. Rejected to avoid bloating the Git repository with redundant image assets.

## Architecture & Changes

### 1. New Component: `src/components/ui/country-flag.tsx`
- Accepts `code: string`, `name?: string`, `className?: string`.
- Renders an `<img>` loading `https://hatscripts.github.io/circle-flags/flags/{code.toLowerCase()}.svg`.
- Includes an `onError` handler that replaces the image with a fallback circular badge displaying the 2-letter uppercase country code with a subtle border and neutral background.
- Styled with `shrink-0 rounded-full object-cover`.

### 2. Update `src/components/profile/ProfileView.tsx`
- Replace `{c.flag}` and `{country.flag}` with `<CountryFlag code={code} name={name} className="size-4 shrink-0 rounded-full" />` across:
  - Popular country pills (`POPULAR_COUNTRY_CODES`)
  - Dropdown search results
  - Selected country badges
- Remove the dynamic `Country-Specific Screening Questions` section (`{countryQuestions.length > 0 && ...}`).
- Keep the clean universal 8 screening questions:
  1. Need visa sponsorship? (`visa_sponsorship_needed`)
  2. Willing to relocate? (`willing_to_relocate`)
  3. 18 or older? (`age_18_or_older`)
  4. Accept employers' privacy terms for me? (`privacy_consent`)
  5. Notice period (days) (`notice_period_days`)
  6. Desired salary amount (`desired_salary_amount`)
  7. Currency (ISO 4217) (`currency`)
  8. Salary period (`salary_period`)
- Clean up unused `countryQuestions` memo and related imports if no longer needed by `ProfileView.tsx`.

### 3. Autofill & Extension Behavior
- The browser extension evaluates `profile.screeningAnswers.authorized_countries.includes(jobCountryCode)` when handling job-specific work authorization questions on real ATS platforms.
- Universal answers (`visa_sponsorship_needed`, `notice_period_days`, etc.) map directly to ATS form fields.

## Verification Plan
- `npm run typecheck`: 0 errors.
- Run all test suites: all tests pass.
- Verify that selecting countries adds them as active green pills without spawning redundant question sections.
