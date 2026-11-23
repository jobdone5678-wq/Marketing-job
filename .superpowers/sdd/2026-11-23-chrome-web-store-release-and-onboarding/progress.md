# SDD ledger — plan: docs/superpowers/plans/2026-11-23-chrome-web-store-release-and-onboarding.md

## Status
- [x] Task 1: Web Portal Session Auto-Redirect on Jobseeker Auth
- [x] Task 2: Manifest V3 Permissions & Match Boundaries Hardening
- [x] Task 3: Side Panel Binary Onboarding View & Empty State
- [x] Task 4: Distribution Packager & Hygiene Validation
- [x] Task 5: Store Submission Collateral & Asset Automation

## Log
- 2026-11-23: Task 1 complete (commit 55e1f95). Auto-redirects active candidate sessions from /auth/jobseeker to /auth/jobseeker/connected.
- 2026-11-23: Task 2 complete (commit 9b4646f). Sanitized manifest.json permissions and content script matches to omit broad wildcard http://*/*.
- 2026-11-23: Task 3 complete (commit 3196751). Implemented #onboarding-view and #authenticated-view binary switch in panel.html/css/js.
- 2026-11-23: Task 4 complete (commit 1d3eaa1). Fixed pack-extension to output clean sanitized dist/jobright_extension-v3.3.19.zip.
- 2026-11-23: Task 5 complete (commit 81154b6). Generated 4 store screenshots (1280x800) and aligned CHROMEWEBSTORE.md.
- 2026-11-23: Review pass complete (commit 34f1092). Swapped initial hidden attributes in panel.html to eliminate unauthenticated flash, called renderAccount synchronously, and added graceful pack error handling.






