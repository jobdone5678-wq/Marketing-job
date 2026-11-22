# Design Specification: Job Details Profile Match & Skills Breakdown

**Date:** 2026-11-23  
**Status:** Approved by User  
**Target Areas:** `src/app/dashboard/jobs/[id]/page.tsx`, `src/app/jobs/[id]/JobDetailClient.tsx`, `src/components/jobs/detail/JobFactsSidebar.tsx`, `src/components/jobs/detail/JobMatchCard.tsx`

---

## 1. Intent & Purpose

When a candidate views job details on FreeHire (`/dashboard/jobs/[id]` or `/jobs/[id]`), they need immediate clarity on how well their verified profile and resume align with the role's requirements. This design replaces the existing multi-step upload prompt and interactive claim/avoid popovers in `JobMatchCard` with a clean, high-fidelity **Profile Match** sidebar card matching the reference screenshot.

---

## 2. Requirements & Visual Layout

### 2.1 Profile Match Sidebar Card
The top card in `JobFactsSidebar` must render:
1. **Header**:
   - `Profile match` text in muted font (`text-xs font-semibold text-neutral-500`).
2. **Score & Summary Row**:
   - Bold percentage (e.g., `50%`) in `text-2xl font-bold text-neutral-900 dark:text-neutral-100`.
   - Right-aligned skill counter: `{matchedCount} of {totalCount} skills` (e.g. `1 of 2 skills`).
3. **Progress Bar**:
   - Smooth horizontal bar with emerald/green fill matching the percentage and neutral background.
4. **Matched Skills Group (`• You have`)**:
   - Green indicator dot (`●`) followed by `"You have"` label.
   - Soft green pill badges (`bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-full px-2.5 py-0.5 text-xs font-medium`).
5. **Missing Skills Group (`• Missing`)**:
   - Red indicator dot (`●`) followed by `"Missing"` label.
   - Clean, neutral pill badges with subtle borders (`border border-neutral-200 bg-white text-neutral-700 rounded-full px-2.5 py-0.5 text-xs font-medium`).
6. **Divider & Metadata**:
   - Retain the metadata list below the profile match section: Location, Region, Grade, Category, Country.
   - Retain the source attribution box and upvote/downvote buttons.

### 2.2 Explicit Constraints & Non-Goals
- **DO NOT implement "Tailor my CV"**: The button visible in third-party references must NOT be created, rendered, or linked.
- Remove the "Upload CV" box from the profile match card (profile skills are hydrated from the candidate's active account).
- Remove the complex "Close — you have a related skill" accordion and interactive popovers from the card to maintain a streamlined layout.

---

## 3. Architecture & Data Flow

```
[Supabase candidates & resumes]
               │ (Server-side fetch on /dashboard/jobs/[id])
               ▼
   DashboardJobDetailPage
               │ (candidateResume: { text, skills })
               ▼
        JobDetailClient
               │ (compareResumeToJob / skill normalization)
               ▼
       JobFactsSidebar
               │ (matchedSkills, missingSkills, matchPercentage)
               ▼
         JobMatchCard
  ┌────────────────────────────────────────────────────────┐
  │ Profile match                                          │
  │ 50%                                      1 of 2 skills │
  │ [========================                            ] │
  │                                                        │
  │ ● You have                                             │
  │ [ Java ]                                               │
  │                                                        │
  │ ● Missing                                              │
  │ [ Analytics ]                                          │
  └────────────────────────────────────────────────────────┘
```

1. **Server-Side Candidate Hydration**:
   In `src/app/dashboard/jobs/[id]/page.tsx`, inspect authenticated user session via `createClient()`. Query active candidate record from `candidates` and primary resume from `resumes`. Pass `candidateResume = { text, skills }` to `JobDetailClient`.
2. **Client-Side Fallback**:
   In `JobDetailClient.tsx`, if `candidateResume` is not provided (e.g., unauthenticated public `/jobs/[id]`), fall back to `useJobProfileSkills()` from local storage.
3. **Skill Matching Logic**:
   - Extract job requirements/skills (`job.skills` and `job.enrichment?.skills`).
   - Normalize strings (trim, lowercase).
   - Classify each job skill into `matchedSkills` (if present in candidate skills or resume text) or `missingSkills`.
   - Calculate `matchPercentage = Math.round((matchedSkills.length / totalSkillsCount) * 100)`.

---

## 4. Verification Plan

1. **Unit Tests**:
   - Create `tests/job-details-match.test.mjs` to test:
     - Accurate match percentage computation with multiple skills.
     - Correct categorization of matched vs missing skills.
     - Handling edge cases (0 job skills, 100% match, 0% match).
2. **Typecheck & Regression**:
   - Run `npm run typecheck` (`tsc --noEmit --incremental false`).
   - Run all existing 54 test suite cases to verify zero regression across the universal autofill and ATS scoring pipeline.
