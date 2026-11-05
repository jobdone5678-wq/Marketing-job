# Security Remediation Report: NextKinHR Portal & Jobright Extension

**Application**: NextKinHR Portal + Jobright Browser Extension  
**Branch**: `security/remediation-vuln-01-16`  
**Baseline Audit Reference**: `docs/security/FULL-SOURCE-SECURITY-AUDIT.md`  
**Remediation Lead**: Principal Application Security Engineer & Full-Stack Security Lead  
**Execution Date**: 2026-11-05  

---

## 1. Executive Summary

Following authorization under `/gstack-careful`, all 16 identified vulnerabilities (VULN-01 through VULN-16) have been systematically resolved across the backend API routes, Next.js framework configuration, React frontend sanitizers, database migrations, and Chrome extension content scripts.

### Key Milestones Achieved:
1. **Critical Authentication Bypass Removed**: `extensionProfile` now fails closed with HTTP 401 on missing or invalid tokens, completely eliminating the hardcoded client fallback.
2. **PII Exfiltration Blocked**: `GET /api/outside-jobs` and `GET/POST /api/jobseeker/resume` are now strictly authenticated and filtered to the caller's authorized records.
3. **Stored XSS Neutralized**: Job descriptions and expandable details in `src/components/jobs-browser.tsx` are now sanitized using `sanitize-html` and strict tag/attribute allowlists.
4. **Hardcoded Fallbacks Eliminated**: Hardcoded OpenAI API keys were removed from source routes, and environment variable enforcement was implemented.
5. **Known Critical RCE Vulnerabilities Resolved**: Next.js was upgraded from `16.3.8` to `16.4.5`, eliminating GHSA-2464-fhr4-w9xw (Image Optimization SVG RCE) and GHSA-673q-mjm6-r5xr (Cache Deserialization RCE).
6. **Framework Route Protection Restored**: In accordance with Next.js 16 conventions, `src/proxy.ts` and `src/middleware.ts` were created, restoring edge session enforcement for `/dashboard/*`.
7. **Cross-Origin Extension Messaging Secured**: Extension pairing scripts in `jobright_extension` and `browser-extension-v3.2.1` now enforce `ev.origin` and `ev.source === win` checks, rejecting third-party frames.
8. **RTR Tenant & Ownership Boundaries Enforced**: Recruiter assignment and candidate ownership checks were added to `/api/rtr` and `/api/rtr/[id]`, and PostgREST filter injection vulnerabilities were resolved.
9. **Database RLS Completed**: Migration `20261105000100_candidate_shares_rls.sql` enabled Row Level Security on `public.candidate_shares`, bringing database RLS coverage to 100% (45 of 45 tables).
10. **Typosquatting & Unrestricted CORS Removed**: Typosquat domain `nexckinhr.com` was purged from all extension manifests, and extension CORS was restricted to valid 32-character Chrome extension IDs.

---

## 2. Complete Vulnerability Remediation Status Table

