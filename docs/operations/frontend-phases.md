# Recruiting operations frontend phases

Approved scope: the 2026-10-19 audit and phased frontend plan. Keep APIs, database behavior, authentication/OAuth, AI scoring, application capture, extension communication, and data contracts unchanged.

## Decisions

- Use the existing blue action color, Geist product font already present in the working tree, Lucide icons, Base UI primitives, and Tailwind 4. No new UI dependencies.
- Density 8, motion 2, variance 2. Tables and separated rows are the operational default.
- Preserve the dirty working tree. Reconcile existing changes rather than reset them or create a checkout that omits them.
- New overview routes compose existing authorized reads. No invented tenant switcher, subscription balance, analytics metric, eligibility decision, or match score.
- Existing candidate list API is paginated without server search. Label page-scoped filtering honestly.
- Resume provenance dependency: the existing applied-resume endpoint can reconstruct a fallback. Without a recorded snapshot the frontend must not claim exact applied-file identity or call that fallback endpoint as proof of provenance.
- Existing matching contracts do not independently score every requested compatibility dimension. Display candidate facts and explicit Unknown / Not evaluated states where necessary.
- SaaS subscription billing has no discovered contract. Provide a clearly unavailable billing screen and links to existing operational finance; no fake checkout.

## Phase ledger

| Phase | Scope | Status |
|---|---|---|
| 0 | Audit baseline and contracts | Audit completed; authenticated visual validation pending access |
| 1 | Shared shell, navigation, tokens, states | In progress |
| 2 | Recruiter dashboard and activity | Pending |
| 3 | Candidate roster and persistent profile | Pending |
| 4 | Job list and detail | Pending |
| 5 | Evidence-led shortlisting | Pending |
| 6 | Candidate/JD resume workspace | Pending |
| 7 | Application states, evidence history, exact-document presentation | Pending |
| 8 | Analytics from existing saved records | Pending |
| 9 | Integration health and existing connection workflows | Pending |
| 10 | Settings, admin and honest billing availability | Pending |

## Verification

Run TypeScript separately (Next build currently ignores TypeScript errors), production build, scoped lint, relevant browser and data-boundary regressions. Validate desktop, tablet, mobile, dark/light, keyboard, and loading/error/empty states using actual components with clearly synthetic fixtures where authentication prevents live access. Record final results and limitations here.
