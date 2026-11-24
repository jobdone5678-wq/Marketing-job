# FreeHire AI Autofill Engine: Hybrid Provider & Planning Architecture (Final Specification)

**Date:** 2026-11-24  
**Status:** Approved for Implementation  
**Topic:** Production integration of FreeHire's AI Autofill intelligence (`Plan`, `Choose`, and strictly typed `groundedIn` validation) into NextKinHR. Features 4-mode hybrid AI provider management (Server default, Portal encrypted BYOK, Extension direct BYOK, Local direct Ollama/LM Studio), two-table Supabase secret isolation with authenticated data (AAD) binding, connection-bound IP SSRF/DNS-rebinding immunity, a dedicated `VerifiedFact` builder, MV3 service worker lifecycle resilience, shared TypeScript bundling, dynamic conditional rescanning, and Playwright browser regression tests.

---

## 1. Intent & The Why

NextKinHR's Chrome extension currently relies on a two-tier autofill foundation: 74 specialized ATS adapters (Tier 1) and a universal DOM-based fallback scanner with strict 1-to-1 URL slotting and combobox drivers (Tier 2). However, for non-standard screening questions and dynamic career portal dropdowns:
1. **Inefficient Screening Resolution**: Unresolved questions are currently handled by calling `/api/extension/generate-answer` ad-hoc question-by-question, causing latency, token overhead, and lack of cohesive context across multi-field form steps.
2. **Hallucination Risk**: Two-word string overlap heuristics can admit false claims (e.g., claiming "Master's degree" when profile says "Bachelor's degree", or flipping negation on visa sponsorship). Question-specific typed evidence validation is required; raw word-overlap matching is eliminated.
3. **Provider Lock-In & Cost**: Screening generation relies solely on a server-configured key in `.env`. Job seekers and enterprise teams need Bring-Your-Own-Key (BYOK) for OpenRouter, DeepSeek, Groq, Mistral, and local offline models (Ollama, LM Studio).
4. **Security & MV3 Lifecycle Gaps**: Plaintext API keys must never be exposed to content scripts or clients; backend proxies must strictly defend against SSRF and DNS rebinding by binding the actual TCP socket to a validated IP; and long-running requests must survive Chrome MV3 30-second service worker idle termination.

By porting FreeHire's planning algorithms (`strelov1/freehire`, commit `2843637c09fb818fb64d4e7979638ff350b500c7`) into shared TypeScript, strengthening factual grounding with typed evidence IDs, and pairing it with a hardened 4-mode hybrid provider architecture, NextKinHR achieves production-grade universal autofill across any career portal.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Preserve Existing 74 ATS Adapters & DOM Architecture**: Retain all existing ATS adapters (`jobright_extension/adapters/ats-adapters.js`), universal discovery (`form-discovery.js`), 1-to-1 URL slotting, combobox interaction (`field-writer.js`), and Answer Bank (`answer-bank.js`) without regressions.
- **Port FreeHire Planning Core (`strelov1/freehire@2843637c`)**:
  - `Plan`: Batch form planning mapping unresolved DOM questions onto candidate profile facts in a single LLM turn, preserving neighbor context.
  - `Choose`: Combobox option selection choosing strictly from options read live from the DOM.
- **Dedicated VerifiedFact Builder & Anti-Hallucination (`groundedIn`)**:
  - Build typed candidate facts (`VerifiedFact`: id, type, value, rawSnippet) from profile, resume, and Answer Bank.
  - Mandatory `evidenceIds` for every factual fill.
  - Question-specific validation: skill-specific experience, exact qualification claims, certifications, dates/DOB, work authorization, and current versus future sponsorship.
  - Strict negation detection.
  - Eliminate word-overlap as an independent acceptance rule.
  - Mandatory unresolved/skip status when verified evidence is absent.
- **4-Mode Hybrid Provider Architecture**:
  1. *Server-managed default*: Built-in NextKinHR gateway via server `.env`.
  2. *Portal-managed encrypted BYOK*: AES-256-GCM encrypted in private database with AAD binding; executed via Next.js backend proxy.
  3. *Extension-only direct BYOK*: Stored in `chrome.storage.session` (or opt-in persistent); executed direct from extension service worker.
  4. *Local direct model (Ollama / LM Studio)*: Executed direct from extension service worker (`localhost:11434`) without server contact.
- **Security & Data Isolation**:
  - Separation of configuration metadata from encrypted credentials (two-table database pattern).
  - Dedicated `AI_PROVIDER_ENCRYPTION_KEY` (AES-256-GCM with 96-bit IV, 128-bit auth tag, and AAD: `user_id:key_origin`).
  - Audit and migrate `chrome.storage.local` dependencies in content scripts (`portal-connection.js`) before applying `TRUSTED_CONTEXTS`.
  - Outbound SSRF guard on server proxy: approved provider whitelist, socket-level IP binding with TLS SNI verification, blocking private/loopback/cloud-metadata IPs, and disabling automatic redirects.
  - Key-origin binding: Stored keys are rejected if Base URL host changes.
  - Extension message sender validation: `sender.id === chrome.runtime.id`.
