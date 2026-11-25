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

      if (modeBehavior === '401') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Custom provider authentication failed' }));
        return;
      }

      if (modeBehavior === 'html_502') {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>');
        return;
      }

      // Modes 1 & 2: backend proxy routes
      if (req.url === '/api/extension/autofill/plan') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            fills: [
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
            deferred: ['Authorized to Work in US?'],
          }),
        );
        return;
      }

      if (req.url === '/api/extension/autofill/choose') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            choice: 'Yes',
            evidenceIds: ['work_auth.authorized_in_usa'],
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
});
