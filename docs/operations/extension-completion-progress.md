# Extension completion ledger — 2026-10-21

Plan: `docs/superpowers/plans/2026-10-21-jobright-observed-workflow-parity.md`.

Authorized: complete the two reproduced screening review/undo bugs, durable evidence-validated screening with shared AI budgets, and tested form adapters. Preserve existing resume/capture behavior and user changes.

Ruling: retain the existing dirty checkout and use a local feature branch; a clean worktree would omit the user's newly built integration. No reset, broad staging, push, deployment or production migration.
Ruling: execute inline using the executing-plans and test-driven-development skills, with a fresh-context review at completion. Live Jobright profile setup remains a reference-observation prerequisite, not a reason to stall independently testable fixes.

- [x] Screening freshness and robust text/select/radio undo regressions.
- [x] Typed, evidence-validated screening schema and durable actor-scoped task flow.
- [x] Additive migration and task/worker/web processing integration.
- [x] Extension review flow: consent, polling, cancellation/freshness, exact option matching.
- [x] Field discovery/mapping/writing and tested generic/Greenhouse/Lever/Ashby/Workday adapter boundaries.
- [x] Capture/resume regression suite, production build, package and independent review.

At preflight, existing context/session modules recreated receipts on every ensure call, reviews lacked candidate/JD identity, and screening bypassed structuredAI/task budgets. Those implementation gaps are corrected in this release.


Implementation rulings: reuse the flat versioned resume job/source conventions for screening; keep the old route as an alias with explicit consent/context validation. Split validation/orchestration into evidence.ts/service.ts rather than duplicating authorization and repository logic. Repeated history, ambiguous mappings and inaccessible frames are explicit manual-review boundaries. New adapter runtime starts on deliberate profile selection, Fill Job Form or connected portal Apply launch; legacy isolated content-script fixtures retain their existing loading compatibility.

Review: fresh-context reviewer reproduced missing reference/emergency protections, controlled screening write misreporting and disabled combobox reset acceptance. Each was covered by a failing regression, fixed, then re-run successfully. No source changes were delegated.

Live evidence (2026-10-21): worker preflight succeeded against local configured gateway. A synthetic grounded screening call through real structuredAI succeeded with one in-memory accounting reservation; skills answered and unsupported duration omitted. No production DB writes in that probe. Production migration and paired deployment remain pending handoff, not claimed complete.


Final verification: 481/481 repository tests passed, zero skipped/failed (211.5 seconds). Production Next.js webpack build passed; standalone TypeScript check passed after build completion; scoped ESLint and git diff --check passed. The concurrent type-check attempt had encountered disappearing generated Next types, so its result was replaced with the successful post-build check. Fresh-context reviewer reported no remaining important issues after all three reproduced findings were corrected (33 focused checks passed in that final review).

Package: browser-extension-v3.2.0.zip, 25 files, 615960 bytes; SHA256 1BCF6D6CB52174AFD5BC372329E3C41581E41690481F776FC148B2596ABD877B. Every ZIP file was byte-compared with current source. A matching unpacked browser-extension-v3.2.0 folder is provided. Release instructions and measured support boundaries: docs/operations/extension-3.2-release.md.

Implementation is ready for review/deployment. Exact active Jobright parity, production migration, paired rollout and live authorized portal smoke validation are not claimed complete.


## Follow-up patch 3.2.1 — Stripe report

Restored missing canonical browser-extension source from the intact 3.2.0 distribution and restored its shared type declaration. Verified the supplied module-resolution failure was a missing source dependency, not a changed Next import API. Added a bounded Stripe/Greenhouse iframe bridge for explicit contact fill/undo, public linked-JD extraction, correct required/ARIA label matching, parent newsletter exclusion and serialized iframe operations. Resume attachment, extra iframe questions and iframe tracking remain explicit manual steps.

Fresh validation: 485/485 tests passed in a serial run; TypeScript passed; isolated Turbopack production build passed with a process-local 4096 MB heap limit after the initial parallel memory failure. Independent review found and verified the concurrent fill/Undo receipt fix, then reported no remaining important product issues. ZIP/source/unpacked byte comparison passed for 28 assets.

Current patch artifact: browser-extension-v3.2.1.zip, 620641 bytes; SHA256 74120FC57C5440E1A941055E7B2B8E6BEE30EEB95ADF2621C69A544D921CF1D0. See docs/operations/stripe-3.2.1-fix.md for observations, verification and in-place update instructions. Existing Chrome installations need Reload and a refreshed Stripe tab; a release copy does not update itself.
