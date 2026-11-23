# Universal Job Autofill Engine: FreeHire Architectural Integration

**Date:** 2026-11-23  
**Status:** In Review  
**Topic:** Architectural integration of FreeHire's universal form detection, anchored question matching, verified combobox interaction, reusable answer bank, and explicit submission confirmation into the NextKinHR `jobright_extension` and platform.

---

## 1. Intent & The Why

NextKinHR's Chrome extension currently relies on 74+ portal-specific adapters (`jobright_extension/adapters/ats-adapters.js`). While effective for known ATS subdomains (e.g. `*.greenhouse.io`, `*.lever.co`), this approach exhibits critical vulnerabilities in the field:
1. **Fragility against DOM updates**: When major portals redesign DOM trees, change attribute naming conventions, or host applications on custom enterprise domains without standard ATS hostnames, the extension cannot resolve fields and falls back to raw or broken heuristics.
2. **URL Field Pollution**: When forms ask for multiple URLs (LinkedIn, GitHub, Portfolio, Twitter, Other), current logic frequently copies the portfolio or personal website across unrelated URL inputs, or misclassifies link inputs as open-ended screening questions and attempts to insert generated prose.
3. **Silent Filling Failures**: Modern frameworks (React, Angular, Vue, Web Components) frequently drop programmatic `.value = ...` changes unless exact native property descriptors and input/change events are dispatched and verified via readback.
4. **Application Submission Desynchronization**: Automatic submission tracking that relies exclusively on URL transitions or form disappearance produces false positives or drops submissions during complex SPA step-changes.

By adopting the proven, battle-tested architectural patterns from the open-source **FreeHire** extension (`strelov1/freehire`), NextKinHR transitions from a brittle *adapter-only* model to a **robust 3-tier hybrid engine**: retaining specialized adapters as high-performance accelerators, introducing universal question-first DOM discovery and anchored prefix matching as the primary baseline, and integrating a user-confirmed Answer Bank and post-fill verification loop.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Preserve All 74 Specialized Adapters**: Keep existing portal adapters in `jobright_extension/adapters/ats-adapters.js` as Tier 1 fast-paths, while providing an autonomous Universal Semantic Engine as Tier 2 fallback for unknown, modified, or custom-domain career portals.
- **Question-First Semantic Discovery**: Group inputs into unified *Questions* using `<fieldset>`, `<legend>`, ARIA containers (`[role="group"]`, `[role="radiogroup"]`), container headings, and label-for bindings rather than treating DOM nodes as disconnected inputs.
- **Application Form Scoping**: Automatically isolate the actual job application form by locating the CV/resume upload or application container, preventing accidental autofilling of adjacent newsletter or job alert signups.
- **Anchored Prefix Matching (`opensWith`)**: Replace greedy substring regexes with word-boundary anchored matching to prevent false positives (e.g., preventing *"Are you legally authorized to work in this **country**?"* from falsely triggering the personal `country` fact).
- **Strict 1-to-1 URL Slotting**:
  - `linkedin_url` strictly maps to LinkedIn.
  - `github_url` strictly maps to GitHub.
  - `portfolio_url` strictly maps to primary Portfolio / Personal Site.
  - **Zero Duplicate URLs**: Extra, secondary, or unrecognized URL fields (`urls[Other]`, `urls[Twitter]`, `Blog`, etc.) must remain clean/blank for manual candidate entry rather than receiving repeated URLs or prose.
- **Verified Interaction & Native Event Dispatch**: Implement FreeHire's `combobox.ts` and `form.ts` execution protocol: open combobox, read available options, select matching entry, dispatch synthetic `input`/`change`/`blur` events, and perform post-fill verification to confirm value retention.
- **Candidate Answer Bank**: Allow candidates to save approved answers for novel employer screening questions into a persistent, privacy-controlled Answer Bank stored in Supabase and cached locally in `chrome.storage.local`.
- **Explicit Submission Confirmation**: Prompt the candidate (*"Did you submit your application?"*) with a side-panel / widget confirmation when an application form disappears, atomically syncing submission state with Supabase and the web dashboard.
- **Feature Flag Controlled Rollout**: Gate universal semantic fallback behind a configurable feature flag (`NEXT_PUBLIC_ENABLE_UNIVERSAL_AUTOFILL_V2`) to ensure safe, gradual deployment.

### Non-Goals
- Re-architecting the extension build system into WXT/Svelte; the extension remains in vanilla ES/MV3 inside `jobright_extension/` to maintain seamless compatibility with existing packaging scripts and node test harnesses.
- Fully automated headless application submission without candidate presence or review.
- Overriding portal CAPTCHAs, biometric challenges, or Cloudflare Turnstile gates.

