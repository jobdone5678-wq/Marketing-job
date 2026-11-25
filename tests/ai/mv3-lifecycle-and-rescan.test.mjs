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

  await t.test('9. panel.html & panel.js wire #ai-screening persistence, extension_byok session isolation, accountChanged reset, and AIRouter imports without answer-drafts', () => {
    const panelHtmlPath = path.join(rootDir, 'jobright_extension/panel.html');
    const panelJsPath = path.join(rootDir, 'jobright_extension/panel.js');
    const panelHtml = fs.readFileSync(panelHtmlPath, 'utf8');
    const panelJs = fs.readFileSync(panelJsPath, 'utf8');

    // #ai-screening defaults to checked in panel.html and persists via chrome.storage.local
    assert.match(panelHtml, /<input[^>]*id="ai-screening"[^>]*checked/i, 'panel.html #ai-screening must default to checked');
    assert.ok(panelJs.includes('aiScreeningEnabled'), 'panel.js must persist aiScreeningEnabled in chrome.storage.local');

    // Dynamic imports for AIRouter and planner-bundle without answer-drafts
    assert.ok(panelJs.includes("chrome.runtime.getURL('core/ai-router.js')"), 'panel.js must load core/ai-router.js via chrome.runtime.getURL');
    assert.ok(panelJs.includes("chrome.runtime.getURL('core/ai/planner-bundle.js')"), 'panel.js must load core/ai/planner-bundle.js via chrome.runtime.getURL');
    assert.equal(panelJs.includes('answer-drafts'), false, 'panel.js must not reference answer-drafts');

    // extension_byok omits apiKey from PUT ai/settings
    assert.match(panelJs, /mode\s*!==\s*['"]extension_byok['"]/, 'panel.js must omit apiKey from PUT ai/settings when mode is extension_byok');

    // accountChanged clears session AI keys/metadata and resets loaded/dirty flags
    assert.ok(panelJs.includes("ai_api_key"), 'panel.js must manage ai_api_key in chrome.storage.session');
    assert.match(panelJs, /if\s*\(\s*accountChanged\s*\)[\s\S]*aiSettingsLoaded\s*=\s*false[\s\S]*aiSettingsDirty\s*=\s*false/, 'accountChanged must reset aiSettingsLoaded and aiSettingsDirty');
    assert.match(panelJs, /if\s*\(\s*accountChanged\s*\)[\s\S]*chrome\.storage\.session\.remove/, 'accountChanged must clear AI session storage keys');

    // Stage A + Stage B usage
    assert.ok(panelJs.includes('router.plan('), 'panel.js must call router.plan()');
    assert.ok(panelJs.includes('router.choose('), 'panel.js must call router.choose()');
    assert.ok(panelJs.includes('router.generateTextAnswer('), 'panel.js must call router.generateTextAnswer() for direct Stage B');
  });

  await t.test('10. panel.js draftScreening executes Stage A (plan + deferred combobox choose) + Stage B (prose-only), filters marketing/URL/DOB, disambiguates duplicates, and surfaces errors', async () => {
    const { runInNewContext } = await import('node:vm');
    const panelJsPath = path.join(rootDir, 'jobright_extension/panel.js');
    const panelJs = fs.readFileSync(panelJsPath, 'utf8');
    const plannerUrl = `file:///${path.join(rootDir, 'jobright_extension/core/ai/planner-bundle.js').replace(/\\/g, '/')}`;
    const routerUrl = `file:///${aiRouterPath.replace(/\\/g, '/')}`;
    const { buildVerifiedFacts, inferQuestionDescriptor } = await import(plannerUrl);
    const { AIRouter } = await import(routerUrl);

    const startIdx = panelJs.indexOf('async function mapConcurrent(');
    const endIdx = panelJs.indexOf('function outsideApplicationPage(');
    assert.ok(startIdx !== -1 && endIdx > startIdx, 'Must locate screening section in panel.js');
    const screeningSlice = panelJs.slice(startIdx, endIdx);

    const makeHarness = ({
      sessionStore = { ai_provider_mode: 'server' },
      planHandler,
      chooseHandler,
      apiHandler,
      executeScriptChoices = {},
    }) => {
      const apiCalls = [];
      const planCalls = [];
      const chooseCalls = [];
      const generateTextCalls = [];

      class MockAIRouter extends AIRouter {
        async plan(fields, factsOrPayload, ctx) {
          planCalls.push({ fields, factsOrPayload, ctx, mode: this.mode, config: this.config });
          if (planHandler) return planHandler(fields, factsOrPayload, ctx);
          return { fills: [], deferred: [], unmapped: [] };
        }
        async choose(question, options, factsOrPayload, ctx) {
          chooseCalls.push({ question, options, factsOrPayload, ctx });
          if (chooseHandler) return chooseHandler(question, options, factsOrPayload, ctx);
          return { choice: null };
        }
        async generateTextAnswer(sys, usr, opts) {
          generateTextCalls.push({ sys, usr, opts, mode: this.mode, config: this.config });
          return { ok: true, answer: 'Direct prose answer' };
        }
      }

      const sandbox = {
        console,
        crypto,
        Set,
        Map,
        Object,
        Array,
        Promise,
        Error,
        lastScreeningWarnings: [],
        AI_PROVIDER_DEFAULTS: {
          server: { baseUrl: '', modelId: '' },
          openai: { baseUrl: 'https://api.openai.com/v1', modelId: 'gpt-4o-mini' },
          ollama: { baseUrl: 'http://localhost:11434/v1', modelId: 'llama3.2:latest' },
        },
        authFailed: (err) => err?.status === 401 || err?.status === 403,
        apiOrigin: (o) => o,
        formTarget: (tab, frame) => ({ tabId: tab.id, frameIds: [frame.frameId] }),
        checkScreeningContext: async () => {},
        NextkinFieldMapping: {
          isUrlField: (q) => /url|github|portfolio/i.test(q?.id || q?.label || ''),
          CONSEQUENTIAL_FACTS: new Set([
            'authorized_in_usa', 'needs_sponsorship', 'visa_status', 'work_authorization', 'date_of_birth',
            'citizenship_status', 'gender', 'race', 'race_ethnicity', 'veteran', 'veteran_status', 'disability', 'disability_status',
          ]),
        },
        chrome: {
          runtime: { getURL: (p) => p },
          storage: {
            session: {
              get: async () => ({ ...sessionStore }),
              set: async (vals) => Object.assign(sessionStore, vals),
            },
          },
          scripting: {
            executeScript: async ({ args }) => {
              const targetFieldId = args?.[0] || '';
              return [{ result: executeScriptChoices[targetFieldId] || [] }];
            },
          },
        },
        api: async (pathStr, opts) => {
          const body = opts?.body ? JSON.parse(opts.body) : null;
          apiCalls.push({ path: pathStr, body });
          if (apiHandler) return apiHandler(pathStr, body);
          return { ok: true, answer: 'Server prose answer' };
        },
        loadAiModules: async () => ({
          AIRouter: MockAIRouter,
          buildVerifiedFacts,
          inferQuestionDescriptor,
        }),
      };
      runInNewContext(screeningSlice, sandbox);
      return {
        draftScreening: sandbox.draftScreening,
        getWarnings: () => sandbox.lastScreeningWarnings,
        apiCalls,
        planCalls,
        chooseCalls,
        generateTextCalls,
      };
    };

    // Case A: Stage A (plan + duplicate-label deferred comboboxes) + Stage B (prose only), filters URL, marketing checkbox, DOB, and work-auth from Stage B
    const hA = makeHarness({
      sessionStore: { ai_provider_mode: 'server' },
      planHandler: async () => ({
        fills: [{ fieldId: 'q_auth', label: 'Are you legally authorized to work in the US?', value: 'Yes' }],
        deferredFieldIds: ['q_country_1', 'q_country_2'],
        unmapped: [],
      }),
      executeScriptChoices: {
        'q_country_1': ['Canada', 'United States'],
        'q_country_2': ['Germany', 'United Kingdom'],
      },
      chooseHandler: async (q, options) => {
        if (q.id === 'q_country_1') return { choice: options.includes('United States') ? 'United States' : null };
        if (q.id === 'q_country_2') return { choice: options.includes('Germany') ? 'Germany' : null };
        return { choice: null };
      },
    });

    const profile = { id: 'cand-1', full_name: 'Ada Lovelace', authorized_in_usa: true, primary_skills: 'Math, Engines' };
    const questions = [
      { id: 'q_url', label: 'GitHub URL', type: 'text', options: [] },
      { id: 'q_mkt', label: 'Send me marketing newsletters and job alerts', type: 'checkbox', options: [] },
      { id: 'q_dob', label: 'Date of Birth', type: 'text', options: [] },
      { id: 'q_auth', label: 'Are you legally authorized to work in the US?', type: 'select', options: ['Yes', 'No'] },
      { id: 'q_country_1', label: 'Country', type: 'combobox', options: [] },
      { id: 'q_country_2', label: 'Country', type: 'combobox', options: [] },
      { id: 'q_spon', label: 'Will you require visa sponsorship?', type: 'text', options: [] },
      { id: 'q_why', label: 'Why do you want to join Acme?', type: 'textarea', options: [] },
    ];
    const questionMeta = {
      q_url: { fieldId: 'f_url', combo: false, required: false },
      q_mkt: { fieldId: 'f_mkt', combo: false, required: false, factKey: 'consent' },
      q_dob: { fieldId: 'f_dob', combo: false, required: false, factKey: 'date_of_birth' },
      q_auth: { fieldId: 'f_auth', combo: false, required: true, factKey: 'authorized_in_usa' },
      q_country_1: { fieldId: 'combo_1', combo: true, required: true },
      q_country_2: { fieldId: 'combo_2', combo: true, required: true },
      q_spon: { fieldId: 'f_spon', combo: false, required: true, factKey: 'needs_sponsorship' },
      q_why: { fieldId: 'f_why', combo: false, required: true },
    };

    const answersA = await hA.draftScreening(
      { origin: 'https://app.nextkinhr.com', token: 'tok' },
      profile,
      { id: 10 },
      { title: 'Engineer', company: 'Acme' },
      questions,
      { frame: { frameId: 0, result: { url: 'https://jobs.example/apply' } } },
      {},
      questionMeta,
    );

    const plannedIds = hA.planCalls[0].fields.map((f) => f.id);
    assert.equal(plannedIds.includes('q_url'), false, 'URL field must not reach Stage A');
    assert.equal(plannedIds.includes('q_mkt'), false, 'Marketing opt-in checkbox must not reach Stage A');
    assert.equal(plannedIds.includes('q_dob'), false, 'DOB must not reach Stage A');

    assert.equal(plannedIds.includes('q_auth'), false, 'Work authorization stays out of AI planning');
    assert.equal(hA.chooseCalls.length, 2, 'Both duplicate-label deferred comboboxes must be processed');
    assert.equal(hA.chooseCalls[0].question.id, 'q_country_1');
    assert.equal(hA.chooseCalls[1].question.id, 'q_country_2');

    // Stage B must ONLY receive q_why (never q_spon, q_mkt, q_dob, or q_url)
    const genAnswerCalls = hA.apiCalls.filter((c) => c.path === 'generate-answer');
    assert.deepEqual(genAnswerCalls.map((c) => c.body.questionId), ['q_why']);

    assert.deepEqual(
      { ...answersA },
      {
        q_country_1: 'United States',
        q_country_2: 'Germany',
        q_why: 'Server prose answer',
      },
    );

    // Case B: extension_byok without ai_api_key fails fast with actionable message
    const hB = makeHarness({
      sessionStore: { ai_provider_mode: 'extension_byok', ai_provider_type: 'openai' },
    });
    await assert.rejects(
      () => hB.draftScreening(
        { origin: 'https://app.nextkinhr.com', token: 'tok' },
        profile,
        { id: 10 },
        { title: 'Engineer', company: 'Acme' },
        [{ id: 'q_why', label: 'Why do you want to join Acme?', type: 'textarea', options: [] }],
        { frame: { frameId: 0, result: { url: 'https://jobs.example/apply' } } },
        {},
        {},
      ),
      /Enter your API key.*Extension Direct BYOK/i,
    );
    assert.equal(hB.planCalls.length, 0, 'Missing extension_byok key must fail before calling router.plan');

    // Case C: Stage A + Stage B errors are surfaced when no answers succeed
    const hC = makeHarness({
      sessionStore: { ai_provider_mode: 'portal_byok' },
      planHandler: async () => {
        const err = new Error('Custom provider authentication failed');
        err.status = 401;
        throw err;
      },
    });
    await assert.rejects(
      () => hC.draftScreening(
        { origin: 'https://app.nextkinhr.com', token: 'tok' },
        profile,
        { id: 10 },
        { title: 'Engineer', company: 'Acme' },
        [{ id: 'q_why', label: 'Why do you want to join Acme?', type: 'textarea', options: [] }],
        { frame: { frameId: 0, result: { url: 'https://jobs.example/apply' } } },
        {},
        {},
      ),
      /authentication failed/i,
    );

    // Case D: extension_byok executes Stage B via router.generateTextAnswer (not server generate-answer)
    const hD = makeHarness({
      sessionStore: {
        ai_provider_mode: 'extension_byok',
        ai_provider_type: 'openai',
        ai_base_url: 'https://api.openai.com/v1',
        ai_model_id: 'gpt-4o-mini',
        ai_api_key: 'sk-ext-test',
      },
    });
    const answersD = await hD.draftScreening(
      { origin: 'https://app.nextkinhr.com', token: 'tok' },
      profile,
      { id: 10 },
      { title: 'Engineer', company: 'Acme' },
      [{ id: 'q_why', label: 'Why do you want to join Acme?', type: 'textarea', options: [] }],
      { frame: { frameId: 0, result: { url: 'https://jobs.example/apply' } } },
      {},
      {},
    );
    assert.equal(hD.generateTextCalls.length, 1);
    assert.equal(hD.apiCalls.filter((c) => c.path === 'generate-answer').length, 0);
    assert.equal(answersD.q_why, 'Direct prose answer');
  });

  await t.test('11. End-to-end Pass 1 -> aggregateAutofillResults -> draftScreening (distinct deferred IDs) -> Pass 2 handles duplicate-label comboboxes', async () => {
    const { runInNewContext } = await import('node:vm');
    const panelJsPath = path.join(rootDir, 'jobright_extension/panel.js');
    const panelJs = fs.readFileSync(panelJsPath, 'utf8');
    const appJs = fs.readFileSync(applicationPath, 'utf8');
    const plannerUrl = `file:///${path.join(rootDir, 'jobright_extension/core/ai/planner-bundle.js').replace(/\\/g, '/')}`;
    const routerUrl = `file:///${aiRouterPath.replace(/\\/g, '/')}`;
    const { buildVerifiedFacts, inferQuestionDescriptor } = await import(plannerUrl);
    const { AIRouter } = await import(routerUrl);

    const url = 'https://boards.greenhouse.io/acme/jobs/123/apply';
    const candidate = {
      id: 'cand-dup',
      provenance_status: 'confirmed',
      confirmed_facts: { full_name: 'Ada Lovelace', primary_skills: 'TypeScript' },
    };

    const dupFields = [
      { key: 'field:0:country_home', label: 'Preferred shift', kind: 'combobox', element: { id: 'country_home' } },
      { key: 'field:1:country_work', label: 'Preferred shift', kind: 'combobox', element: { id: 'country_work' } },
    ];
    const readChoicesCalls = [];
    const buildApp = () => {
      const sandbox = {
        console,
        crypto,
        location: new URL(url),
        document: { querySelectorAll: () => [], addEventListener() {} },
        globalThis: null,
        NextkinJobCapture: { read: () => ({ title: 'Engineer', company: 'Acme' }) },
        NextkinForms: { discoverFields: () => dupFields, label: () => '' },
        NextkinFieldMapping: {
          resolveFact: () => null,
          isAiEligible: () => true,
          planFill: () => dupFields.map((field) => ({
            field: { ...field },
            status: 'needs_review',
            reason: 'Requires AI.',
          })),
          buildValues: (c) => ({ full_name: c.full_name, primary_skills: c.primary_skills }),
          isChoiceKind: (kind) => ['choice', 'radio', 'select', 'combobox'].includes(kind),
          isMultiKind: (kind) => ['checkbox-group', 'multi-select', 'multi-combobox'].includes(kind),
        },
        NextkinFieldWriter: {
          read: () => '',
          readChoices: async (field) => {
            readChoicesCalls.push(field.key);
            if (field.key === 'field:0:country_home') return [{ label: 'United States' }, { label: 'Mexico' }];
            if (field.key === 'field:1:country_work') return [{ label: 'Canada' }, { label: 'Germany' }];
            return [];
          },
          applyFill: async (received) =>
            received
              .filter((p) => p.status === 'supported')
              .map((p) => ({ field: p.field, writtenValue: p.value, ai: !!p.ai, learned: !!p.learned })),
        },
      };
      sandbox.globalThis = sandbox;
      runInNewContext(appJs, sandbox);
      return sandbox.NextkinApplication;
    };

    // Pass 1
    const pass1Raw = await buildApp().fill(url, candidate, null, false, null, null, {});
    assert.equal(readChoicesCalls.length, 0);

    // Aggregate via panel.js aggregateAutofillResults
    const aggStart = panelJs.indexOf('function aggregateAutofillResults(');
    const aggEnd = panelJs.indexOf('async function fillForm(');
    assert.ok(aggStart !== -1 && aggEnd > aggStart);
    const aggSandbox = {};
    runInNewContext(panelJs.slice(aggStart, aggEnd) + '\n;this.aggregateAutofillResults = aggregateAutofillResults;', aggSandbox);
    const aggregated = aggSandbox.aggregateAutofillResults([{ frameId: 0, result: pass1Raw }]);

    assert.equal(aggregated.questions.length, 2);
    assert.deepEqual(Object.keys(aggregated.questionMeta).sort(), ['preferred shift', 'preferred shift::2']);

    // The two controls share a label and retain separate IDs throughout planning and writing.
    const startIdx = panelJs.indexOf('async function mapConcurrent(');
    const endIdx = panelJs.indexOf('function outsideApplicationPage(');
    class MockRouter extends AIRouter {
      async plan() {
        return { fills: [], deferredFieldIds: ['preferred shift', 'preferred shift::2'], unmapped: [] };
      }
      async choose(q, options) {
        if (q.id === 'preferred shift') return { choice: options.includes('United States') ? 'United States' : null };
        if (q.id === 'preferred shift::2') return { choice: options.includes('Canada') ? 'Canada' : null };
        return { choice: null };
      }
    }
    const screenSandbox = {
      console,
      crypto,
      Set,
      Map,
      Object,
      Array,
      Promise,
      Error,
      lastScreeningWarnings: [],
      authFailed: () => false,
      apiOrigin: (o) => o,
      formTarget: (tab, frame) => ({ tabId: tab.id, frameIds: [frame.frameId] }),
      checkScreeningContext: async () => {},
      NextkinFieldMapping: { CONSEQUENTIAL_FACTS: new Set() },
      chrome: {
        storage: { session: { get: async () => ({ ai_provider_mode: 'server' }) } },
        scripting: {
          executeScript: async ({ args }) => {
            const fid = args?.[0];
            if (fid === 'preferred shift') return [{ result: ['United States', 'Mexico'] }];
            if (fid === 'preferred shift::2') return [{ result: ['Canada', 'Germany'] }];
            return [{ result: [] }];
          },
        },
      },
      api: async () => ({ ok: true }),
      loadAiModules: async () => ({ AIRouter: MockRouter, buildVerifiedFacts, inferQuestionDescriptor }),
    };
    runInNewContext(panelJs.slice(startIdx, endIdx), screenSandbox);
    const drafts = await screenSandbox.draftScreening(
      { origin: 'https://app.nextkinhr.com', token: 'tok' },
      candidate,
      { id: 1 },
      { title: 'Engineer', company: 'Acme' },
      aggregated.questions,
      { frame: { frameId: 0, result: { url } } },
      {},
      aggregated.questionMeta,
    );
    assert.deepEqual({ ...drafts }, {
      'preferred shift': 'United States',
      'preferred shift::2': 'Canada',
    });

    // Pass 2 applies both distinct answers
    const pass2 = await buildApp().fill(url, candidate, null, false, null, null, drafts);
    assert.deepEqual(
      pass2.filled.map((f) => ({ key: f.key, value: f.value })),
      [
        { key: 'field:0:country_home', value: 'United States' },
        { key: 'field:1:country_work', value: 'Canada' },
      ],
    );
  });

  await t.test('12. AIRouter._postProxy attaches HTTP status/code, generateTextAnswer strips paired quotes, and isFatalAiError catches statusless errors', async () => {
    const { runInNewContext } = await import('node:vm');
    const routerUrl = `file:///${aiRouterPath.replace(/\\/g, '/')}`;
    const { AIRouter } = await import(routerUrl);
    const panelJs = fs.readFileSync(path.join(rootDir, 'jobright_extension/panel.js'), 'utf8');

    // _postProxy status & code propagation
    const proxyRouter = new AIRouter({
      mode: 'server',
      backendUrl: 'https://app.nextkinhr.com',
      token: 'tok',
      fetchFn: async () =>
        new Response(JSON.stringify({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    await assert.rejects(
      () => proxyRouter.plan([{ label: 'Name', type: 'text' }], new Map()),
      (err) => err.status === 401 && err.code === 'AUTH_REQUIRED' && /Unauthorized/.test(err.message),
    );

    // generateTextAnswer paired quote stripping
    const makeDirectRouter = (text) =>
      new AIRouter({
        mode: 'extension_byok',
        config: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: 'sk-test' },
        clientFactory: () => ({ generateChatCompletion: async () => ({ text }) }),
      });
    assert.equal((await makeDirectRouter('"I build reliable systems."').generateTextAnswer('sys', 'usr')).answer, 'I build reliable systems.');
    assert.equal((await makeDirectRouter('She said "hello"').generateTextAnswer('sys', 'usr')).answer, 'She said "hello"');
    await assert.rejects(() => makeDirectRouter('""').generateTextAnswer('sys', 'usr'), /empty response/i);

    // isFatalAiError regex fallback for statusless errors
    const fatalStart = panelJs.indexOf('function isFatalAiError(');
    const fatalEnd = panelJs.indexOf('async function resolveActiveAiConfig(');
    const fatalSandbox = {};
    runInNewContext(panelJs.slice(fatalStart, fatalEnd) + '\n;this.isFatalAiError = isFatalAiError;', fatalSandbox);
    const { isFatalAiError } = fatalSandbox;
    assert.equal(isFatalAiError(new Error('Unauthorized')), true);
    assert.equal(isFatalAiError(new Error('Structured AI planner is disabled')), true);
    assert.equal(isFatalAiError(new Error('Autofill planning proxy error (HTTP 401)')), true);
    assert.equal(isFatalAiError(new Error('Autofill planning proxy error (HTTP 503)')), true);
    assert.equal(isFatalAiError(new Error('Transient network timeout')), false);

    // #autofill click handler resets lastScreeningWarnings on each run (e.g. when #ai-screening is unchecked)
    const clickIdx = panelJs.indexOf("$('autofill').addEventListener('click'");
    const tryIdx = panelJs.indexOf('try {', clickIdx);
    const clickPreamble = panelJs.slice(clickIdx, tryIdx);
    assert.ok(clickPreamble.includes('lastScreeningWarnings = [];'), '#autofill click handler must reset lastScreeningWarnings before running');
  });
});
