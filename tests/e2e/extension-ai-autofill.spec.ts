import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import * as path from 'node:path';
import * as http from 'node:http';

const pathToExtension = path.resolve(process.cwd(), 'jobright_extension');

function startMockAiServer() {
  const requests: Array<{ url: string; method: string; auth?: string; body: any }> = [];
  let modeBehavior: 'ok' | '401' | 'html_502' = 'ok';

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: any = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { raw };
      }

      requests.push({
        url: req.url || '',
        method: req.method || 'GET',
        auth: req.headers.authorization,
        body,
      });

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const isAiEndpoint =
        req.url === '/api/extension/autofill/plan' ||
        req.url === '/api/extension/autofill/choose' ||
        req.url === '/api/extension/generate-answer' ||
        req.url === '/v1/chat/completions';

      if (modeBehavior === '401' && isAiEndpoint) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Custom provider authentication failed' }));
        return;
      }

      if (modeBehavior === 'html_502' && isAiEndpoint) {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>');
        return;
      }

      if (req.url === '/mock-ats/apply') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
  <head><title>Senior Engineer at Acme Corp</title></head>
  <body>
    <main>
      <h1>Senior Engineer</h1>
      <p data-company="Acme Corp">Acme Corp · San Francisco, CA</p>
      <div class="job-description">Build reliable distributed systems and developer tools at Acme Corp with TypeScript and Node.js.</div>
      <form id="application-form">
        <label for="first_name">First Name</label>
        <input id="first_name" name="first_name" type="text" required />

        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />

        <label for="work_auth_select">Are you legally authorized to work in the United States?</label>
        <select id="work_auth_select" name="work_auth" required>
          <option value="">Select...</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>

        <label for="sponsorship_combo">Will you now or in the future require sponsorship?</label>
        <div id="sponsorship_combo" role="combobox" tabindex="0" aria-expanded="false" aria-haspopup="listbox">Select an option</div>
        <ul id="sponsorship_listbox" role="listbox" style="display:none;">
          <li role="option" data-value="Yes">Yes</li>
          <li role="option" data-value="No">No</li>
        </ul>

        <label for="why_acme">Why do you want to join Acme Corp?</label>
        <textarea id="why_acme" name="why_acme" required></textarea>

        <label><input id="mkt_opt_in" name="mkt_opt_in" type="checkbox" /> Send me marketing newsletters and promotional job alerts</label>
        <button type="submit">Submit Application</button>
      </form>
    </main>
    <script>
      const combo = document.getElementById('sponsorship_combo');
      const listbox = document.getElementById('sponsorship_listbox');
      combo.addEventListener('click', () => {
        combo.setAttribute('aria-expanded', 'true');
        listbox.style.display = 'block';
      });
      listbox.querySelectorAll('[role="option"]').forEach((opt) => {
        opt.addEventListener('click', () => {
          combo.textContent = opt.textContent;
          combo.setAttribute('aria-expanded', 'false');
          listbox.style.display = 'none';
        });
      });
    </script>
  </body>