### Anti-Goals
- Guessing or synthesizing voluntary demographic disclosures (race, gender, disability, veteran status) without explicit user confirmation.
- Injecting multiline text or cover letter prose into URL or single-line input fields.
- Over-grouping distinct questions that share a container (e.g., merging all text fields in an "Address" section into a single question).

---

## 3. Constraints

1. **Manifest V3 Runtime**: The extension runs in Chrome MV3. Background tasks must survive service worker teardown; cross-frame communication must route cleanly via `chrome.tabs.sendMessage` and `chrome.runtime.onMessage`.
2. **In-Place Architecture**: All improvements must directly integrate into `jobright_extension/` and maintain passing status for existing test suites in `tests/`.
3. **Strict License & Clean-Room Compliance**: Algorithms from FreeHire (MIT license) must be adapted cleanly to NextKinHR's domain model without verbatim copying of proprietary assets, styles, or branding.

---

## 4. Approaches Considered

### Approach A: Incremental In-Place Universal Engine Upgrade (Approved)
Upgrade `jobright_extension/` in-place by enhancing `form-discovery.js`, `field-mapping.js`, `field-writer.js`, and `application-confirmation.js` with FreeHire's question-first discovery, anchored prefix matching, combobox interaction protocol, and explicit submission confirmation.
- **Pros**: Direct backward compatibility with existing tests (`tests/adapters.test.mjs`, `tests/autofill-url-fields.test.mjs`, etc.), zero packaging friction with `scripts/pack-extension.mjs`, fast iteration, and lowest regression risk.
- **Cons**: Codebase remains structured in modern ES modules rather than TypeScript.

### Approach B: Complete Re-Platforming to WXT + Svelte + TypeScript
Rebuild the extension from scratch using FreeHire's exact build stack (WXT, Svelte 5, TypeScript).
- **Pros**: Exact structural mirror of FreeHire's source files.
- **Cons**: High migration cost; breaks existing build pipelines, invalidates test scripts, and delays delivery of the core reliability fixes needed for adapters and URL fields.

**Decision**: Approach A is approved.

---

## 5. Architectural Design & Component Data Flow

```mermaid
flowchart TD
    subgraph Browser Tab (Application Page)
        DOM[Portal DOM / Iframes / Shadow DOM]
        FD[core/form-discovery.js<br/>Question-First Scanner & Application Scoper]
        FW[core/field-writer.js<br/>Native Setter, Combobox Driver & Verifier]
        AC[application-confirmation.js<br/>Submission Detector & User Prompt]
    end

    subgraph Extension Core
        AM[adapters/ats-adapters.js<br/>Tier 1: 74 Specialized ATS Adapters]
        FM[core/field-mapping.js<br/>Tier 2: Anchored Prefix Matcher & URL Slotter]
        AB[core/answer-bank.js<br/>Tier 3: Local Cached Candidate Answer Bank]
    end

    subgraph NextKinHR Backend & Cloud
        API_AUTH[/api/jobseeker/resume<br/>Authoritative Profile Facts]
        API_AI[/api/extension/generate-answer<br/>Scoped AI Screening Drafter]
        API_SUB[/api/extension/auto-submit<br/>Atomic Application Ledger]
        DB[(Supabase Database<br/>candidates, candidate_answer_bank, job_submissions)]
    end

    DOM -->|1. Raw Controls & Legends| FD
    FD -->|2. Scoped Question List| FM
    FM -->|3. Check Tier 1 Host Match| AM
    AM -.->|Match found| FM
    AM -.->|No match / Unknown field| FM
    FM -->|4. Anchored Semantic Match| FM
    FM -->|5. Unmatched Screening Question| AB
    AB -->|Found Cached Answer| FM
    AB -.->|Unknown Question| API_AI
    API_AI -.->|Scoped AI Answer| FM
    FM -->|6. Verified Fill Plan| FW
    FW -->|7. Dispatched Values & Readback| DOM
    DOM -->|8. Form Disappearance / Submit Event| AC
    AC -->|9. 'Did you submit?' User Confirmation| API_SUB
    API_SUB -->|10. Atomic Write & Realtime Event| DB
```

### 3-Tier Execution Cascade
1. **Tier 1 (Specialized Fast-Path)**: If the current page hostname or DOM signatures match one of the 74 existing entries in `ats-adapters.js`, the specialized adapter supplies fast-path hints.
2. **Tier 2 (Universal Semantic Engine)**: If no adapter matches, or if an adapter returns an unmapped field, `form-discovery.js` groups controls by question and `field-mapping.js` executes anchored prefix matching (`opensWith`) across canonical synonyms.
3. **Tier 3 (Answer Bank & Scoped AI Drafter)**: If a question remains unresolved:
   - Check Candidate Answer Bank for user-approved answers.
   - If not found and the question qualifies as a bio/screening question, route to `/api/extension/generate-answer` with strict scope limits.
   - If the question cannot be answered safely, flag as `needs_review` / `manual` and leave it empty.

