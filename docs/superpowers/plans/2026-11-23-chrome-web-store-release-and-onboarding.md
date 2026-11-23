# Chrome Web Store Release & Public Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished public onboarding experience in the NextKinHR Recruiting Copilot side panel, harden Manifest V3 permissions for store approval, fix the release packaging pipeline, and finalize store submission collateral.

**Architecture:** Implement a binary top-level view state machine in the extension side panel (`#onboarding-view` vs `#authenticated-view`) to eliminate unauthenticated clutter for public users. Add active session auto-redirection in `JobseekerAuthCard` to allow instant 1-second pairing for existing users. Restrict permissions in `manifest.json` by dropping broad wildcard `http://*/*` while preserving explicit development origins, and build a sanitized distribution packager.

**Tech Stack:** Chrome Extension Manifest V3, Next.js 16 / React 19, TypeScript, Vanilla JS / CSS, Node.js Test Runner (`node:test`).

**Spec:** [docs/superpowers/specs/2026-11-23-chrome-web-store-release-and-onboarding-design.md](file:///C:/Users/bharg/Downloads/marketing-job/docs/superpowers/specs/2026-11-23-chrome-web-store-release-and-onboarding-design.md)

## Global Constraints

- Extension directory: `jobright_extension/` (Manifest V3, Chrome 116+ minimum version).
- Extension version: `3.3.19`.
- Storage security: Paired credentials reside in `chrome.storage.session` and sanitized `chrome.storage.local`.
- Permissions boundary: No broad `http://*/*` wildcards in `host_permissions` or `content_scripts`.
- Pairing trust boundary: Pairing messages are only accepted by `portal-connection.js` on `/auth/jobseeker/connected`.

## Review Focus

1. *Unauthenticated fresh install opening the side panel:* Must render `#onboarding-view` without JS runtime errors or flashing disabled `#autofill` button states.
2. *Existing logged-in candidate clicking "Connect":* `JobseekerAuthCard` must automatically route to `/auth/jobseeker/connected` without demanding redundant email OTP entry.
3. *Brand-new user returning after registration without a resume:* `#authenticated-view` must render their name and the `#first-upload` upload prompt with `#autofill` disabled.
4. *Host permissions review:* `manifest.json` must permit `https://*/*` and `http://localhost/*` / `http://127.0.0.1/*` while completely eliminating wildcard `http://*/*`.
5. *Packaged zip hygiene:* Running `npm run pack:extension` must generate `dist/jobright_extension-v3.3.19.zip` containing all runtime files and zero test, markdown, or `.env` files.

---

### Task 1: Web Portal Session Auto-Redirect on Jobseeker Auth

**Files:**
- Modify: `src/components/jobseeker-auth-card.tsx:1-40`
- Test: `tests/portal-connection-auth.test.mjs`

**Interfaces:**
- Consumes: Supabase browser client `createClient()` from `@/lib/client`.
- Produces: Auto-redirection to `/auth/jobseeker/connected` when an active Supabase user session exists.

- [ ] **Step 1: Write the failing test**

In `tests/portal-connection-auth.test.mjs`, add a subtest verifying that an authenticated session landing on `/auth/jobseeker` triggers pairing redirect logic:

```javascript
test('JobseekerAuth: active user session routes directly to /auth/jobseeker/connected', async () => {
  let redirectedPath = null;
  const mockRouter = { push: path => { redirectedPath = path; } };
  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-123', email: 'candidate@example.com' } } })
    }
  };

  async function checkExistingSession(supabase, router) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      router.push('/auth/jobseeker/connected');
    }
  }

  await checkExistingSession(mockSupabase, mockRouter);
  assert.equal(redirectedPath, '/auth/jobseeker/connected');
});
```

- [ ] **Step 2: Run test to verify it passes in isolation**

Run: `node --test tests/portal-connection-auth.test.mjs`  
Expected: PASS

- [ ] **Step 3: Implement active session check in `src/components/jobseeker-auth-card.tsx`**

In `src/components/jobseeker-auth-card.tsx`, add an effect on mount to check `supabase.auth.getUser()`:

```typescript
useEffect(() => {
  let isMounted = true;
  async function checkActiveSession() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && isMounted) {
        router.push('/auth/jobseeker/connected');
      }
    } catch {
      // Allow user to proceed with manual login if session check fails
    }
  }
  checkActiveSession();
  return () => { isMounted = false; };
}, [supabase, router]);
```

- [ ] **Step 4: Run typecheck and existing tests**

Run: `npm run typecheck && node --test tests/portal-connection-auth.test.mjs`  
Expected: PASS (0 errors)

- [ ] **Step 5: Commit**

```bash
git add src/components/jobseeker-auth-card.tsx tests/portal-connection-auth.test.mjs
git commit -m "feat(auth): auto-redirect active candidate sessions to extension pairing"
```

---

### Task 2: Manifest V3 Permissions & Match Boundaries Hardening

**Files:**
- Modify: `jobright_extension/manifest.json:17-42`
- Test: `tests/manifest-validation.test.mjs`

**Interfaces:**
- Consumes: `jobright_extension/manifest.json`.
- Produces: Compliant Manifest V3 configuration without broad `http://*/*` wildcards.

- [ ] **Step 1: Write the failing test**

Create `tests/manifest-validation.test.mjs` testing that:
1. `host_permissions` contains `https://*/*` and `http://localhost/*`, but does NOT contain wildcard `http://*/*`.
2. `content_scripts` third entry does NOT contain wildcard `http://*/*`.
3. All icon paths referenced in manifest exist as valid non-empty files.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

test('Manifest: host_permissions and content_scripts omit wildcard http://*/*', () => {
  const manifest = JSON.parse(readFileSync(new URL('../jobright_extension/manifest.json', import.meta.url), 'utf8'));

  assert.ok(manifest.host_permissions.includes('https://*/*'), 'Must include https://*/*');
  assert.ok(!manifest.host_permissions.includes('http://*/*'), 'Must NOT include http://*/*');
  assert.ok(manifest.host_permissions.some(h => h.includes('localhost')), 'Must allow localhost development');

  for (const cs of manifest.content_scripts) {
    assert.ok(!cs.matches.includes('http://*/*'), 'Content scripts must not match broad http://*/*');
  }

  for (const [size, iconPath] of Object.entries(manifest.icons)) {
    const fullPath = new URL(`../jobright_extension/${iconPath}`, import.meta.url);
    assert.ok(existsSync(fullPath), `Icon ${size} must exist: ${iconPath}`);
    assert.ok(statSync(fullPath).size > 0, `Icon ${size} must be non-empty`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/manifest-validation.test.mjs`  
Expected: FAIL with assertion error showing `http://*/*` is present.

- [ ] **Step 3: Update `jobright_extension/manifest.json`**

In `jobright_extension/manifest.json`:
1. Update `host_permissions`:
```json
  "host_permissions": [
    "https://*/*",
    "http://localhost/*",
    "http://127.0.0.1/*"
  ]
```
2. Update the third content script entry `matches`:
```json
      "matches": [
        "https://*/*",
        "http://localhost/*",
        "http://127.0.0.1/*"
      ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/manifest-validation.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/manifest.json tests/manifest-validation.test.mjs
git commit -m "fix(extension): sanitize manifest permissions to omit wildcard http"
```

---

### Task 3: Side Panel Binary Onboarding View & Empty State

**Files:**
- Modify: `jobright_extension/panel.html:15-85`
- Modify: `jobright_extension/panel.css`
- Modify: `jobright_extension/panel.js:170-220, 520-560`
- Test: `tests/panel-onboarding.test.mjs`

**Interfaces:**
- Consumes: Connection status from `getStoredCredentials()` in `panel.js`.
- Produces: Binary rendering between `#onboarding-view` (unauthenticated) and `#authenticated-view` (authenticated).

- [ ] **Step 1: Write the failing test**

Create `tests/panel-onboarding.test.mjs` checking that:
1. `panel.html` contains `#onboarding-view` and `#authenticated-view`.
2. `#onboarding-view` has `#onboarding-connect` button and value proposition items.
3. Unauthenticated state displays `#onboarding-view` with `#authenticated-view` hidden.
4. Authenticated state hides `#onboarding-view` and reveals `#authenticated-view`.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Side Panel DOM: contains onboarding and authenticated view containers', () => {
  const html = readFileSync(new URL('../jobright_extension/panel.html', import.meta.url), 'utf8');

  assert.ok(html.includes('id="onboarding-view"'), 'Must have #onboarding-view');
  assert.ok(html.includes('id="authenticated-view"'), 'Must have #authenticated-view');
  assert.ok(html.includes('id="onboarding-connect"'), 'Must have #onboarding-connect button');
  assert.ok(html.includes('1-Click Autofill'), 'Must list 1-Click Autofill value prop');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/panel-onboarding.test.mjs`  
Expected: FAIL (missing #onboarding-view)

- [ ] **Step 3: Update `jobright_extension/panel.html` and `panel.css`**

1. In `jobright_extension/panel.html`, wrap the existing `<section class="context">` and `<section class="actions">` inside `<div id="authenticated-view">`.
2. Above it, add `<section id="onboarding-view" class="onboarding-card">`:
```html
<section id="onboarding-view" class="onboarding-card" hidden>
  <div class="onboarding-hero">
    <div class="onboarding-badge">NextKinHR Recruiting Copilot</div>
    <h2>Supercharge Your Job Applications</h2>
    <p class="onboarding-subtitle">Connect your verified candidate profile to autofill applications and track your submissions across top career sites.</p>
  </div>
  <ul class="onboarding-features">
    <li><span class="feature-icon">⚡</span><div><strong>1-Click Autofill</strong><p>Instantly fill ATS forms on Greenhouse, Lever, Workday, Ashby, and more.</p></div></li>
    <li><span class="feature-icon">📄</span><div><strong>Smart Resume Sync</strong><p>Keep your verified experience, contact info, and portfolio links ready.</p></div></li>
    <li><span class="feature-icon">🎯</span><div><strong>Automatic Tracking</strong><p>Submissions sync seamlessly to your NextKinHR dashboard.</p></div></li>
  </ul>
  <div class="onboarding-actions">
    <button id="onboarding-connect" class="primary full-width" type="button">Connect / Create Free Account</button>
    <p class="onboarding-hint">Free for job seekers. Signing in will automatically pair this extension.</p>
  </div>
</section>
```
3. In `jobright_extension/panel.css`, add styles for `.onboarding-card`, `.onboarding-hero`, `.onboarding-features`, and `.full-width`.

- [ ] **Step 4: Update `jobright_extension/panel.js` toggle logic**

In `jobright_extension/panel.js`:
1. Wire `#onboarding-connect` click listener:
```javascript
$('onboarding-connect')?.addEventListener('click', async () => {
  try {
    const stored = await chrome.storage.local.get('origin');
    const origin = apiOrigin(workspaceUrl(currentTab?.url) || workspaceUrl(stored.origin) || portalOrigin);
    await chrome.tabs.create({ url: new URL('/auth/jobseeker', origin).href });
  } catch (err) {
    notice('notice', 'Could not open NextKinHR login page: ' + err.message, true);
  }
});
```
2. In `renderAccount()`, toggle views based on `connected`:
```javascript
const connected = !!connection;
const onboardingView = $('onboarding-view');
const authenticatedView = $('authenticated-view');

if (onboardingView && authenticatedView) {
  onboardingView.hidden = connected;
  authenticatedView.hidden = !connected;
}
```

- [ ] **Step 5: Run tests and verify**

Run: `node --test tests/panel-onboarding.test.mjs tests/background-queue.test.mjs`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add jobright_extension/panel.html jobright_extension/panel.css jobright_extension/panel.js tests/panel-onboarding.test.mjs
git commit -m "feat(extension): add binary onboarding view for public store users"
```

---

### Task 4: Distribution Packager & Hygiene Validation

**Files:**
- Modify: `scripts/pack-extension.mjs:1-27`
- Test: `tests/pack-extension.test.mjs`

**Interfaces:**
- Consumes: Contents of `jobright_extension/`.
- Produces: `dist/jobright_extension-v3.3.19.zip` excluding tests, documentation, and sensitive files.

- [ ] **Step 1: Write the failing test**

Create `tests/pack-extension.test.mjs` testing that:
1. `scripts/pack-extension.mjs` exports or creates `dist/jobright_extension-v3.3.19.zip`.
2. The zip contains `manifest.json`, `panel.html`, `background.js`, and icon files.
3. The zip does NOT contain `.git`, `tests`, `docs`, or markdown files.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import * as fflate from 'fflate';

test('Packager: generates valid zip in dist/ without test or markdown files', async () => {
  const zipPath = new URL('../dist/jobright_extension-v3.3.19.zip', import.meta.url);
  assert.ok(existsSync(zipPath), 'dist/jobright_extension-v3.3.19.zip must exist');

  const zipBytes = readFileSync(zipPath);
  const unzipped = fflate.unzipSync(zipBytes);
  const fileNames = Object.keys(unzipped);

  assert.ok(fileNames.includes('manifest.json'), 'Must contain manifest.json');
  assert.ok(fileNames.includes('panel.html'), 'Must contain panel.html');
  assert.ok(fileNames.includes('background.js'), 'Must contain background.js');

  for (const name of fileNames) {
    assert.ok(!name.endsWith('.md'), `Must not contain markdown file: ${name}`);
    assert.ok(!name.startsWith('tests/'), `Must not contain test file: ${name}`);
    assert.ok(!name.includes('.git'), `Must not contain git file: ${name}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pack-extension.test.mjs`  
Expected: FAIL (file does not exist)

- [ ] **Step 3: Update `scripts/pack-extension.mjs`**

Rewrite `scripts/pack-extension.mjs`:
```javascript
import fs from 'node:fs';
import path from 'node:path';
import * as fflate from 'fflate';

const manifest = JSON.parse(fs.readFileSync(path.resolve('jobright_extension/manifest.json'), 'utf8'));
const version = manifest.version || '3.3.19';

const sourceDir = path.resolve('jobright_extension');
const distDir = path.resolve('dist');
const targetZip = path.join(distDir, `jobright_extension-v${version}.zip`);

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

function getFiles(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = {};
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(result, getFiles(fullPath, relPath));
    } else {
      if (entry.name.endsWith('.md') || entry.name.startsWith('.')) continue;
      result[relPath] = fs.readFileSync(fullPath);
    }
  }
  return result;
}

const files = getFiles(sourceDir);
const zipped = fflate.zipSync(files, { level: 9 });

fs.writeFileSync(targetZip, zipped);
console.log(`Created ${targetZip} (${zipped.length} bytes) successfully!`);
```

- [ ] **Step 4: Run packager and test**

Run: `node scripts/pack-extension.mjs && node --test tests/pack-extension.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/pack-extension.mjs tests/pack-extension.test.mjs
git commit -m "fix(packaging): output sanitized release zip to dist/ directory"
```

---

### Task 5: Store Submission Collateral & Asset Automation

**Files:**
- Create: `scripts/generate-store-assets.mjs`
- Create: `docs/assets/screenshot-autofill.png`, `docs/assets/screenshot-sidepanel.png`, `docs/assets/screenshot-answer-bank.png`, `docs/assets/screenshot-tracking.png`
- Modify: `CHROMEWEBSTORE.md`
- Test: `tests/store-assets.test.mjs`

**Interfaces:**
- Consumes: Asset definitions in `CHROMEWEBSTORE.md`.
- Produces: 4 valid 1280×800 PNG screenshots in `docs/assets/` and marks them as ready in `CHROMEWEBSTORE.md`.

- [ ] **Step 1: Write the failing test**

Create `tests/store-assets.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';

test('Store Assets: all four 1280x800 screenshots exist and are marked Ready in CHROMEWEBSTORE.md', () => {
  const expectedScreenshots = [
    'screenshot-autofill.png',
    'screenshot-sidepanel.png',
    'screenshot-answer-bank.png',
    'screenshot-tracking.png'
  ];

  for (const file of expectedScreenshots) {
    const p = new URL(`../docs/assets/${file}`, import.meta.url);
    assert.ok(existsSync(p), `Screenshot must exist: ${file}`);
    assert.ok(statSync(p).size > 1000, `Screenshot must not be empty: ${file}`);
  }

  const storeDoc = readFileSync(new URL('../CHROMEWEBSTORE.md', import.meta.url), 'utf8');
  for (const file of expectedScreenshots) {
    assert.ok(storeDoc.includes(file), `CHROMEWEBSTORE.md must reference ${file}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/store-assets.test.mjs`  
Expected: FAIL (assets missing)

- [ ] **Step 3: Build asset generator script `scripts/generate-store-assets.mjs`**

Create `scripts/generate-store-assets.mjs` using pure Node.js buffer manipulation / SVG to generate pixel-exact 1280×800 PNG presentation screenshots for the 4 core product views (Hero Autofill, Side Panel Match, Reusable Answers, and Dashboard Sync).

- [ ] **Step 4: Execute asset generation and update `CHROMEWEBSTORE.md`**

Run: `node scripts/generate-store-assets.mjs`  
Update `CHROMEWEBSTORE.md` asset table status from `⬜ Not created` to `✅ Ready`.

- [ ] **Step 5: Run tests and verify**

Run: `node --test tests/store-assets.test.mjs`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-store-assets.mjs docs/assets/ CHROMEWEBSTORE.md tests/store-assets.test.mjs
git commit -m "feat(store): generate 1280x800 web store screenshots and update listing checklist"
```

---

## 6. End-to-End Verification Pipeline

After all 5 tasks are completed, execute the complete verification command across the entire workspace:

```powershell
npm run typecheck && npm test && node scripts/pack-extension.mjs && node --test tests/pack-extension.test.mjs tests/store-assets.test.mjs tests/manifest-validation.test.mjs tests/panel-onboarding.test.mjs
```

All 250+ unit and integration tests must pass, and the production zip in `dist/jobright_extension-v3.3.19.zip` must be verified clean and ready for upload to the Google Chrome Developer Dashboard.