- **Shared TypeScript Bundling**:
  - Bundle pure browser modules (`Plan`, `Choose`, `provider-client`, `grounded`, `verified-facts`) into `jobright_extension/core/ai/` via `scripts/bundle-extension-ai.mjs`, keeping server-only crypto, database, and SSRF code out of the extension.
- **MV3 Resilient Lifecycle**:
  - Bounded request timeouts (20s) with token budgeting and batching (max 4–6 questions per batch with neighbor context).
  - Resumable autofill sessions with stable `documentId`, `frameId`, `tabId`, `sessionId`, and `formRevision`.
  - Rejection of stale plans after page navigation or DOM mutations.
- **Dynamic Rescanning & Submission Safety**:
  - MutationObserver & settlement detection to uncover conditional questions revealed after interactive fills.
  - Preserve submission tracking: applications are marked applied ONLY after verified user confirmation, never after autofill.

### Non-Goals
- Migrating the extension to Svelte, Go, or WXT.
- Fully automated unattended form submission (submission confirmation requires explicit candidate approval).
- Attempting to bypass CAPTCHA, Cloudflare Turnstile, or biometric verification.

### Anti-Goals
- Fabricating or guessing immigration status, work authorization, sponsorship, date of birth, race, ethnicity, disability, or legal disclosures.
- Overriding confirmed profile facts or deterministic Answer Bank matches with AI guesses.
- Silently switching to the server provider when a user's BYOK request fails.
- Leaking user API keys to content scripts, logs, or analytics.

---

## 3. Subsystems & Architecture

```mermaid
flowchart TD
    subgraph Web Portal (Next.js)
        PS[User Account Settings / AI Provider]
        API_CFG[/api/extension/ai/settings<br/>GET: Masked Metadata | PUT: Versioned Config]
        API_TEST[/api/extension/ai/test-connection<br/>SSRF-Guarded Ping with Bound IP]
        DB_PUB[(public.user_ai_provider_configs<br/>Metadata & Routing)]
        DB_SEC[(private.user_ai_provider_secrets<br/>AES-256-GCM Encrypted Keys with AAD)]
    end

    subgraph Chrome Extension (MV3)
        EP[panel.html / panel.js<br/>AI Provider Settings & Autofill Dashboard]
        BG[background.js<br/>Session Manager, Worker Dispatcher & Router]
        CS[content.js & core/<br/>DOM Discovery, Scoping, Combobox Driver & Rescanner]
    end

    subgraph Shared Core (TypeScript)
        FACTS[src/lib/ai/verified-facts.ts<br/>VerifiedFact Builder]
        PLAN[src/lib/ai/planner.ts<br/>FreeHire Plan Port + Context Preservation]
        CHOOSE[src/lib/ai/chooser.ts<br/>FreeHire Choose Port]
        GROUND[src/lib/ai/grounded.ts<br/>Question-Specific Typed Validator]
        CLIENT[src/lib/ai/provider-client.ts<br/>OpenAI-Compatible Client + Capability Cache]
        SSRF[src/lib/ai/ssrf-guard.ts<br/>Socket IP Binding & DNS Rebinding Guard]
    end

    subgraph Upstream LLM Endpoints
        LOCAL[Local LLM: Ollama / LM Studio<br/>http://localhost:11434]
        REMOTE[Approved Remote Providers: OpenRouter, DeepSeek, Groq, OpenAI]
        PROXY[/api/extension/autofill/plan & choose<br/>Next.js Backend Proxy + SSRF Guard]
    end

    PS <-->|Save / Load| API_CFG
    API_CFG <--> DB_PUB
    API_CFG <--> DB_SEC
    API_CFG <-->|Metadata Sync| EP
    EP <-->|chrome.storage.session| BG

    CS -->|1. DOM Capture & Question Grouping| BG
    BG -->|2. Deterministic Slotting & Answer Bank| CS
    BG -->|3. Check Mode| ROUTER{Routing Mode}

    ROUTER -->|Mode 4: Local Direct| PLAN
    PLAN -->|Direct HTTP| LOCAL
    PLAN -->|Validate Grounding| GROUND

    ROUTER -->|Mode 3: Extension BYOK Direct| PLAN
    PLAN -->|Direct HTTP with User Key| REMOTE
    PLAN -->|Validate Grounding| GROUND

    ROUTER -->|Mode 1 or 2: Server / Portal BYOK| PROXY
    PROXY -->|Socket Bound SSRF & Decrypt Secret| REMOTE
    PROXY -->|Server-side Plan & Grounding| DB_SEC

    GROUND -->|4. Verified Fills| CS
    PROXY -->|4. Verified Fills| CS
    CS -->|5. Native Injection & Verification| CS
    CS -->|6. Rescan Conditional Questions| CS
    CS -->|7. Combobox Trigger| CHOOSE
    CHOOSE -->|8. Exact Option Pick| CS
```

---

## 4. Key Architectural Invariants