---

## 6. Detailed Technical Specifications & File-by-File Changes

### 6.1 `jobright_extension/core/form-discovery.js`
**Role:** Question-first DOM extraction, resume-application scoping, deep Shadow DOM, and control normalization.
- **Application Scoping (`scopeToApplication`)**:
  - Scan the document for `<input type="file">` elements matching resume criteria or explicit application containers.
  - If a resume upload field is found, determine its enclosing `<form>` or top-level container.
  - Discard fields residing in unrelated forms on the same page (e.g. "Subscribe to job alerts", "Search openings").
  - **Multi-Step Wizard Fallback**: On subsequent wizard steps (Steps 2+, e.g. Workday/Taleo where the resume was uploaded on Step 1), if no resume input exists in the DOM, scoping falls back to the active form container holding application questions and Next/Continue/Submit actions. Intermediate step transitions ("Next", "Save & Continue") are tracked so they never trigger false-positive submission prompts.
- **Question-First Aggregation (`collectQuestions`)**:
  - For radio buttons and checkboxes: if grouped under a `<fieldset>` with a `<legend>`, or within a container with `role="group"` / `role="radiogroup"`, group them into a single `Question` object containing all sibling controls.
  - Extract the question text from the `<legend>`, `aria-label`, `aria-labelledby`, or closest question title heading.
  - Maintain a group-of-one exception: a lone checkbox (e.g. "I agree to the privacy terms") under a generic legend retains its own control-specific label.
- **Deep Shadow DOM Support**:
  - Retain and harden recursive tree walking through `shadowRoot` to ensure modern custom web-component inputs are indexed.

### 6.2 `jobright_extension/core/field-mapping.js`
**Role:** Anchored prefix matching, strict 1-to-1 URL slotting, and canonical profile mapping.
- **Tier 1 / Tier 2 Execution Precedence**:
  - When a Tier 1 adapter in `ats-adapters.js` matches, it supplies field hints (`field.hint`).
  - **Mandatory Tier 2 Sanitization**: All field hints—regardless of whether they originated from a specialized Tier 1 adapter or Tier 2 universal discovery—must pass through Tier 2's strict validation rules. Tier 2 strictly enforces 1-to-1 URL slotting, zero-duplication, format validation, and prose rejection across every portal. An adapter hint can suggest a fact, but Tier 2 rules govern whether and how that fact is written.
- **Anchored Prefix Matching (`opensWith`)**:
  - Replace loose substring regexes (e.g. `/country/i.test(label)`) with prefix-anchored word matching:
    ```javascript
    function opensWith(label, synonym) {
      if (!label.startsWith(synonym)) return false;
      return !/[a-z0-9]/i.test(label.charAt(synonym.length));
    }
    ```
  - Ensures questions like *"Are you authorized to work in the country of this application?"* are evaluated under work authorization, NOT personal country of residence.
- **Strict 1-to-1 URL Slotting**:
  - Separate canonical URL facts into distinct non-overlapping slots:
    - `linkedin_url`: Matches only labels opening with `linkedin`.
    - `github_url`: Matches only labels opening with `github`.
    - `portfolio_url` / `website`: Matches labels opening with `portfolio`, `website`, `personal site`, `homepage`.
  - **No Duplicate URL Assignment**: Once a URL value has been assigned to a field in a given form fill plan, it is marked as consumed.
  - **Strict Refusal for Extra URLs**: Fields asking for `urls[Other]`, `urls[Twitter]`, `Blog`, or unrecognized links for which the candidate has no explicitly designated matching profile fact will be assigned `{ status: 'manual', reason: 'Unmapped link field; enter manually.' }`.
  - **URL Validation**: Verify all candidate URLs parse through `new URL()` with protocol `http:` or `https:`. Reject any string containing whitespace, newline characters, or prose.

### 6.3 `jobright_extension/core/field-writer.js`
**Role:** Framework-compatible native value setters, combobox interaction protocol, and post-fill readback verification.
- **Native Prototype Property Setters**:
  - React 16+ and Angular override input `.value` setters. Use prototype property descriptors:
    ```javascript
    function setNativeValue(element, value) {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value') ||
                         Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor.set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    ```
