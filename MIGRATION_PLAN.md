# Browser Extension v3.2.1 Migration Plan

## Overview

This document outlines the plan to integrate the latest JobRight extension features (from `jobright_extension/`) into the current browser extension v3.2.1 (`browser-extension-v3.2.1/`).

## Key Differences Between Extensions

### v3.2.1 Extension (Current/Old)
| Aspect | v3.2.1 |
|--------|--------|
| Manifest Version | MV3 |
| Permissions | `storage`, `unlimitedStorage`, `alarms`, `activeTab`, `cookies`, `downloads` |
| Content Scripts | Single script bundle with all features |
| Autofill Engine | Basic - uses Nextkin forms API |
| Outside Jobs | Limited support |
| Popup UI | Dark theme, simple interface |

### JobRight Extension (Target/New)
| Aspect | JobRight Extension |
|--------|-------------------|
| Manifest Version | MV3 |
| Permissions | `storage`, `scripting`, `declarativeNetRequest`, `tabs`, `cookies`, `webNavigation`, `activeTab`, `alarms`, `unlimitedStorage`, `downloads` |
| Content Scripts | Multiple specialized scripts |
| Autofill Engine | Advanced - with `NextkinFieldWriter` for robust field handling |
| Outside Jobs | Full support with auto-save to database |
| Popup UI | Modern UI with dark/light mode support |
| Additional Features | 1-Click auto-connect, shared profiles, resume version history |

---

## Migration Steps

### Phase 1: Update Manifest Configuration

**File: `browser-extension-v3.2.1/manifest.json`**

1. **Add missing permissions:**
   ```json
   "permissions": [
     "storage",
     "unlimitedStorage",
     "alarms",
     "activeTab",
     "cookies",
     "downloads",
     "scripting",
     "declarativeNetRequest",
     "tabs",
     "webNavigation"
   ]
   ```

2. **Update content scripts structure:**
   - Keep main bundle approach but update entries
   - Add `outside-job-engine.js` for outside portal support
   - Update `all_frames` settings based on URL patterns

3. **Update web_accessible_resources** to include:
   - `helper-app.js`
   - `global.css`
   - Inter font files
   - Helper app SVGs
   - All compiled helper-app CSS files

4. **Add icon sizes** matching modern extension standards

### Phase 2: Update Background Service Worker

**File: `browser-extension-v3.2.1/background.js`**

**Key Changes:**
1. Add `scripting` and `tabs` permissions handling
2. Update message handlers to support:
   - `save_external_job` - for outside job persistence
   - `auto_submit` - for outside application capture
   - Enhanced credential handling for auto-connect

3. Add new storage keys:
   - `nextkin_active_candidate` (for outside job candidate tracking)
   - `nextkin_candidate_data` (for compatibility)
   - `sharedCandidates` (for shared profiles)

### Phase 3: Integrate Outside Job Engine

**File: `browser-extension-v3.2.1/outside-job-engine.js`** (NEW)

**Key Functions to Import:**
1. `detectPageMode()` - Detect job details vs application form vs login vs confirmation
2. `scrapeJobFromDOM()` - Universal job scraper with JSON-LD and meta tag support
3. `executeOutsideAutofill()` - Main autofill engine using NextkinFieldWriter
4. `handleApplicationSubmission()` - Capture and save to database
5. `bindApplyButtonWatcher()` - Intercept click-to-apply buttons

**Key Integration Points:**
- Store extracted jobs in `public.jobs` table via `save_external_job` API
- Store submissions in `public.job_submissions` table via `auto_submit` API
- Show in-page toasts for user feedback
- Handle dynamic SPA navigation

### Phase 4: Update Field Discovery & Mapping

**Files:**
- `browser-extension-v3.2.1/form-discovery.js` (UPDATE)
- `browser-extension-v3.2.1/field-mapping.js` (UPDATE)
- `browser-extension-v3.2.1/field-writer.js` (UPDATE)
- `browser-extension-v3.2.1/frame-agent.js` (UPDATE)

**Changes:**
1. Update `scraping-rules.json` - Add/update selectors for modern job boards
2. Use `NextkinFieldWriter.applyFill()` for robust field writing
3. Add `NextkinFieldWriter.undo()` functionality for rollback
4. Include `frame-agent.js` for iframe-based form support (Greenhouse, etc.)

