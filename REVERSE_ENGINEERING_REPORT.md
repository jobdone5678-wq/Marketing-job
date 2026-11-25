# Jobright Chrome Extension Reverse Engineering Report

**Target Artifact**: `Jobright Autofill – Instant Job Applications, Job Match, AI Tailor Resume` (v`1.27.1`, Chrome Web Store ID `odcnpipkhjegpefkfplmedhmkmmhmoko`)  
**Inspected Local Path**: [`odcnpipkhjegpefkfplmedhmkmmhmoko/1.27.1_0`](file:///C:/Users/bharg/AppData/Local/Google/Chrome/User%20Data/Default/Extensions/odcnpipkhjegpefkfplmedhmkmmhmoko/1.27.1_0)  
**Web Marketing Reference**: `https://jobright.ai/job-autofill`

---

## 1. Executive Summary

The Jobright Chrome Extension (`v1.27.1`) is a Manifest V3 (MV3) browser automation, job-matching, and application-tracking client built with **Plasmo** and bundled via **Parcel**. Rather than using a standard `chrome.action` popup window, the extension uses a **two-stage injection architecture**: a lightweight `document_start` gatekeeper content script ([contents.d42e7fcf.js](file:///C:/Users/bharg/AppData/Local/Google/Chrome/User%20Data/Default/Extensions/odcnpipkhjegpefkfplmedhmkmmhmoko/1.27.1_0/contents.d42e7fcf.js)) evaluates URL/DOM/iframe/extension-icon triggers and asks the background service worker ([static/background/index.js](file:///C:/Users/bharg/AppData/Local/Google/Chrome/User%20Data/Default/Extensions/odcnpipkhjegpefkfplmedhmkmmhmoko/1.27.1_0/static/background/index.js)) to inject the `8.87 MB` React + Ant Design + Zustand application runtime ([helper-app.41ea2652.js](file:///C:/Users/bharg/AppData/Local/Google/Chrome/User%20Data/Default/Extensions/odcnpipkhjegpefkfplmedhmkmmhmoko/1.27.1_0/helper-app.41ea2652.js)) into a `<plasmo-csui id="jobright-helper-plugin">` Shadow DOM sidebar.

Across the extension, four core subsystems operate together:
1. **Extension Runtime & Page Integration**: MV3 service worker with `108` literal message handlers (`chrome.runtime.onMessage`), `1` SSE streaming port (`getGptResultsStream`), declarative header stripping (`declarativeNetRequest`) so `jobright.ai/agent*` can embed Lever and Ashby in iframes, and `chrome.scripting.registerContentScripts` for `MAIN`-world network hooks.
2. **Job Detection & Metadata Extraction**: Multi-tier matching across `SITE_REGISTRY` (`~core/supported-sites`), `inventory-match` URL lookup rules (`rules.json` + `enterprise-rules.json`), LinkedIn Ember store (`_globalM3RecordDataCache`) extraction, `scraping-rules.json` XPath scrapers, and HTML-to-Markdown fallback (`/swan/autofill/external-job`).
3. **Autofill Engine**: Dual-architecture form filler supporting both legacy `AutoFillBase` and modern `BaseFiller` (`78` platform keys mapped in `~contents/crawler/factory`), remote-updatable `site-rules` with 15-minute sync & emergency killswitches, SSE field-by-field answer streaming (`/swan/autofill/fill-v2-stream`), React Fiber / KnockoutJS / SAP UI5 / `MAIN`-world picker bridges, and synthetic `DataTransfer` PDF/DOCX resume & cover-letter injection.
4. **Application Submission Capture**: Cross-navigation and cross-frame attribution tracking across `64` `ATS_SUBMISSION_SITES`, combining click/submit listeners, `sessionStorage` survival, strict origin/path/parent-frame verification in the background (`markAtsJobApplied`), `7` `MAIN`-world `fetch`/`XHR`/callback interceptors, server verification (`/swan/share/job/{id}` + `POST /swan/job/apply`), post-apply UI prompts, and bidirectional `jobright.ai/agent*` sync.

---

## 2. Investigation Methodology & REA Evidence

### 2.1 REA CLI Static Analysis
No `rea` MCP server was registered in the active agent toolset at runtime; per the `reverse-engineer-anything` recovery workflow, static reconstruction was executed via the installed `rea` CLI (`v6.9.0`):

1. **Full Extension Attempt (`task-17`)**:
   - **Evidence ID**: `ev_b860c34e44835f33d40ff168ba3f938a3791273bf09d90f2cd15758762c49c2c`
   - **Bundle Path**: `scratch/jobright-evidence.json` (`105,384,365` bytes)
   - **Outcome**: Completed files 1–10 (`agent-submission-sync.7f769d2a.js` through `field-discovery.d71b3ac3.js`), then timed out at `300,000 ms` on file `11/22` (`helper-app.41ea2652.js`, `8.87 MB` compiled React/AntD bundle). Partial evidence was preserved (`semantic_unknowns: 33862`, `application_unknowns: 13`, `limitation_count: 23`).
2. **Targeted Core Extension Analysis (`task-226`, Exit Code `0`)**:
   - **Analyzed Scope**: `16` core JS files (`static/background/index.js`, `contents.d42e7fcf.js`, `ats-submission-resume.81fcb254.js`, `applied-success-popup.beee901a.js`, `field-discovery.d71b3ac3.js`, `clearcompany-submission-attribution.d13048d5.js`, `agent-submission-sync.7f769d2a.js`, `scroll-to-anchor.45fefb1b.js`, `workday-password-sync.26980834.js`, and all `7` `MAIN`-world scripts), excluding the huge AntD/JSX bundles (`helper-app.41ea2652.js`, `tabs/autofill-tutorial.4688b12a.js`) and metadata JSONs.
   - **Root Artifact SHA-256**: `56ebe131521eefa6a101fa278c8c40111286c6f83abdc6a41fd4de7a9435de6e`
   - **Parent Evidence ID**: `ev_523a93df37d6158c14ecb50f177688ec69e81fa9a8bc6460de98db2ad3a06ac9` (`scratch/jobright-nonui-evidence.json`, `123,066,199` bytes)
   - **Summary View Evidence ID**: `ev_5610fabe6d3339bd8192620f91bf51b57f1a82b77992df01be0bc79329fcadb8`
   - **REA Summary Metrics**:
     - `relevant_files`: `22` (`parsed_javascript_files`: `16`, `unselected_files`: `6`, `parse_failures`: `0`)
     - `text_bytes_read`: `1,562,563` bytes; `visited_ast_nodes`: `342,823`; `findings`: `215`
     - `sender_validation_observations`: `49`
     - `coverage.application.status`: `"partial"` (`application_unknowns`: `18`)
     - `coverage.semantic.status`: `"partial"` (`semantic_unknowns`: `41,227`, `limitation_count`: `34`)
3. **Parcel Bundle Unpacking & Manual Module Inspection**:
   - Because `helper-app.41ea2652.js` (`2,418` Parcel modules), `static/background/index.js` (`492` Parcel modules), and `tabs/autofill-tutorial.4688b12a.js` (`504` Parcel modules) are production Parcel bundles without source maps, custom Node scripts in `scratch/` unpacked the module maps, filtered out vendor modules (`lodash`, `antd`, `react`, etc.), and extracted `app_only.js` + `app_manifest.json` for direct source inspection (`475` non-vendor/shallow modules in `background`, `2,288` in `helper-app`, `468` in `autofill-tutorial`).

### 2.2 Important Environment Clarification
- The workspace directory `C:\Users\bharg\Downloads\marketing-job\jobright_extension\` is a separate local prototype/project in the user's folder and is **not** the installed Chrome extension. All findings in this report come exclusively from the Chrome-installed Jobright extension at `C:\Users\bharg\AppData\Local\Google\Chrome\User Data\Default\Extensions\odcnpipkhjegpefkfplmedhmkmmhmoko\1.27.1_0`.

---

## 3. Summary Across All Six Investigation Areas

| Area | Primary Architecture / Mechanism | Key Source Evidence | Details Document |
| :--- | :--- | :--- | :--- |
| **1. Architecture** | MV3 Service Worker (`static/background/index.js`), 2-stage injection (`contents.d42e7fcf.js` -> `helper-app.41ea2652.js`), Shadow DOM `<plasmo-csui id="jobright-helper-plugin">`, 7 `MAIN`-world scripts, `declarativeNetRequest` header stripping, `chrome.storage` + 2 IndexedDBs | [manifest.json](file:///C:/Users/bharg/AppData/Local/Google/Chrome/User%20Data/Default/Extensions/odcnpipkhjegpefkfplmedhmkmmhmoko/1.27.1_0/manifest.json), `static/background/index.js` (`lSzt3`, `8ZbMf`, `9FhIl`, `iG3ww`), `contents.d42e7fcf.js` | [EXTENSION_ARCHITECTURE.md](file:///C:/Users/bharg/Downloads/marketing-job/EXTENSION_ARCHITECTURE.md) |
| **2. Job Detection** | `SITE_REGISTRY` (`~core/supported-sites`), `inventory-match` regex/query rules + `/swan/autofill/lookup-by-url`, LinkedIn Ember store (`urn:li:fsd_jobPosting:*`), `scraping-rules.json` XPaths, cleaned-HTML Markdown fallback | `lpxpl`, `dENlS`, `dfTHw`, `8PtKd`, `7iu0r` (LinkedIn Ember), `2Q6ot` (`scraping-rules.json`), `h3FNP`, `m4Nwz` | [APPLICATION_CAPTURE_FLOW.md](file:///C:/Users/bharg/Downloads/marketing-job/APPLICATION_CAPTURE_FLOW.md) §2 & [AUTOFILL_ENGINE.md](file:///C:/Users/bharg/Downloads/marketing-job/AUTOFILL_ENGINE.md) §2 |
| **3. Application Tracking** | `64` `ATS_SUBMISSION_SITES`, trusted click/submit + `sessionStorage` (`JOBRIGHT_ATS_PENDING_SUBMISSION_V1`), `5` min TTL, `7` `MAIN`-world network hooks, background origin/frame/parent validation (`markAtsJobApplied` -> `eUQRi`), `/swan/share/job/{id}` dedupe + `/swan/job/apply` | `ats-submission-resume.81fcb254.js`, `clearcompany-submission-attribution.d13048d5.js`, `applied-success-popup.beee901a.js`, `agent-submission-sync.7f769d2a.js`, `eUQRi` | [APPLICATION_CAPTURE_FLOW.md](file:///C:/Users/bharg/Downloads/marketing-job/APPLICATION_CAPTURE_FLOW.md) |
| **4. Autofill** | `78` factory platform adapters, remote+builtin `site-rules` with killswitch, `/swan/autofill/fill-v2-stream` SSE streaming, `AutofillSeriesTokenManager`, React Fiber/Knockout/UI5 bridges, `DataTransfer` + `MAIN`-world file-picker hijack, PDF-to-DOCX conversion | `7RE4t`, `kkscK`, `8xj6F` (`BaseFiller`), `7T5eW`, `hA5Qa`, `cGi0k`, `field-discovery.d71b3ac3.js`, `jU6Xl`, `k2tvo`, `bSqak`, `7fST7`, `c20sO`, `14hrA` | [AUTOFILL_ENGINE.md](file:///C:/Users/bharg/Downloads/marketing-job/AUTOFILL_ENGINE.md) |
| **5. Backend APIs** | `https://api.jobright.ai` (`/swan/*`, `/api/*`, `/foxit/pdf-to-docx`) & `https://jobright.ai` (`/api/*`) using `credentials: "include"` (`SESSION_ID` cookie on `.jobright.ai`), `60s` client timeouts, HTTP `402`/`403`/`409` & `errorCode: 40008`/`42005` handling | `c9y6z`, `aVujO`, `fSYoD`, `bCmpG`, `k63b2`, `6CgBs`, `bcWWO`, `cgn5p`, `bsUFt`, `hdicW` | [API_COMMUNICATION.md](file:///C:/Users/bharg/Downloads/marketing-job/API_COMMUNICATION.md) |
| **6. UI & UX** | Floating draggable bird icon (`DraggableIcon`), 384px docked Shadow DOM sidebar (`HelperContainer`) with host-page CSS reflow (`--jobright-helper-panel-reserved-width`), LinkedIn banner & "Autofill" pill, inline textarea AI button, `autofill-tutorial.html`, error/credit/star-rating/double-confirm modals | `iGMN0`, `69yl1`, `jZodJ`, `8dRWn`, `dv20f`, `iqFDb`, `hfEAA`, `2y1sa`, `PlGZV`, `9pWmc`, `8llzP`, `jt2yS`, `948zT` | [EXTENSION_ARCHITECTURE.md](file:///C:/Users/bharg/Downloads/marketing-job/EXTENSION_ARCHITECTURE.md) §6 & companion specs |

---

## 4. Observed vs. Inferred Behavior & Known Unknowns

### 4.1 Observed Facts (Directly Verified in Extracted Source / REA Evidence)
- Every extension filename, MV3 permission, host pattern, storage key, IndexedDB store, message channel (`108` background handlers + `getGptResultsStream` port), backend path, error code, and `ATS_SUBMISSION_SITES` / `KNOWN_SITE_KEYS` / `factory` map listed across these documents was directly read from `manifest.json`, the unpacked Parcel bundles in `scratch/`, or REA output.

### 4.2 Inferred Behavior (Explicitly Labeled Throughout)
- **Server-Side Processing**: How `api.jobright.ai` implements LLM question matching in `/swan/autofill/fill-v2-stream`, how AgentQL parsing works in `/swan/autofill/fill`, how `/swan/autofill/autofill-option-resolve` and `/client-search-step` select options, how `/swan/autofill/token` issues credits/tokens, and how `/swan/event/submit` telemetry is ingested cannot be observed from client extension code alone and are inferred from request/response contracts.
- **Jobright Web App Side (`jobright.ai/agent*`)**: The extension communicates with the Jobright web application via `CustomEvent("FromExtension")`, `"StartAgentFill"`, `"CheckAgentCoverLetter"`, and `autofillInstallAttribution*` DOM events, plus `iframe` `postMessage` events (`IFRAME_EVENTS`). The web app's internal handlers live on `jobright.ai` servers, outside this local extension package.

### 4.3 Limitations & Unknowns
- **No Source Maps**: All bundles are production-minified Parcel builds (`static/background/index.js`, `helper-app.41ea2652.js`, `autofill-tutorial.4688b12a.js`). Original TypeScript source types, internal code comments (except preserved license/layout comments), and stripped dev-only test harnesses are absent, though Parcel preserved module alias names (e.g., `~store/profile`) and export identifiers.
- **No Live Network Capture Performed**: Per project guidelines, no authenticated API requests were replayed against `api.jobright.ai` and no authentication/access controls were bypassed; API response schemas are reconstructed solely from client-side destructuring, validators (`bcWWO`, `e6vBn`, `5veUj`), and error handlers.
- **REA Static Graph Partial Coverage**: As reported by REA (`ev_5610fabe...`), `helper-app.41ea2652.js` exceeds REA's `300,000 ms` per-file AST analysis timeout, and the `16`-file static run reached `alias_selections=512` and `20,000`-node/unknown per-file ceilings, leaving dynamic calls (`14,125` omitted occurrences) and ambiguous object flows (`15,360`) resolved through direct manual inspection of the unpacked Parcel modules instead.

---

## 5. Independent Implementation Roadmap

See [FEATURE_IMPLEMENTATION_ROADMAP.md](file:///C:/Users/bharg/Downloads/marketing-job/FEATURE_IMPLEMENTATION_ROADMAP.md) for a clean-room milestone plan covering MV3 scaffolding, two-stage Shadow DOM injection, DOM field extraction & streaming fill architecture, ATS adapter modularization, and verified submission capture without relying on proprietary Jobright backend endpoints.