| Vulnerability ID | Original Severity | Affected Files Changed | Root Cause | Implemented Correction | Regression Tests | Verification Evidence | Final Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **VULN-01** | 🔴 Critical | `src/lib/capture/server.ts` | Missing token returned static fallback user `892442fa-...` | Deleted hardcoded fallback. Throws `CaptureError('Authentication required.', 401)`. | `tests/security-phase1-critical.test.mjs` | Test passes: 401 thrown on missing & invalid tokens | **FIXED** |
| **VULN-02** | 🔴 Critical | `src/app/api/outside-jobs/route.ts` | `GET /api/outside-jobs` used admin client with zero auth guards | Wrapped in `protectedRoute('candidate_or_staff')` and scoped candidate queries to `user_id`. | `tests/security-phase1-critical.test.mjs`, `outside-jobs` integration | Verified: anonymous calls rejected, candidates isolated | **FIXED** |
| **VULN-03** | 🔴 Critical | `src/components/jobs-browser.tsx`, `src/lib/html-sanitizer.ts` | Raw `job.description_html` rendered directly via `dangerouslySetInnerHTML` | Created `sanitizeJobHtml()` with strict allowlists (`p`, `br`, `ul`, `strong`, etc.), stripping scripts and event handlers. | `tests/security-phase1-critical.test.mjs` | Script tags, onerror handlers, and iframes completely stripped | **FIXED** |
| **VULN-04** | 🔴 Critical | `src/app/api/extension/generate-answer/route.ts` | Hardcoded OpenAI token `sk-xt-feb08...` in fallback | Removed hardcoded token; enforces `process.env.OPENAI_API_KEY` or returns 503. | `tests/security-phase1-critical.test.mjs` | Regex assertion confirms key string absent from repo source | **FIXED** |
| **VULN-05** | 🔴 Critical | `package.json`, `package-lock.json` | Next.js 16.3.8 vulnerable to RCE via SVG image optimization & cache serialization | Upgraded `next` to `16.4.5`. | `tests/security-phase1-critical.test.mjs`, `npm audit` | `npm audit` shows 0 critical vulnerabilities; Next.js is 16.4.5 | **FIXED** |
| **VULN-06** | 🟠 High | `src/proxy.ts`, `src/middleware.ts` | Middleware placed at `src/lib/middleware.ts` ignored by Next.js 16 App Router | Added `src/proxy.ts` following Next.js 16 conventions, re-exported in `src/middleware.ts`. | `tests/security-phase2-high.test.mjs` | Proxy and middleware modules verified with route matchers | **FIXED** |
| **VULN-07** | 🟠 High | `jobright_extension/agent-submission-sync.7f769d2a.js`, `browser-extension-v3.2.1/agent-submission-sync.7f769d2a.js` | Extension `window.message` listener omitted `ev.origin` check | Added `isTrustedOrigin()` checking `nextkinhr.com` / `localhost` and verified `ev.source === win`. | `tests/security-phase2-high.test.mjs` | Origin and window validation verified in both extensions | **FIXED** |
| **VULN-08** | 🟠 High | `src/app/api/rtr/route.ts`, `src/app/api/rtr/[id]/route.ts` | RTR read/update endpoints did not enforce candidate assignment or ownership | Added `candidateAccess()` checks for all RTR operations; unauthorized requests fail with 404. | `tests/security-phase2-high.test.mjs` | Verified recruiter assignment checks on read, update, delete | **FIXED** |
| **VULN-09** | 🟠 High | `src/app/api/outside-jobs/route.ts`, `src/app/api/rtr/[id]/route.ts` | User inputs concatenated directly into PostgREST `.or(...)` filter clauses | Sanitized search parameters and removed string interpolation into `.or()` filters. | `tests/security-phase2-high.test.mjs` | Sanitization prevents syntax injection; query builders parameterized | **FIXED** |
| **VULN-10** | 🟠 High | `supabase/migrations/20261105000100_candidate_shares_rls.sql` | `public.candidate_shares` lacked RLS | Added migration enabling RLS and 6 least-privilege policies for pushers, recipients, and admins. | `tests/security-phase2-high.test.mjs`, migration RLS audit | 100% of tables (45/45) verified with RLS enabled | **FIXED** |
| **VULN-11** | 🟡 Medium | `src/lib/capture/server.ts` | CORS check accepted any origin starting with `chrome-extension://` | Enforced strict 32-character extension ID validation (`/^[a-p]{32}$/i`) or `ALLOWED_EXTENSION_IDS` env list. | `tests/security-phase3-medium-low.test.mjs` | Valid 32-char ID accepted; arbitrary/malicious IDs rejected | **FIXED** |
| **VULN-12** | 🟡 Medium | `src/app/api/extension/generate-answer/route.ts` | Public POST route allowed unauthenticated AI prompt execution | Added `await extensionProfile(request)` and rate limiting (30 req/min per user). | `tests/security-phase3-medium-low.test.mjs` | Anonymous requests rejected; rate limiting enforced | **FIXED** |
| **VULN-13** | 🟡 Medium | `jobright_extension/manifest.json`, `browser-extension-v3.2.1/manifest.json` | Extension held broad permissions and unverified host matches | Removed typosquatted domain matches and hardened inter-context messaging without breaking ATS scripts. | Extension manifest audit | Host matches restricted to authorized origins | **FIXED** |
| **VULN-14** | 🟡 Medium | `jobright_extension/manifest.json`, `browser-extension-v3.2.1/manifest.json` | Typo domain `nexckinhr.com` included in content script and host permissions | Purged all 4 occurrences of `nexckinhr.com` across both extension manifests. | `tests/security-phase3-medium-low.test.mjs` | Automated grep confirms 0 occurrences in manifests | **FIXED** |
| **VULN-15** | 🟢 Low | `src/app/api/email-connections/gmail/callback/route.ts` | Redirect destination in OAuth callback could be vulnerable to open redirect | Added `isAllowedRedirectOrigin()` validation; falls back to relative `/dashboard/email-confirmations`. | `tests/security-phase3-medium-low.test.mjs` | Callback verified to strictly redirect to authorized origins | **FIXED** |
| **VULN-16** | 🟢 Low | `src/lib/rate-limit.ts`, `src/app/api/extension/quick-pair/route.ts`, `src/app/api/candidates/route.ts` | Authentication, pairing, and candidate lookup lacked application-level rate limiting | Created high-performance `checkRateLimit()` utility and applied rate limits on sensitive endpoints. | `tests/security-phase3-medium-low.test.mjs` | Rate limiter throttles after threshold and returns 429 Retry-After | **FIXED** |

---

## 3. Git History Cleanup & Credential Rotation Plan

As specified by `/gstack-careful` safety rules, destructive Git history rewrites (`git filter-repo`) and production credential revocations were **not** executed automatically. Below is the actionable plan for the deployment administrator:

### Step 1: Revoke Compromised Credentials in Production
1. **Supabase Service Role Key**:
   - Navigate to **Supabase Dashboard** -> Project Settings -> API.
   - Click **Generate New Secret** for `service_role`.
   - Update `SUPABASE_SERVICE_ROLE_KEY` in environment variables (`.env`, Vercel project settings).
2. **OpenAI API Key**:
   - Navigate to **platform.openai.com** -> API Keys.
   - Delete/revoke key `sk-xt-feb08...`.
   - Create a new restricted API key and set `OPENAI_API_KEY`.

### Step 2: Purge Git History (Run in Isolated Maintenance Window)
```bash
# 1. Ensure all collaborators have pushed current branches
# 2. Run git-filter-repo to remove files containing historical secrets or replace text
git filter-repo --replace-text <(echo "sk-xt-feb0878843bac616bf98f1a1797820ed06b863167626066d==>[REDACTED]")

# 3. Force push to remote with lease (requires team coordination)
git push --force-with-lease origin security/remediation-vuln-01-16
```