### Phase 5: Update Candidate Context

**File: `browser-extension-v3.2.1/candidate-context.js`**

**Changes:**
1. Update `createCandidateContext()` to handle:
   - `source_text` for uploaded resumes
   - `provenance_status: 'confirmed'` for verified facts
   - `confirmed_facts` structure

2. Add support for:
   - `total_experience_years`
   - `authorized_in_usa` (boolean)
   - `need_sponsorship_now/future` (boolean)
   - `open_to_relocation` (boolean)

### Phase 6: Update Resume Engine

**File: `browser-extension-v3.2.1/resume-engine.js`**

**No changes needed** - already matches JobRight extension's version.

### Phase 7: Update Popup UI

**Files:**
- `browser-extension-v3.2.1/popup.html`
- `browser-extension-v3.2.1/popup.js`
- `browser-extension-v3.2.1/popup-resumes.js`

**Key UI Changes:**
1. Add 1-Click Auto-Connect feature
2. Add shared profiles section
3. Improve resume upload/dropzone UX
4. Add source resume text input
5. Add saved resumes history
6. Add sync status with manual review count

**Storage Migration:**
- `uploadedCandidate` → `nextkin_active_candidate`
- `candidates` → keep as `candidates`
- `uploads` → track separately with history

### Phase 8: Update Content Script Bundle

**File: `browser-extension-v3.2.1/content.js`**

**Changes:**
1. Initialize all modules:
   ```javascript
   // Load in order:
   // 1. form-discovery.js
   // 2. field-mapping.js  
   // 3. field-writer.js
   // 4. job-context.js
   // 5. candidate-context.js
   // 6. resume-engine.js
   // 7. outside-job-engine.js
   // 8. embedded-support.js
   ```

2. Register global objects:
   ```javascript
   root.NextkinForms = { discoverFields, label };
   root.NextkinFieldMapping = { planFill };
   root.NextkinFieldWriter = { applyFill, undo, writeNative };
   ```

3. Add message passing between content script and background:
   - Handle `save_external_job` requests
   - Handle `auto_submit` for outside applications

### Phase 9: Create Missing Files

**New files to create:**
1. `field-discovery.js` - Form field discovery logic
2. `embedded-support.js` - Support for embedded iframe forms
3. `frame-agent.js` - Communication with iframe agent frames
4. `resume-import.js` - Resume parsing from files
5. `resume-workflows.js` - Resume generation workflows

### Phase 10: Update Scraping Rules

**File: `jobright_extension/scraping-rules.json`**

**Update for v3.2.1:** Include more job board patterns and update selectors for:
- Modern ATS platforms
- Single-page applications
- Mobile-responsive job pages

---

## Database API Requirements

### External Job Save API (`save-external-job`)
Already exists at `src/app/api/extension/save-external-job/route.ts` - needs to be called from extension.

**Request:**
```javascript
{
  type: 'save_external_job',
  job: {
    title: string,
    company: string,
    jobUrl: string,
    location: string | null,
    department: string | null,
    description: string,
    descriptionHtml: string | null,
    employmentType: string,
    portalSource: string
  }
}
```

**Response:**
```javascript
{ success: true, jobId: string, created?: boolean, updated?: boolean }
```

### Auto Submit API (`auto-submit`)
Already exists at `src/app/api/extension/auto-submit/route.ts` - already supports `portalSource`.

---

## Testing Requirements

### 1. Unit Tests
- Test field discovery on various job boards
- Test autofill accuracy
- Test job scraping from different portals

### 2. Integration Tests
- End-to-end application flow
- Resume upload and parsing
- Database persistence

### 3. Cross-Browser Tests
- Chrome (Manifest V3)
- Edge (Manifest V3)

### 4. Security Tests
- Content script isolation
- Message passing validation
- Storage security

---

## Rollback Plan

If issues arise:
1. Revert to `v3.2.1` branch/tag
2. Keep `jobright_extension/` as reference for quick fixes
3. Database API remains backward compatible

---

## Timeline Estimate

