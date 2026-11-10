# AI Jobright-Style Browser Extension Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the browser extension into a fully autonomous, AI-driven recruiting and application copilot equivalent to Jobright.ai, featuring smart ATS autofill (supporting text, select, radio, comboboxes, and file attachments), context-aware AI screening question answers, inline interactive AI refinement widgets, and zero-hallucination resume tailoring.

**Architecture:** 
- **Frontend / Extension DOM Layer:** Content script (`content.js`, `resume-workflows.js`) equipped with enhanced semantic DOM analyzers, Shadow DOM traversers, React/Vue/Angular controlled input injectors, and inline interactive copilot trigger buttons next to screening inputs.
- **AI Engine (Hybrid Dual-Mode):** 
  1. *Connected Mode:* NextKinHR portal API (`/api/extension/ai-answers`, `/api/extension/tailor-resume`) leveraging candidate fact catalogs and server-side LLMs (Gemini / OpenAI).
  2. *Standalone Mode:* Direct client-side LLM calling via extension storage for Bring-Your-Own (BYO) API key (Gemini / OpenAI), eliminating hardcoded template fallbacks when disconnected.
- **Document Generation Layer:** Server-side `docx.ts` with direct Base64 injection into native file inputs via `DataTransfer`.

**Tech Stack:** Chrome Extension Manifest V3, TypeScript/Next.js 15, TailwindCSS, `@google/genai` / OpenAI SDK, DOCX generation, React event dispatching hooks.

**Spec:** Audited from existing `browser-extension/` codebase and modern ATS behaviors (Greenhouse, Lever, Workday, Ashby, Taleo, iCIMS).

## Global Constraints
- Preserve existing portal API contracts and OAuth authentication flows.
- Strict domain guardrails: Never autofill or inject UI onto portal pages, sensitive domains, or LLM chat interfaces (ChatGPT, Claude, etc.).
- Recruiter control & verification: Generated content must be previewable, editable, and un-fillable before final submission.
- Zero-hallucination guarantee: Tailored resumes and question answers must draw strictly from the verified candidate fact catalog.

## Review Focus
1. **Custom ATS Comboboxes and Dropdowns:** Workday and Greenhouse custom React select dropdowns that do not use standard `<select>` elements.
2. **Radio / Boolean Question Inversion:** Questions phrased negatively (e.g., "Have you ever been terminated?") must not be answered "Yes" inadvertently.
3. **Controlled Component Value Desync:** Frameworks resetting inputs upon form submission if React internal `_valueTracker` was not notified.
4. **Offline / Unauthenticated Graceful Degradation:** When neither backend nor local API key is configured, prompt user clearly rather than hanging or silently injecting static placeholders.
5. **Multi-Page State Preservation:** Navigating from Step 1 to Step 2 on Workday or Taleo must retain candidate context without re-scraping from scratch.

---

### Task 1: Complete AI Screening Question Engine (Text, Dropdown, Radio, Combobox)

**Files:**
- Modify: `browser-extension/content.js:3300-3450`
- Modify: `browser-extension/background.js:680-740`
- Modify: `src/app/api/extension/ai-answers/route.ts:1-120`
- Test: `tests/extension/ai-screening-answers.test.ts`

- [ ] **Step 1: Write unit tests for screening question detection and answer normalization**
  - Verify detection of `<textarea>`, `<input type="text">`, `<select>`, `input[type="radio"]`, and custom `div[role="combobox"]`.
  - Verify options extraction (e.g. `['Yes', 'No']`, `['0-2 years', '3-5 years', '5+ years']`).
- [ ] **Step 2: Enhance backend `/api/extension/ai-answers` to support choice/options questions**
  - Update request schema to accept `type: 'text' | 'choice' | 'boolean'` and optional `options: string[]`.
  - Update LLM system prompt to return the exact string matching one of the provided options for choice questions.
- [ ] **Step 3: Update `fillAIScreeningQuestions()` in `content.js`**
  - Extract available options for `<select>` or radio groups.
  - Send questions with options to backend.
  - Set selected option for standard `<select>` and trigger native change events.
  - Click matching radio button element and trigger change events.
- [ ] **Step 4: Verify against Greenhouse and Lever test markup**
  - Run test suite and check end-to-end question detection.

---

### Task 2: Hybrid AI Mode with Bring-Your-Own (BYO) API Key

