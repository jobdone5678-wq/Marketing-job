# Task 3 Brief: Redesign `JobMatchCard` & Wire Match Logic in `JobDetailClient`

**Base Commit:** 19b8d6ed95060e01c8568025d8c362042f0c0a6b

## Deliverable
1. **`src/components/jobs/detail/JobMatchCard.tsx`**:
   - Redesign to match the reference layout:
     - Header: "Profile match" (`text-xs font-semibold text-neutral-500 dark:text-neutral-400`).
     - Score & counter row: `{matchPercentage}%` (e.g. `50%`) with `{matchedSkills.length} of {totalSkillsCount} skills`.
     - Progress bar: Single progress bar with `#5B891A` (or `emerald-600`) fill indicating `matchPercentage%`.
     - "• You have" section: Soft green dot + pills (`bg-emerald-50 text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 rounded-full px-2.5 py-0.5 text-xs font-medium`).
     - "• Missing" section: Rose/red dot + pills (`border border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 rounded-full px-2.5 py-0.5 text-xs font-medium`).
   - Remove "Upload CV" box, "Close — you have a related skill" section, and interactive claim/avoid popovers.
   - Strictly DO NOT include "Tailor my CV" button.
   - Retain requirements section if requirementsList is provided.
2. **`src/components/jobs/detail/JobFactsSidebar.tsx`**:
   - Streamline props passed to `JobMatchCard`: `matchPercentage`, `matchedSkills`, `missingSkills`, `totalSkillsCount`, `requirementsList`, `workFormat`, `countryName`.
3. **`src/app/jobs/[id]/JobDetailClient.tsx`**:
   - Wire `computeJobDetailsMatch(skillsList, candidateSkills, resumeText)` using server hydrated `candidateResume` or fallback `baseProfileSkills`.
   - Pass `matchPercentage`, `matchedSkills`, `missingSkills`, `totalSkillsCount` into `JobFactsSidebar`.

## Verification
- Run `node --experimental-strip-types --test tests/job-details-match.test.mjs`
- Run `npm run typecheck` (`tsc --noEmit --incremental false`)
- Run full test suite:
  `node --experimental-strip-types --test tests/url-canonicalization.test.mjs tests/ats-scoring-feed.test.mjs tests/background-storage-proxy.test.mjs tests/universal-discovery-attachment.test.mjs tests/ai-screening-scoped.test.mjs tests/submission-pipeline-resilience.test.mjs tests/cross-tab-sync.test.mjs tests/application-lifecycle.test.mjs tests/job-details-match.test.mjs`
- Commit changes.