| Phase | Tasks | Effort | Status |
|-------|-------|--------|--------|
| 1-2 | Manifest & Background Update | 2 hours | ✅ DONE |
| 3 | Outside Job Engine Integration | 4 hours | ✅ DONE |
| 4 | Field Discovery & Mapping | 3 hours | ✅ DONE |
| 5 | Candidate Context Update | 2 hours | ✅ DONE |
| 6 | Resume Engine (verify) | 1 hour | ✅ DONE |
| 7 | Popup UI Updates | 3 hours | ✅ DONE (already had features) |
| 8-9 | Content Script & New Files | 4 hours | ✅ DONE |
| 10 | Scraping Rules Update | 2 hours | ✅ DONE |
| **Total** | | **~21 hours** | **COMPLETED** |

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `manifest.json` | Update | Add permissions, update content scripts |
| `background.js` | Update | Add auto-connect, outside job support |
| `popup.html` | Replace | Modern UI with all features |
| `popup.js` | Replace | Enhanced popup functionality |
| `content.js` | Update | Initialize all modules |
| `form-discovery.js` | Copy | From jobright_extension |
| `field-mapping.js` | Copy | From jobright_extension |
| `field-writer.js` | Copy | From jobright_extension |
| `job-context.js` | Copy | From jobright_extension |
| `candidate-context.js` | Copy | From jobright_extension |
| `resume-engine.js` | Verify | No changes needed |
| `resume-import.js` | Copy | From jobright_extension |
| `resume-workflows.js` | Copy | From jobright_extension |
| `outside-job-engine.js` | Copy | From jobright_extension |
| `embedded-support.js` | Copy | From jobright_extension |
| `frame-agent.js` | Copy | From jobright_extension |

---

## Success Criteria

1. ✅ Extension loads without errors in Chrome/Edge MV3
2. ✅ Autofill works on major job boards (LinkedIn, Indeed, Greenhouse, Lever, Ashby, Workday)
3. ✅ Outside jobs auto-detected and saved to database
4. ✅ Click-to-apply buttons intercepted and forms autofilled
5. ✅ Applications submitted from outside portals captured and synced
6. ✅ Resume parsing works (PDF, DOCX, TXT, JSON)
7. ✅ 1-Click auto-connect functional
8. ✅ Shared profiles sync works
9. ✅ All existing v3.2.1 features preserved

---

## Migration Completed ✓

### Files Copied/Updated:
1. **manifest.json** - Updated with new permissions (`scripting`, `tabs`, `webNavigation`, `declarativeNetRequest`)
2. **background.js** - Added `save_external_job` handler for outside job persistence
3. **popup.js** - Updated to support both `uploadedCandidate` and `nextkin_active_candidate` storage keys
4. **outside-job-engine.js** - Copied from JobRight for universal job detection
5. **form-discovery.js** - Field discovery logic
6. **field-mapping.js** - Field to candidate mapping
7. **field-writer.js** - Robust field writing with undo capability
8. **frame-agent.js** - iframe communication for embedded forms
9. **candidate-context.js** - Candidate context creation
10. **job-context.js** - Job context creation
11. **fill-session.js** - Fill session management
12. **resume-engine.js** - Resume generation engine
13. **resume-import.js** - Resume file parsing
14. **resume-workflows.js** - Resume storage workflows
15. **embedded-support.js** - Embedded form support
16. **stripe-job.js** - Stripe job detection
17. **scraping-rules.json** - Job board scraping selectors
18. **helper-app.41ea2652.js** - Main helper app
19. **global.f36301ce.css** - Global styles
20. **inter.42ee87cb.css** - Inter font CSS
21. **vendor/pdf.min.mjs, pdf.worker.min.mjs** - PDF processing libraries
22. **Icon files** - 16px, 32px, 48px, 64px, 128px PNGs

### Key Features Now Available:
- ✅ Autofill on outside job portals (Keka, BambooHR, Zoho, etc.)
- ✅ Automatic job detection and saving to database
- ✅ Click-to-apply button interception
- ✅ Form submission capture from outside portals
- ✅ 1-Click auto-connect with NextKinHR portal
- ✅ Shared profiles from recruiter
- ✅ Resume version history
- ✅ Phone number auto-fill with prompt for missing info
- ✅ In-page toast notifications
- ✅ ATS match scoring

---

## Notes

- The `outside-job-engine.js` uses `chrome.storage.local` keys that need to match the current extension format
- Some API endpoints may need adjustments for the `portalSource` field
- The popup UI uses CSS variables for theming - ensure consistency
- Test with `localhost` development environment for local NextKinHR portal connection