- **Combobox Protocol (Adapted from FreeHire `combobox.ts`)**:
  - Step 1: Open trigger (`[role="combobox"]`, `[aria-haspopup="listbox"]`, Kendo, ng-select).
  - Step 2: Read active option nodes from the open listbox/menu.
  - Step 3: Match candidate fact against option text using case/punctuation normalization.
  - Step 4: Dispatch click / Enter keydown on the selected option.
  - Step 5: Readback verification: verify whether the combobox value or selected text matches expected output.
- **Post-Fill Readback Verification**:
  - After executing a plan, wait 50ms and re-read the DOM values of written elements.
  - Compare written state against intended value.
  - Generate an explicit fill report: `{ filled: [...], unverified: [...], manual: [...], unmapped: [...] }`.

### 6.4 `jobright_extension/core/answer-bank.js` (New Module) & Backend Endpoints
**Role:** Persistent cache and synchronization of user-confirmed answers to custom screening questions.
- **Backend Authentication & Route**:
  - The extension does NOT connect directly to Supabase with client-side SQL/RLS.
  - All synchronization flows through authenticated Next.js backend endpoints:
    - `GET /api/extension/answer-bank`: Fetches the candidate's active Answer Bank on browser/extension session initialization.
    - `POST /api/extension/answer-bank`: Upserts a newly saved question-answer pair. Authenticated via extension pairing session token.
  - The extension caches the answer bank locally in `chrome.storage.local` for instant offline matching.
- **Keying & Normalization**:
  - Normalize question text (strip required asterisks, lowercase, trim punctuation).
  - Scope questions:
    - *Universal / Factual* (e.g. "How many years of React experience?", salary, notice period): Keyed by `normalized_question`.
    - *Company / Role Specific* (e.g. "Why do you want to join Stripe?"): Keyed by `company_slug + ':' + normalized_question`. The company identifier is the normalized company name slug (e.g. `stripe`) parsed client-side from the job posting, avoiding any blocking API lookup.
- **Candidate Approval Workflow**:
  - When a user manually answers or edits an unfamiliar field in the sidepanel, display an inline prompt: *"Save this answer for future applications?"* with options: `[ Save for all jobs ]` or `[ Save for this company only ]`.
  - When approved, write to local cache and asynchronously sync to `/api/extension/answer-bank`.

### 6.5 `jobright_extension/application-confirmation.js` & `panel.js`
**Role:** Reliable application tracking with two-tier submission confirmation.
- **Two-Tier Submission Confirmation**:
  1. **Tier A (High-Confidence Auto-Detection)**: When an application transitions to an explicit ATS confirmation receipt (e.g., explicit confirmation selectors, `/thanks`, `/thank-you`, `/applied` URL transitions), the extension automatically captures and submits the receipt as it does today.
  2. **Tier B (Ambiguous Form Disappearance Prompt)**: If an active application form that was previously autofilled disappears or is torn down from the DOM *without* triggering a verified confirmation receipt:
     - The extension displays a non-intrusive prompt in the sidepanel/widget:
       ```
       ┌──────────────────────────────────────────────┐
       │  Did you submit your application to [Job]?   │
       │  [ Not Yet ]           [ Yes, Mark Applied ] │
       └──────────────────────────────────────────────┘
       ```
     - Intermediate wizard navigation ("Next", "Continue") is filtered out so it never triggers this prompt.
- **Idempotent Atomic Sync**:
  - Upon user confirmation (or auto-receipt), call `/api/extension/auto-submit` with the stable normalized job URL, candidate ID, and submission timestamp.
  - Relays confirmation event to open NextKinHR dashboard tabs via `postMessage`.

### 6.6 Feature Flag Delivery & Fallback Cascade
- **Flag Delivery**:
  - Controlled by `NEXT_PUBLIC_ENABLE_UNIVERSAL_AUTOFILL_V2`.
  - Returned in the extension configuration / profile payload from `GET /api/extension/candidates` and cached in `chrome.storage.local`.
- **Fallback Behavior**:
  - If the flag is `false`: Tier 1 adapters continue executing, and Tier 2 reverts to the legacy matching heuristics in `field-mapping.js`.
  - If the flag is `true`: The full Universal Semantic Engine (question grouping, anchored prefix matching, 1-to-1 URL slotting, combobox protocol, and Answer Bank) is activated.

---

## 7. Database & Schema Changes

To support the Candidate Answer Bank and robust submission tracking, add the following Supabase migration:

