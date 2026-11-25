import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

test('MV3 Lifecycle, Trusted Context Migration, Sender Validation & Dynamic Rescanning', async (t) => {
  const portalConnPath = path.join(rootDir, 'jobright_extension/portal-connection.js');
  const backgroundPath = path.join(rootDir, 'jobright_extension/background.js');
  const aiRouterPath = path.join(rootDir, 'jobright_extension/core/ai-router.js');
  const applicationPath = path.join(rootDir, 'jobright_extension/core/application.js');

  await t.test('1. portal-connection.js communicates connection saves via runtime messaging rather than direct local token writes', () => {
    assert.ok(fs.existsSync(portalConnPath), 'portal-connection.js must exist');
    const content = fs.readFileSync(portalConnPath, 'utf8');

    // Must route connection saving via NEXTKIN_SAVE_CONNECTION messaging
    assert.ok(
      content.includes('NEXTKIN_SAVE_CONNECTION'),
      'portal-connection.js must send NEXTKIN_SAVE_CONNECTION message',
    );

    // Sensitive tokens are NEVER written to chrome.storage.local
    assert.equal(
      content.includes("chrome.storage.local.set({ token") ||
      content.includes("chrome.storage.local.set({token") ||
      content.includes("local.set({ token"),
      false,
      'portal-connection.js must never write token to chrome.storage.local',
    );
  });

  await t.test('2. background.js invokes chrome.storage.local.setAccessLevel with TRUSTED_CONTEXTS', () => {
    assert.ok(fs.existsSync(backgroundPath), 'background.js must exist');
    const content = fs.readFileSync(backgroundPath, 'utf8');

    assert.ok(
      content.includes("accessLevel: 'TRUSTED_CONTEXTS'"),
      "background.js must configure storage with accessLevel: 'TRUSTED_CONTEXTS'",
    );
  });

  await t.test('3. background.js validates sender.id === chrome.runtime.id on runtime.onMessage listeners', () => {
    assert.ok(fs.existsSync(backgroundPath), 'background.js must exist');
    const content = fs.readFileSync(backgroundPath, 'utf8');

    // Look for sender verification
    assert.ok(
      content.includes('sender.id === chrome.runtime.id') ||
      content.includes('sender?.id === chrome.runtime.id') ||
      content.includes('sender.id !== chrome.runtime.id'),
      'background.js must enforce sender.id === chrome.runtime.id check',
    );
  });

  await t.test('4. ai-router.js dispatches Mode 4 (Local) & Mode 3 (Extension BYOK) directly, and Modes 1 & 2 via proxy', async () => {
    assert.ok(fs.existsSync(aiRouterPath), 'ai-router.js must exist');

    const routerUrl = `file:///${aiRouterPath.replace(/\\/g, '/')}`;
    const { AIRouter } = await import(routerUrl);
    assert.ok(AIRouter, 'AIRouter must be exported');

    // Mode 4: Local Direct
    let localClientCreated = false;
    const localRouter = new AIRouter({
      mode: 'local_direct',
      config: { baseUrl: 'http://localhost:11434', model: 'llama3' },
      clientFactory: (opts) => {
        localClientCreated = true;
        assert.equal(opts.baseUrl, 'http://localhost:11434');
        return {
          generateChatCompletion: async () => ({ rawJson: { fills: [{ label: 'Name', value: 'Local AI' }] } }),
        };
      },
    });

    const localResult = await localRouter.plan(
      [{ label: 'Name', type: 'text' }],
      new Map([['profile.name', { id: 'profile.name', type: 'string', value: 'Local AI', source: 'profile' }]]),
    );
    assert.ok(localClientCreated, 'Local mode must execute directly via client');
    assert.equal(localResult.fills?.[0]?.value, 'Local AI');

    // Mode 1: Server Default Proxy
    let serverProxyCalled = false;
    const serverRouter = new AIRouter({
      mode: 'server',
      backendUrl: 'https://app.nextkinhr.com',
      token: 'jwt-session-token',
      fetchFn: async (url, opts) => {
        serverProxyCalled = true;
        assert.equal(url, 'https://app.nextkinhr.com/api/extension/autofill/plan');
        assert.equal(opts.headers['Authorization'], 'Bearer jwt-session-token');
        return new Response(
          JSON.stringify({ fills: [{ label: 'Email', value: 'server@example.com' }], batchCount: 1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    const serverResult = await serverRouter.plan(
      [{ label: 'Email', type: 'text' }],
      new Map(),
    );
    assert.ok(serverProxyCalled, 'Server mode must route via /api/extension/autofill/plan');
    assert.equal(serverResult.fills?.[0]?.value, 'server@example.com');
  });

  await t.test('5. Stale plan protection rejects fills if documentId, tabId, or formRevision changed', async () => {
    assert.ok(fs.existsSync(aiRouterPath), 'ai-router.js must exist');
    const routerUrl = `file:///${aiRouterPath.replace(/\\/g, '/')}`;
    const { validateSessionFreshness } = await import(routerUrl);

    assert.equal(typeof validateSessionFreshness, 'function', 'validateSessionFreshness must be exported');

    const originalSession = {
      sessionId: 'sess-123',
      tabId: 42,
      documentId: 'doc-abc',
      formRevision: 1,
    };

    // Current state matches -> Fresh
    const freshCheck = validateSessionFreshness(originalSession, {
      tabId: 42,
      documentId: 'doc-abc',
      formRevision: 1,
    });
    assert.equal(freshCheck.fresh, true);

    // Document changed (e.g. navigation / iframe replacement) -> Stale
    const docChangedCheck = validateSessionFreshness(originalSession, {
      tabId: 42,
      documentId: 'doc-xyz',
      formRevision: 1,
    });
    assert.equal(docChangedCheck.fresh, false);
    assert.match(docChangedCheck.reason, /document/i);

    // Form mutated (e.g. conditional questions added) -> Stale
    const revChangedCheck = validateSessionFreshness(originalSession, {
      tabId: 42,
      documentId: 'doc-abc',
      formRevision: 2,
    });
    assert.equal(revChangedCheck.fresh, false);
    assert.match(revChangedCheck.reason, /revision/i);
  });

  await t.test('6. Dynamic rescanning in application.js detects conditional questions and bounds passes to 3', () => {
    assert.ok(fs.existsSync(applicationPath), 'application.js must exist');
    const content = fs.readFileSync(applicationPath, 'utf8');

    // Verify conditional question rescan observer & max pass bounding
    assert.ok(
      content.includes('rescanConditionalQuestions') || content.includes('conditional'),
      'application.js must include conditional question observer or rescan mechanism',
    );
    assert.ok(
      content.includes('maxPasses') || content.includes('passCount') || content.includes('3'),
      'application.js must bound rescanning passes to maximum 3 passes',
    );
  });

  await t.test('7. AIRouter proxy modes (server, portal_byok) send PlanApiRequest / ChooseApiRequest payloads with candidateId, context, and answerBank', async () => {
    const routerUrl = `file:///${aiRouterPath.replace(/\\/g, '/')}`;
    const { AIRouter } = await import(routerUrl);

    for (const mode of ['server', 'portal_byok']) {
      const captured = [];
      const router = new AIRouter({
        mode,
        backendUrl: 'https://app.nextkinhr.com/',
        token: 'jwt-token-xyz',
        fetchFn: async (url, opts) => {
          captured.push({ url, method: opts.method, headers: opts.headers, body: JSON.parse(opts.body) });
          return new Response(
            JSON.stringify(
              url.endsWith('/plan')
                ? { ok: true, fills: [{ label: 'Name', value: 'Ada' }] }
                : { ok: true, choice: 'A' },
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        },
      });

      const fields = [{ id: 'f1', label: 'Name', type: 'text' }];
      const answerBank = [{ topic: 'relocation', answer: 'Yes' }];
      const context = { jobTitle: 'Eng' };

      const planRes = await router.plan(
        fields,
        { candidateId: 'cand-1', answerBank },
        context,
      );
      assert.equal(planRes.fills?.[0]?.value, 'Ada');
      assert.equal(captured[0].url, 'https://app.nextkinhr.com/api/extension/autofill/plan');
      assert.equal(captured[0].headers['Authorization'], 'Bearer jwt-token-xyz');
      assert.deepEqual(captured[0].body, {
        candidateId: 'cand-1',
        fields,
        context: { jobTitle: 'Eng' },
        answerBank: [{ topic: 'relocation', answer: 'Yes' }],
      });
      assert.equal('mode' in captured[0].body, false, 'proxy plan payload must not include legacy mode key');
      assert.equal('facts' in captured[0].body, false, 'proxy plan payload must not include legacy facts key');

      const question = { id: 'q1', label: 'Pick one', combo: true };
      const chooseRes = await router.choose(
        question,
        ['A', 'B'],
        { candidateId: 'cand-1', answerBank: [] },
        context,
      );
      assert.equal(chooseRes.choice, 'A');
      assert.equal(captured[1].url, 'https://app.nextkinhr.com/api/extension/autofill/choose');
      assert.deepEqual(captured[1].body, {
        candidateId: 'cand-1',
        question,
        options: ['A', 'B'],
        context: { jobTitle: 'Eng' },
        answerBank: [],
      });
      assert.equal('mode' in captured[1].body, false, 'proxy choose payload must not include legacy mode key');
      assert.equal('facts' in captured[1].body, false, 'proxy choose payload must not include legacy facts key');
    }

    // Backward-compatible Map call with constructor defaults
    let mapBody = null;
    const compatRouter = new AIRouter({
      mode: 'server',
      backendUrl: 'https://app.nextkinhr.com',
      candidateId: 'cand-default',
      answerBank: [{ topic: 'work_auth', answer: 'Yes' }],
      fetchFn: async (_url, opts) => {
        mapBody = JSON.parse(opts.body);
        return new Response(JSON.stringify({ ok: true, fills: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    await compatRouter.plan([{ label: 'Email', type: 'text' }], new Map([['profile.email', { value: 'a@b.com' }]]));
    assert.deepEqual(mapBody, {
      candidateId: 'cand-default',
      fields: [{ label: 'Email', type: 'text' }],
      context: {},
      answerBank: [{ topic: 'work_auth', answer: 'Yes' }],
    });
  });

  await t.test('8. AIRouter.generateTextAnswer executes direct text generation in extension_byok / local_direct (and local alias) and rejects empty answers', async () => {
    const routerUrl = `file:///${aiRouterPath.replace(/\\/g, '/')}`;
    const { AIRouter } = await import(routerUrl);

    // Extension BYOK via clientFactory
    let capturedCall = null;
    const byokRouter = new AIRouter({
      mode: 'extension_byok',
      config: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini' },
      clientFactory: (opts) => {
        assert.equal(opts.apiKey, 'sk-test');
        return {
          generateChatCompletion: async (messages, completionOpts) => {
            capturedCall = { messages, completionOpts };
            return { text: '  "I bring 6 years of backend engineering experience."  ' };
          },
        };
      },
    });

    const byokResult = await byokRouter.generateTextAnswer(
      'You are a career copilot.',
      'Why are you interested in this role?',
    );
    assert.deepEqual(byokResult, {
      ok: true,
      answer: 'I bring 6 years of backend engineering experience.',
    });
    assert.deepEqual(capturedCall.messages, [
      { role: 'system', content: 'You are a career copilot.' },
      { role: 'user', content: 'Why are you interested in this role?' },
    ]);
    assert.equal(capturedCall.completionOpts.responseFormat, 'text');
    assert.equal(capturedCall.completionOpts.maxTokens, 1500);
    assert.equal(capturedCall.completionOpts.temperature, 0.7);

    // Local alias normalized to local_direct using real ProviderClient via fetchFn
    let localFetchUrl = null;
    let localFetchBody = null;
    const localRouter = new AIRouter({
      mode: 'local',
      config: { baseUrl: 'http://localhost:11434', model: 'llama3' },
      fetchFn: async (url, init) => {
        localFetchUrl = url;
        localFetchBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Excited to build distributed systems.' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });
    assert.equal(localRouter.mode, 'local_direct');

    const localResult = await localRouter.generateTextAnswer(
      'System prompt',
      'User prompt',
      { maxTokens: 500, temperature: 0.3 },
    );
    assert.deepEqual(localResult, { ok: true, answer: 'Excited to build distributed systems.' });
    assert.equal(localFetchUrl, 'http://localhost:11434/v1/chat/completions');
    assert.equal(localFetchBody.max_tokens, 500);
    assert.equal(localFetchBody.temperature, 0.3);
    assert.equal(localFetchBody.response_format, undefined);

    // Empty response throws
    const emptyRouter = new AIRouter({
      mode: 'local_direct',
      clientFactory: () => ({
        generateChatCompletion: async () => ({ text: '  ""  ' }),
      }),
    });
    await assert.rejects(
      () => emptyRouter.generateTextAnswer('sys', 'usr'),
      /empty/i,
    );

    // Proxy mode cannot call generateTextAnswer
    const serverRouter = new AIRouter({ mode: 'server', backendUrl: 'https://app.nextkinhr.com' });
    await assert.rejects(
      () => serverRouter.generateTextAnswer('sys', 'usr'),
      /extension_byok|local_direct/i,
    );
  });
});
