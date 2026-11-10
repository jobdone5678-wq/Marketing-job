# Security Regression Test Suite Documentation

**Location**: `tests/security-phase1-critical.test.mjs`, `tests/security-phase2-high.test.mjs`, `tests/security-phase3-medium-low.test.mjs`  
**Execution Command**:
```bash
node --experimental-strip-types --test tests/security-*.test.mjs
```

---

## 1. Test Suite Coverage Summary

| Suite File | Vulnerabilities Verified | Assertions & Scenarios Tested | Outcome |
| :--- | :--- | :--- | :--- |
| **`tests/security-phase1-critical.test.mjs`** | VULN-01, VULN-03, VULN-04, VULN-05 | 1. `extensionProfile` rejects requests without Bearer tokens with 401.<br>2. `extensionProfile` rejects invalid Bearer tokens with 401.<br>3. `sanitizeJobHtml` strips `<script>`, `onerror`, `<iframe>`, and `javascript:` URLs.<br>4. `sanitizeJobHtml` safely handles `null`, `undefined`, and non-strings.<br>5. Next.js package version asserted to be `>= 16.4.5`.<br>6. Static assertion confirms hardcoded OpenAI token absent from route source. | **PASS (5/5)** |
| **`tests/security-phase2-high.test.mjs`** | VULN-06, VULN-07, VULN-08, VULN-09, VULN-10 | 1. Next.js 16 `src/proxy.ts` and `src/middleware.ts` exist and export `proxy`/`middleware` + matcher.<br>2. Extension pairing scripts in both directories validate `isTrustedOrigin(ev.origin)` and `ev.source === win`.<br>3. RTR `[id]` route enforces `sanitizeRtrId` and `candidateAccess`.<br>4. RTR `[id]` route does not interpolate raw strings into PostgREST `.or()` clauses.<br>5. Migration `20261105000100_candidate_shares_rls.sql` enables RLS and creates least-privilege policies. | **PASS (4/4)** |
| **`tests/security-phase3-medium-low.test.mjs`** | VULN-11, VULN-14, VULN-15, VULN-16 | 1. `cors()` allows valid 32-char extension ID (`/^[a-p]{32}$/i`).<br>2. `cors()` blocks invalid / malicious extension IDs.<br>3. Manifests in `jobright_extension` and `browser-extension-v3.2.1` have 0 occurrences of `nexckinhr.com`.<br>4. Gmail OAuth callback checks `isAllowedRedirectOrigin` and uses sanitized base path.<br>5. `checkRateLimit` permits requests within threshold and blocks subsequent calls with remaining = 0. | **PASS (4/4)** |

---

## 2. Regression Run Evidence

```text
✔ VULN-03: sanitizeJobHtml strips malicious script, event handlers, and iframes from job descriptions (22.84ms)
✔ VULN-03: sanitizeJobHtml handles null, undefined, and non-string inputs safely (0.84ms)
✔ VULN-05: next package is upgraded to >=16.4.5 to mitigate GHSA-2464-fhr4-w9xw & GHSA-673q-mjm6-r5xr (5.65ms)
✔ VULN-01: extensionProfile rejects missing or invalid authorization header with 401 (1445.33ms)
✔ VULN-04: generate-answer route does not leak hardcoded OpenAI API key fallback (2.77ms)
✔ VULN-06: Next.js 16 proxy.ts and middleware.ts are configured with matching pattern (3.73ms)
✔ VULN-07: extension agent-submission-sync validates ev.origin and ev.source (2.75ms)
✔ VULN-08 & VULN-09: RTR [id] endpoint enforces identifier validation and calls candidateAccess (1.94ms)
✔ VULN-10: migration 20261105000100_candidate_shares_rls enables RLS on candidate_shares (1.10ms)
✔ VULN-11: cors helper rejects malicious or invalid chrome-extension IDs (1637.32ms)
✔ VULN-14: extension manifests do not contain unauthorized typosquat domain nexckinhr.com (2.27ms)
✔ VULN-15: Gmail callback validates destination origin and prevents open redirect (1.89ms)
✔ VULN-16: rate limiter throttles requests after reaching threshold (1.03ms)
Total Tests: 13 | Passed: 13 | Failed: 0
```