**Files:**
- Modify: `browser-extension/popup.html:150-220`
- Modify: `browser-extension/popup.js:200-310`
- Modify: `browser-extension/background.js:700-780`
- Modify: `browser-extension/resume-engine.js:80-160`
- Test: `tests/extension/hybrid-ai-mode.test.ts`

- [ ] **Step 1: Add AI Provider Configuration to Extension Popup**
  - Add fields in Extension Settings: Provider (`NextKinHR Portal` vs `Direct Gemini / OpenAI`), API Key, Model.
  - Securely persist in `chrome.storage.local`.
- [ ] **Step 2: Implement direct AI client in `background.js` for standalone mode**
  - If unlinked from portal but user has provided an API key, call Gemini API (`generativelanguage.googleapis.com`) or OpenAI directly from background service worker.
  - Remove hardcoded generic template fallback string (`"I have X+ years of experience..."`).
- [ ] **Step 3: Add direct AI match scoring in `resume-engine.js`**
  - Enable semantic match evaluation in standalone mode using the direct API key.
- [ ] **Step 4: Verify standalone mode flow without portal backend session**
  - Test question answering and tailoring with local API key.

---

### Task 3: Interactive Floating AI Copilot Widget (Inline Answer & Refine)

**Files:**
- Create: `browser-extension/copilot-widget.js`
- Create: `browser-extension/copilot-widget.css`
- Modify: `browser-extension/content.js:3450-3550`
- Modify: `browser-extension/manifest.json:20-40`

- [ ] **Step 1: Create lightweight inline action badge for detected questions**
  - Inject a subtle, non-intrusive floating spark button (`✨ AI Answer`) beside detected screening inputs and textareas.
- [ ] **Step 2: Add quick-action popover on click**
  - Popover allows: "Answer with AI", "Shorten", "Expand", "Professional Tone", or "Custom Instructions".
  - Shows generated answer in editable preview before injecting into the input.
- [ ] **Step 3: Add 1-Click "Accept & Fill" and "Undo"**
  - Clicking Accept writes the answer via the React-safe setter.
  - Tracks prior value for instant rollback if recruiter wants to revert.
- [ ] **Step 4: Verify responsiveness and style isolation**
  - Ensure Shadow DOM encapsulation or scoped CSS classes prevent host page styles from bleeding into the copilot badge.

---

### Task 4: Real-Time Semantic ATS Match Breakdown & Gap Analysis

**Files:**
- Modify: `browser-extension/resume-workflows.js:210-380`
- Modify: `browser-extension/content.js:2800-2950`
- Modify: `src/app/api/extension/match-analysis/route.ts` (or reuse `/api/jobs/match`)
- Test: `tests/extension/semantic-match.test.ts`

- [ ] **Step 1: Implement explainable ATS match breakdown in extension drawer**
  - Display:
    - Overall match score (%)
    - Required skills matched vs missing
    - Preferred skills matched vs missing
    - Years of experience compatibility
    - Work authorization / visa compatibility
    - AI reasoning & JD quote citations
- [ ] **Step 2: Connect drawer to server-side semantic evaluation**
  - Query match analysis as soon as job details are extracted from the page.
  - Highlight missing keywords with 1-click option to "Inject missing relevant experience into tailored resume".

---

### Task 5: Multi-Step ATS Wizard Autofill & Enhanced Workday / Taleo Support

**Files:**
- Modify: `browser-extension/content.js:1200-1450`
- Modify: `browser-extension/content.js:2400-2650`
- Test: `tests/extension/ats-multi-step.test.ts`

- [ ] **Step 1: Multi-step form session persistence**
  - Store application progress state in `sessionStorage` or `chrome.storage.session` per job URL.
  - When user transitions between pages (e.g. Workday Step 1 Contact Info -> Step 2 Experience -> Step 3 Disclosures), automatically trigger autofill for the newly loaded step.
- [ ] **Step 2: Workday & Taleo custom combobox support**
  - Add specific handlers for Workday `div[data-automation-id*="select"]` and `ul[role="listbox"]`.
  - Simulate user keyboard typing (`ArrowDown`, `Enter`) for frameworks that discard programmatic value sets on comboboxes.
- [ ] **Step 3: Verification against all major ATS layouts**
  - Test on mock pages for Greenhouse, Lever, Workday, Ashby, and SmartRecruiters.
