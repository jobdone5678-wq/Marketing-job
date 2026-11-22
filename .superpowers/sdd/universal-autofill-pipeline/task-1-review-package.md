# Review Package: Task 1 - Shared URL Canonicalization & Whitelisting

## Commits
- `c7b0bcb`: feat: align shared URL canonicalization and parameter whitelist

## Stat Summary
```
jobright_extension/background.js       | 38 ++++++++++-------
jobright_extension/core/job-capture.js | 29 ++++++++++++-
src/lib/jobs/application-state.ts      | 77 ++++++++++++++++++++++++----------
tests/url-canonicalization.test.mjs    | 21 ++++++++++
4 files changed, 126 insertions(+), 39 deletions(-)
```

## Summary of Changes
- `src/lib/jobs/application-state.ts`: Exported `canonicalJobUrl` with strict query parameter preservation whitelist (`gh_jid`, `jobid`, `job_id`, `jk`, `requisition`, `req_id`, `id`) and stripping of marketing tracking parameters. Updated `applicationUrlKey` to use the whitelist and preserve route fragments.
- `jobright_extension/core/job-capture.js`: Aligned `cleanApplicationUrl` with the exact parameter preservation whitelist and hash route preservation.
- `jobright_extension/background.js`: Synchronized `cleanApplicationUrl` in background worker.
- `tests/url-canonicalization.test.mjs`: Added unit tests covering Greenhouse query parameters, Workday job IDs, and deterministic `applicationUrlKey` equivalence.