```sql
-- Migration: 20261124000100_candidate_answer_bank.sql

CREATE TABLE IF NOT EXISTS public.candidate_answer_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  question_normalized TEXT NOT NULL,
  question_original TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  answer_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'choice', 'boolean'
  company_scope TEXT DEFAULT NULL, -- NULL indicates universal/reusable across all companies
  use_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_candidate_question_scope UNIQUE (candidate_id, question_normalized, company_scope)
);

CREATE INDEX IF NOT EXISTS idx_answer_bank_lookup 
  ON public.candidate_answer_bank (candidate_id, question_normalized);

ALTER TABLE public.candidate_answer_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidates can manage their own answer bank"
  ON public.candidate_answer_bank
  FOR ALL
  TO authenticated
  USING (
    candidate_id IN (
      SELECT id FROM public.candidates WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    candidate_id IN (
      SELECT id FROM public.candidates WHERE user_id = auth.uid()
    )
  );
```

---

## 8. Error Handling, Refusal Protocols & Security Considerations

### Refusal Protocols
- **Sensitive Demographics**: Questions regarding race, ethnicity, sexual orientation, disability status, or military veteran status will **NEVER** be guessed or filled from AI inference. They are only answered if the candidate has an explicitly saved preference in `confirmed_facts`, otherwise marked for manual candidate choice.
- **Legal Signatures & Consents**: Fields matching "signature", "type your legal name", "agree to arbitration", or "consent" will remain marked as `{ status: 'manual' }`.
- **URL Fields**: If a form provides 4 URL inputs but the candidate profile only contains LinkedIn and GitHub, the 3rd and 4th fields are **deliberately skipped and left blank**, preventing data corruption.

### Security & Privacy
- **Zero Token Leakage**: The extension never transmits authorization tokens, passwords, credit card fields, or SSN inputs. `excluded` selector patterns in `form-discovery.js` reject sensitive input types before planning begins.
- **XSS & Injection Prevention**: Content injection into web pages utilizes `HTMLInputElement.value` and prototype setters, avoiding direct `innerHTML` or `eval` execution.

---

## 9. Testing Matrix & Acceptance Criteria

### Unit Tests
- `tests/universal-question-discovery.test.mjs`: Verify grouping of `<fieldset>` / `<legend>` / `[role="group"]` radio buttons and checkboxes into single questions.
- `tests/anchored-field-mapping.test.mjs`: Test `opensWith` against ambiguous strings (*"Are you authorized to work in this country?"* vs *"Country of residence"*).
- `tests/strict-url-slotting.test.mjs`: Test form fixtures containing LinkedIn, GitHub, Twitter, Portfolio, and Other. Ensure LinkedIn and GitHub map 1-to-1, Portfolio maps once, and Twitter/Other remain completely blank with zero prose injected.
- `tests/answer-bank.test.mjs`: Verify local caching, normalized key retrieval, company scoping, and Supabase upsert logic.

### ATS Portal Fixture Tests
Run automated synthetic form tests against offline HTML fixtures matching production ATS patterns:
- **Greenhouse**: Multi-part contact form, custom question dropdowns, and demographic EEO fields.
- **Lever**: Standard contact fields, resume file upload, and multiple `urls[...]` fields.
- **Ashby**: System fields, custom question listboxes, and yes/no button groups.
- **Workday**: Multi-step wizard sections, dynamic custom select prompts, and address validation.

### Acceptance Criteria
1. On forms with multiple URL inputs, no URL is duplicated and no prose is inserted into any URL field.
2. Unlisted/custom domains running Greenhouse, Lever, Ashby, or Workday forms are successfully discovered and filled without requiring a dedicated hostname entry in `ats-adapters.js`.
3. Candidate Answer Bank remembers approved screening answers across application sessions.
4. Readback verification flags any field where a framework dropped a programmatic write.
5. Confirmed submissions update the web dashboard and Supabase atomically with zero duplicate rows.
6. All existing test suites (`npm test`) pass without regression.

---

## 10. What's Decided vs What's Left to the Builder

### Decided
- **Architecture**: Keep vanilla ES/MV3 inside `jobright_extension/` with modular updates to `form-discovery.js`, `field-mapping.js`, `field-writer.js`, and `application-confirmation.js`.
- **Adapter Strategy**: Preserve all 74 existing adapters as Tier 1; Universal Semantic Engine serves as Tier 2 fallback.
- **URL Handling**: Strict 1-to-1 slotting; unmatched extra URLs remain blank.
- **Verification Strategy**: Readback after fill; prompt candidate upon form disappearance.

### Left to the Builder
- Exact visual styling and placement of the "Did you submit?" prompt inside the floating widget / sidepanel.
- Local storage debounce intervals for syncing `chrome.storage.local` answer bank entries with the Supabase API.
- Exact timeout duration for post-fill combobox option menu rendering (recommended: 150ms).