### 4.1 Socket-Bound SSRF & DNS-Rebinding Immunity
Pre-resolution DNS checks alone are vulnerable to DNS rebinding (Time-of-Check vs Time-of-Use).
In NextKinHR, `ssrf-guard.ts` implements a custom `http.Agent` / `https.Agent` with a custom `createConnection`:
1. Resolves hostname to an IP address.
2. Validates that the IP is NOT private, loopback, link-local, or cloud metadata (`169.254.169.254`).
3. Connects the TCP socket directly to that validated IP address.
4. For TLS (`https:`), passes `servername: hostname` into `tls.connect` to preserve valid SNI and certificate verification.
5. Sets `redirect: 'error'` to reject automatic HTTP redirects.

### 4.2 VerifiedFact Builder & Question-Specific Grounding
`src/lib/ai/verified-facts.ts` constructs a typed `Map<string, VerifiedFact>`:
- `profile.name`: Full name
- `profile.contact.email`, `profile.contact.phone`: Contact facts
- `profile.location.city`, `profile.location.state`, `profile.location.country`: Structured location
- `profile.work_auth.authorized_in_usa`: boolean
- `profile.work_auth.visa_status`: string
- `profile.work_auth.need_sponsorship_now`: boolean
- `profile.work_auth.need_sponsorship_future`: boolean
- `profile.experience.total_years`: number
- `profile.skills[skillName]`: skill existence & proficiency
- `profile.education.degree`: canonical qualification tier
- `profile.certifications`: list of verified certificates
- `answer_bank[topic]`: approved past screening answers

`grounded.ts` eliminates word-overlap. Every field fill must cite matching `evidenceIds` and pass category-specific validators (negation, numeric ceiling, degree ceiling, certification match). If evidence is missing, the field is marked `action: 'skip', source: 'unresolved'`.

### 4.3 Database Secret Security & AAD Encryption
- Two tables: `public.user_ai_provider_configs` and `private.user_ai_provider_secrets`.
- All client roles (`anon`, `authenticated`) have all permissions revoked from `private.user_ai_provider_secrets`.
- AES-256-GCM encryption with 12-byte IV and 16-byte auth tag.
- Additional Authenticated Data (AAD): `user_id + ":" + key_origin` is supplied to `cipher.setAAD()`. Tampering with either the user identity or the target provider origin causes decryption to fail.
- Optimistic locking via `config_version` integer column.

### 4.4 MV3 Resilient Execution & Content Script Audit
- Audit `jobright_extension/portal-connection.js`: remove direct `chrome.storage.local` calls and route pairing via `chrome.runtime.sendMessage({ type: 'NEXTKIN_SAVE_CONNECTION' })`.
- Set `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })`.
- Store extension-only keys in `chrome.storage.session`.
- Validate message senders: `sender.id === chrome.runtime.id`.
- Validate `documentId`, `frameId`, `tabId`, `sessionId`, and `formRevision` on every DOM write.

### 4.5 Extension AI Bundling Strategy
- `scripts/bundle-extension-ai.mjs` bundles pure TypeScript modules:
  - `src/lib/ai/planner.ts`
  - `src/lib/ai/chooser.ts`
  - `src/lib/ai/grounded.ts`
  - `src/lib/ai/verified-facts.ts`
  - `src/lib/ai/provider-client.ts`
- Outputs ES module `jobright_extension/core/ai/planner-bundle.js`.
- Keeps server-only modules (`encryption.ts`, `ssrf-guard.ts`, Supabase admin) strictly out of the extension.

---

## 5. Verification & Testing

1. **Unit Tests (`tests/ai/`)**:
   - `ssrf-guard.test.mjs`: Tests socket-bound IP connection, DNS rebinding, private ranges, IPv6 mapped IPv4, and TLS SNI preservation.
   - `verified-facts.test.mjs`: Tests mapping candidate profile, resume, and Answer Bank into typed evidence.
   - `grounded.test.mjs`: Tests rejection of experience inflation, degree elevation, certification fabrication, and negation reversal on visa questions.
   - `provider-client.test.mjs`: Tests capability detection, HTML error page guard, JSON mode retry, and 20s timeouts.
   - `planner.test.mjs`: Tests batch planning with neighbor context preservation and Zod validation.
   - `chooser.test.mjs`: Tests combobox option selection and unoffered option rejection.
2. **Integration Tests (`tests/`)**:
   - `ai-provider-database.test.mjs`: Tests two-table isolation, AAD encryption, optimistic versioning, and RLS blocking.
   - `ai-settings-sync.test.mjs`: Tests masked key egress and origin change handling.
   - `autofill-orchestrator-api.test.mjs`: Tests `/api/extension/autofill/plan` and `/choose` with feature flag and rate limiting.
   - `mv3-lifecycle-resilience.test.mjs`: Tests session resumption, stale-plan rejection, and storage access level.
   - `regression-all-adapters.test.mjs`: Tests all 74 ATS adapters with zero regressions.
3. **Playwright Extension Tests (`tests/e2e/`)**:
   - Real Chrome browser context with extension loaded.
   - End-to-end autofill on Greenhouse, Lever, Ashby, and Workday fixtures with custom OpenAI-compatible keys.