</html>`);
        return;
      }

      if (req.url?.startsWith('/api/extension/candidates')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            actorId: 'user-1',
            candidates: [
              {
                id: 'cand-1',
                version: 1,
                provenance_status: 'confirmed',
                full_name: 'Ada Lovelace',
                email: 'ada@example.com',
                primary_skills: 'TypeScript, Node.js',
                confirmed_facts: {
                  full_name: 'Ada Lovelace',
                  email: 'ada@example.com',
                  primary_skills: 'TypeScript, Node.js',
                },
              },
            ],
          }),
        );
        return;
      }

      if (req.url === '/api/extension/resume') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ documents: [] }));
        return;
      }

      if (req.url === '/api/extension/ai/settings') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            mode: 'server',
            provider: 'server',
            baseUrl: null,
            modelId: null,
            configVersion: req.method === 'PUT' ? 2 : 1,
            hasApiKey: false,
            maskedApiKey: null,
          }),
        );
        return;
      }

      if (req.url === '/api/extension/save-external-job') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.url === '/api/extension/generate-answer') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            answer: 'I want to join Acme Corp to build reliable TypeScript and Node.js systems.',
            stored: false,
          }),
        );
        return;
      }

      // Modes 1 & 2: backend proxy routes
      if (req.url === '/api/extension/autofill/plan') {
        const fields = Array.isArray(body?.fields) ? (body.fields as Array<{ id?: string; label?: string }>) : [];
        const hasAuthSelect = fields.some((f) => /legally authorized to work in the United States/i.test(f.label || ''));
        const hasSponCombo = fields.some((f) => /will you now or in the future require sponsorship/i.test(f.label || ''));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            fills: hasAuthSelect
              ? [
                  {
                    label: 'Are you legally authorized to work in the United States?',
                    value: 'yes',
                    fieldId: fields.find((f) => /authorized to work/i.test(f.label || ''))?.id,
                    evidenceIds: ['work_auth.authorized_in_usa'],
                    grounded: true,
                  },
                ]
              : [
                  {
                    label: 'First Name',
                    value: 'Ada',
                    fieldId: 'first_name',
                    evidenceIds: ['name.full_name'],
                    grounded: true,
                  },
                  {
                    label: 'Email',
                    value: 'ada@example.com',
                    fieldId: 'email',
                    evidenceIds: ['contact.email'],
                    grounded: true,
                  },
                ],
            unmapped: [],
            deferred: hasSponCombo
              ? ['Will you now or in the future require sponsorship?']
              : ['Authorized to Work in US?'],
          }),
        );
        return;
      }

      if (req.url === '/api/extension/autofill/choose') {
        const isSponsor = /sponsorship/i.test(body?.question?.label || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            choice: isSponsor ? 'No' : 'Yes',
            evidenceIds: [isSponsor ? 'work_auth.need_sponsorship_now' : 'work_auth.authorized_in_usa'],
          }),
        );
        return;
      }

      // Modes 3 & 4: direct OpenAI-compatible endpoint
      if (req.url === '/v1/chat/completions') {
        const userMsg = body?.messages?.find((m: any) => m.role === 'user')?.content || '';
        const isChoose = userMsg.includes('"options"') && userMsg.includes('"question"');

        let contentObj: any;
        if (isChoose) {
          contentObj = { choice: 'Yes' };
        } else if (userMsg.includes('Please specify preferred locations')) {
          contentObj = {
            fills: [{ label: 'Please specify preferred locations:', value: 'San Francisco, CA' }],
          };
        } else {
          contentObj = {
            fills: [
              { label: 'First Name', value: 'Ada' },
              { label: 'Email', value: 'ada@example.com' },
              { label: 'Authorized to Work in US?', value: '' },
            ],
          };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-e2e',
            choices: [{ message: { role: 'assistant', content: JSON.stringify(contentObj) } }],
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  });

  return {
    requests,
    setBehavior: (b: 'ok' | '401' | 'html_502') => {
      modeBehavior = b;
    },
    start: () =>
      new Promise<string>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as any;
          resolve(`http://127.0.0.1:${addr.port}`);
        });
      }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test.describe('E2E: FreeHire Hybrid AI Autofill Chrome Extension', () => {
  let context: BrowserContext;
  let extensionId: string;
  let mockServer: ReturnType<typeof startMockAiServer>;
  let mockBaseUrl: string;

  test.beforeEach(async () => {
    mockServer = startMockAiServer();
    mockBaseUrl = await mockServer.start();

    context = await chromium.launchPersistentContext('', {
      headless: true,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
      ],
    });

    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    const match = background.url().match(/^chrome-extension:\/\/([^/]+)\//);
    extensionId = match ? match[1] : '';
  });

  test.afterEach(async () => {
    if (context) {
      await context.close();
    }
    if (mockServer) {
      await mockServer.close();
    }
  });

  test('1. Extension service worker initializes and panel loads with AI Settings controls', async () => {
    expect(extensionId).toBeTruthy();
    const panelPage = await context.newPage();
    await panelPage.goto(`chrome-extension://${extensionId}/panel.html`);
    await expect(panelPage.locator('#ai-settings-panel')).toBeAttached();
    await expect(panelPage.locator('#ai-mode-select')).toBeAttached();
    await expect(panelPage.locator('#ai-provider-select')).toBeAttached();
  });

  test('2. Executes all 4 provider modes (server, portal_byok, extension_byok, local_direct) via extension AIRouter', async () => {
    const panelPage = await context.newPage();
    await panelPage.goto(`chrome-extension://${extensionId}/panel.html`);

    const results = await panelPage.evaluate(async (baseUrl) => {
      const { AIRouter } = await import(chrome.runtime.getURL('core/ai-router.js'));
      const { buildVerifiedFacts } = await import(chrome.runtime.getURL('core/ai/planner-bundle.js'));

      const facts = buildVerifiedFacts({
        full_name: 'Ada Lovelace',
        email: 'ada@example.com',
        authorized_in_usa: true,
        preferred_locations: 'San Francisco, CA',
      });

      const fields = [
        { id: 'first_name', label: 'First Name', type: 'text', required: true },
        { id: 'email', label: 'Email', type: 'email', required: true },
        { id: 'auth_us', label: 'Authorized to Work in US?', type: 'select', combo: true, required: true },
      ];

      const out: Record<string, any> = {};

      for (const mode of ['server', 'portal_byok', 'extension_byok', 'local_direct']) {
        const router = new AIRouter({
          mode,
          backendUrl: baseUrl,
          token: mode === 'server' || mode === 'portal_byok' ? 'ext-token-123' : null,
          config: {
            baseUrl: `${baseUrl}/v1`,
            apiKey: mode === 'extension_byok' ? 'sk-ext-byok-key' : '',
            model: mode === 'local_direct' ? 'llama3' : 'gpt-4o-mini',
          },
        });
        out[mode] = await router.plan(fields, facts);
      }
      return out;
    }, mockBaseUrl);

    expect(results.server.fills.length).toBe(2);
    expect(results.portal_byok.fills.length).toBe(2);
    expect(results.extension_byok.fills.length).toBe(2);
    expect(results.local_direct.fills.length).toBe(2);
    expect(results.extension_byok.deferred).toContain('Authorized to Work in US?');
    expect(results.local_direct.deferred).toContain('Authorized to Work in US?');

    // Verify requests routed accurately
    const urls = mockServer.requests.map((r) => r.url);
    expect(urls.filter((u) => u === '/api/extension/autofill/plan').length).toBe(2);
    expect(urls.filter((u) => u === '/v1/chat/completions').length).toBe(2);

    // Local direct must omit Authorization header; extension_byok must send its key
    const directCalls = mockServer.requests.filter((r) => r.url === '/v1/chat/completions');
    expect(directCalls[0].auth).toBe('Bearer sk-ext-byok-key');
    expect(directCalls[1].auth).toBeUndefined();
  });

  test('3. Handles provider failures (401 auth failure and 502 HTML error page) cleanly without silent fallback', async () => {
    const panelPage = await context.newPage();
    await panelPage.goto(`chrome-extension://${extensionId}/panel.html`);

    mockServer.setBehavior('401');
    const authErr = await panelPage.evaluate(async (baseUrl) => {
      const { AIRouter } = await import(chrome.runtime.getURL('core/ai-router.js'));
      const router = new AIRouter({
        mode: 'portal_byok',
        backendUrl: baseUrl,
        token: 'ext-token-123',
      });
      try {
        await router.plan([{ label: 'First Name', type: 'text' }], new Map());
        return null;
      } catch (e: any) {
        return e.message;
      }
    }, mockBaseUrl);
    expect(authErr).toMatch(/authentication failed/i);

    mockServer.setBehavior('html_502');
    const htmlErr = await panelPage.evaluate(async (baseUrl) => {
      const { AIRouter } = await import(chrome.runtime.getURL('core/ai-router.js'));
      const router = new AIRouter({
        mode: 'extension_byok',
        config: { baseUrl: `${baseUrl}/v1`, apiKey: 'sk-test', model: 'gpt-4o-mini' },
      });
      try {
        await router.plan([{ label: 'First Name', type: 'text' }], new Map());
        return null;
      } catch (e: any) {
        return { message: e.message, status: e.status, code: e.code };
      }
    }, mockBaseUrl);
    expect(htmlErr?.status).toBe(502);
    expect(htmlErr?.code).toBe('HTML_RESPONSE');
  });

  test('4. Live dropdown combobox selection (Choose) + dynamic conditional rescanning + submission safety', async () => {
    const formPage = await context.newPage();
    let submissionTriggered = false;
    await formPage.exposeFunction('onFormSubmit', () => {
      submissionTriggered = true;
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Ashby + Conditional Application</title></head>
        <body>
          <form id="app" onsubmit="window.onFormSubmit(); return false;">
            <label for="first_name">First Name</label>
            <input id="first_name" type="text" />

            <label for="auth_combo">Authorized to Work in US?</label>
            <div id="auth_combo" role="combobox" aria-expanded="true"></div>
            <ul role="listbox" id="auth_listbox">
              <li role="option" data-value="Yes">Yes</li>
              <li role="option" data-value="No">No</li>
            </ul>

            <label for="relocate">Are you willing to relocate?</label>
            <select id="relocate">
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>

            <div id="conditional_container" style="display: none;">
              <label for="location_pref">Please specify preferred locations:</label>
              <textarea id="location_pref"></textarea>
            </div>

            <button id="submit_btn" type="submit">Submit Application</button>
          </form>
          <script>
            document.getElementById('relocate').addEventListener('change', function(e) {
              if (e.target.value === 'yes') {
                document.getElementById('conditional_container').style.display = 'block';
              }
            });
          </script>
        </body>
      </html>
    `;
    await formPage.setContent(html);

    // Run Choose & conditional rescan via extension panel context, then write into formPage DOM
    const panelPage = await context.newPage();
    await panelPage.goto(`chrome-extension://${extensionId}/panel.html`);

    const liveOptions = await formPage.locator('#auth_listbox [role="option"]').allTextContents();
    expect(liveOptions).toEqual(['Yes', 'No']);

    const chooseResult = await panelPage.evaluate(
      async ({ baseUrl, options }) => {
        const { AIRouter } = await import(chrome.runtime.getURL('core/ai-router.js'));
        const { buildVerifiedFacts } = await import(chrome.runtime.getURL('core/ai/planner-bundle.js'));
        const facts = buildVerifiedFacts({
          full_name: 'Ada Lovelace',
          authorized_in_usa: true,
          preferred_locations: 'San Francisco, CA',
        });
        const router = new AIRouter({
          mode: 'extension_byok',
          config: { baseUrl: `${baseUrl}/v1`, apiKey: 'sk-ext', model: 'gpt-4o-mini' },
        });
        return await router.choose(
          { id: 'auth_combo', label: 'Authorized to Work in US?', combo: true },
          options,
          facts,
        );
      },
      { baseUrl: mockBaseUrl, options: liveOptions },
    );
    expect(chooseResult.choice).toBe('Yes');

    // Trigger conditional DOM mutation and verify hidden field becomes visible
    await expect(formPage.locator('#conditional_container')).toBeHidden();
    await formPage.selectOption('#relocate', 'yes');
    await expect(formPage.locator('#conditional_container')).toBeVisible();

    const conditionalLabel = await formPage.locator('label[for="location_pref"]').textContent();
    const rescanPlan = await panelPage.evaluate(
      async ({ baseUrl, label }) => {
        const { AIRouter } = await import(chrome.runtime.getURL('core/ai-router.js'));
        const { buildVerifiedFacts } = await import(chrome.runtime.getURL('core/ai/planner-bundle.js'));
        const facts = buildVerifiedFacts({
          full_name: 'Ada Lovelace',
          preferred_locations: 'San Francisco, CA',
        });
        const router = new AIRouter({
          mode: 'extension_byok',
          config: { baseUrl: `${baseUrl}/v1`, apiKey: 'sk-ext', model: 'gpt-4o-mini' },
        });
        return await router.plan([{ id: 'location_pref', label: label || '', type: 'textarea' }], facts);
      },
      { baseUrl: mockBaseUrl, label: conditionalLabel },
    );

    expect(rescanPlan.fills.length).toBe(1);
    expect(rescanPlan.fills[0].value).toBe('San Francisco, CA');
    await formPage.fill('#location_pref', rescanPlan.fills[0].value);
    expect(await formPage.inputValue('#location_pref')).toBe('San Francisco, CA');

    // Submission safety: autofill NEVER triggers form submit
    expect(submissionTriggered).toBe(false);
  });

  test('5. Side panel #autofill executes Stage A (plan + combobox choose) + Stage B (prose), excludes marketing, and surfaces errors', async () => {
    const atsPage = await context.newPage();
    await atsPage.goto(`${mockBaseUrl}/mock-ats/apply`);
    await expect(atsPage.locator('#application-form')).toBeVisible();

    const panelPage = await context.newPage();
    await panelPage.goto(`chrome-extension://${extensionId}/panel.html`);

    // Seed authenticated extension session & point chrome.tabs.query({ active: true }) at atsPage
    await panelPage.evaluate(async (baseUrl) => {
      type MockChrome = {
        storage: {
          local: { set: (items: Record<string, unknown>) => Promise<void> };
          session: { set: (items: Record<string, unknown>) => Promise<void> };
        };
        tabs: {
          query: (queryInfo: { active?: boolean; currentWindow?: boolean }) => Promise<Array<{ url?: string }>>;
        };
      };
      const extChrome = (globalThis as unknown as { chrome: MockChrome }).chrome;
      await extChrome.storage.local.set({
        origin: baseUrl,
        user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' },
      });
      await extChrome.storage.session.set({
        origin: baseUrl,
        token: 'ext-token-123',
        accountId: 'user-1',
        ai_provider_mode: 'server',
      });
      const allTabs = await extChrome.tabs.query({});
      const atsTab = allTabs.find((t) => t.url && t.url.includes('/mock-ats/apply'));
      if (!atsTab) throw new Error('Could not find mock-ats tab');
      const origQuery = extChrome.tabs.query.bind(extChrome.tabs);
      extChrome.tabs.query = async (queryInfo) => {
        if (queryInfo && queryInfo.active && queryInfo.currentWindow) {
          return [atsTab];
        }
        return origQuery(queryInfo);
      };
    }, mockBaseUrl);

    // Trigger refresh by focusing panelPage
    await panelPage.evaluate(() => window.dispatchEvent(new Event('focus')));

    await expect(panelPage.locator('#ai-screening')).toBeChecked();
    await expect(panelPage.locator('#autofill')).toBeEnabled({ timeout: 10000 });

    await panelPage.click('#autofill');

    // Verify Stage A + Stage B fills landed in the mock ATS page DOM
    await expect(atsPage.locator('#first_name')).toHaveValue('Ada', { timeout: 10000 });
    await expect(atsPage.locator('#email')).toHaveValue('ada@example.com');
    await expect(atsPage.locator('#work_auth_select')).toHaveValue('Yes');
    await expect(atsPage.locator('#sponsorship_combo')).toHaveText('No');
    await expect(atsPage.locator('#why_acme')).toHaveValue(
      'I want to join Acme Corp to build reliable TypeScript and Node.js systems.',
    );
    await expect(atsPage.locator('#mkt_opt_in')).not.toBeChecked();

    // Verify marketing opt-in checkbox was never sent to plan or generate-answer
    const planReq = mockServer.requests.find((r) => r.url === '/api/extension/autofill/plan');
    const chooseReq = mockServer.requests.find((r) => r.url === '/api/extension/autofill/choose');
    const genReq = mockServer.requests.find((r) => r.url === '/api/extension/generate-answer');
    expect(planReq).toBeTruthy();
    expect(chooseReq).toBeTruthy();
    expect(genReq).toBeTruthy();
    const planFields = Array.isArray(planReq!.body?.fields)
      ? (planReq!.body.fields as Array<{ label?: string }>)
      : [];
    expect(planFields.some((f) => /marketing/i.test(f.label || ''))).toBe(false);
    expect(/marketing/i.test(genReq!.body.fieldLabel || '')).toBe(false);

    // Verify error surfacing: switch to 401 mode and clear answers to re-trigger autofill error
    await atsPage.fill('#why_acme', '');
    await atsPage.selectOption('#work_auth_select', '');
    mockServer.setBehavior('401');
    await expect(panelPage.locator('#autofill')).toBeEnabled({ timeout: 10000 });
    await panelPage.click('#autofill');

    await expect(panelPage.locator('#notice')).toBeVisible({ timeout: 10000 });
    await expect(panelPage.locator('#notice')).toHaveAttribute('data-error', 'true');
    await expect(panelPage.locator('#notice')).toContainText(/authentication failed/i);
  });
});
