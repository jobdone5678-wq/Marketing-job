import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  executePlan as planOnServer,
  executeChoose as chooseOnServer,
  checkFeatureFlag,
  isVercelAiSdkEnabled,
  resolveProviderClient as resolveOnServer,
  OrchestratorError,
} from '../../src/lib/ai/autofill-orchestrator.ts';
import { encryptSecret } from '../../src/lib/ai/encryption.ts';
import { APPROVED_DEFAULT_HOSTS, SafeHttpsAgent } from '../../src/lib/ai/ssrf-guard.ts';
import { ProviderClient } from '../../src/lib/ai/provider-client.ts';
import { ServerVercelProviderClient } from '../../src/lib/ai/server-provider-client.ts';
import { findReusableAnswer } from '../../src/lib/ai/reusable-answers.ts';

const ENCRYPTION_KEY_HEX = crypto.randomBytes(32).toString('hex');
const USER_OWNER = '11111111-1111-4000-8000-111111111111';
const USER_OTHER = '22222222-2222-4000-8000-222222222222';
const CANDIDATE_OWNED = 'aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa';
const CANDIDATE_OTHER = 'bbbbbbbb-bbbb-4000-8000-bbbbbbbbbbbb';
const dnsLookup = async () => [{ address: '8.8.8.8', family: 4 }];
const executePlan = (request, actor, options) => planOnServer(request, actor, { dnsLookup, ...options });
const executeChoose = (request, actor, options) => chooseOnServer(request, actor, { dnsLookup, ...options });
const resolveProviderClient = (actor, options) => resolveOnServer(actor, { dnsLookup, ...options });

function loadRouteModule(relPath, dependencies) {
  const fileUrl = new URL(`../../${relPath}.ts`, import.meta.url);
  const source = readFileSync(fileUrl, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(transpiled, {
    exports,
    Response,
    Request,
    URL,
    console,
    Buffer,
    require: (name) => dependencies[name],
  });
  return exports;
}

test('autofill orchestrator: server-enforced endpoints, feature flag, ownership & BYOK routing', async (t) => {
  const originalEnv = { ...process.env };

  t.beforeEach(() => {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = ENCRYPTION_KEY_HEX;
    process.env.SERVER_ENABLE_STRUCTURED_AI_PLANNER = 'true';
    process.env.OPENAI_API_KEY = 'sk-server-default-key-12345';
    process.env.AI_PROVIDER_DEFAULT_MODEL = 'gpt-4o-mini';
  });

  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Mock DB store
  function createMockDb(userConfigs = {}, userSecrets = {}, candidates = {}, screening = {}, answers = [], atoms = [], demographicPrefs = {}) {
    return {
      from(table) {
        const filters = {};
        const query = {
          select: () => query,
          eq: (col, val) => {
            filters[col] = val;
            return query;
          },
          maybeSingle: async () => {
            if (table === 'candidates') {
              const c = candidates[filters.id];
              if (c && (!filters.user_id || c.user_id === filters.user_id)) {
                return { data: { provenance_status: 'confirmed', ...c }, error: null };
              }
              return { data: null, error: null };
            }
            if (table === 'user_ai_provider_configs') {
              const conf = userConfigs[filters.user_id];
              return { data: conf || null, error: null };
            }
            if (table === 'user_ai_provider_secrets') {
              const sec = userSecrets[filters.user_id];
              return { data: sec || null, error: null };
            }
            if (table === 'screening_answers') {
              return { data: screening[filters.user_id] ?? null, error: null };
            }
            if (table === 'demographic_preferences') {
              return { data: demographicPrefs[filters.user_id] ?? null, error: null };
            }
            return { data: null, error: null };
          },
          single: async () => query.maybeSingle(),
          order: () => query,
          then: (resolve) => resolve({
            data: table === 'screening_answer_bank'
              ? answers.filter((entry) => entry.user_id === filters.user_id && entry.provenance === filters.provenance)
              : table === 'experience_atoms' ? atoms.filter((atom) => atom.user_id === filters.user_id) : [],
            error: null,
          }),
        };
        return query;
      },
    };
  }

  await t.test('uses only caller-owned confirmed answers for native and custom choices', async () => {
    const question = 'Which tools do you use for project management?';
    const db = createMockDb(
      {}, {}, { [CANDIDATE_OWNED]: { user_id: USER_OWNER, full_name: 'Candidate' } },
      { [USER_OWNER]: {
        age_18_or_older: false, notice_period_days: 14, authorized_countries: ['ca'],
        desired_salary_amount: 90000, desired_salary_currency: 'USD', desired_salary_period: 'year',
        privacy_consent: true,
      } },
      [
        { user_id: USER_OWNER, question, answer: 'Jira', provenance: 'candidate' },
        { user_id: USER_OWNER, question, answer: 'Trello', provenance: 'agent_inferred' },
        { user_id: USER_OTHER, question, answer: 'Asana', provenance: 'candidate' },
        { user_id: USER_OWNER, question: 'How did you find out about this opening?', answer: 'Company website', provenance: 'candidate' },
      ],
      [
        { id: 'verified', user_id: USER_OWNER, claim: 'Built web apps in React.', skills: ['react'], provenance: 'manual' },
        { id: 'draft', user_id: USER_OWNER, claim: 'Uses Svelte.', skills: ['svelte'], provenance: 'agent_inferred' },
      ],
    );
    const fetchFn = async () => assert.fail('Confirmed choices should not require a model call');
    const result = await executePlan({
      candidateId: CANDIDATE_OWNED,
      fields: [
        { id: 'age', label: 'Are you 18 years or older?', options: ['Yes', 'No'] },
        { id: 'notice', label: 'What is your notice period?', options: ['2 weeks', '1 week'] },
        { id: 'tools', label: question, options: ['Asana', 'Trello', 'Jira'] },
        { id: 'auth', label: 'Are you legally authorized to work in Canada?', options: ['Yes', 'No'] },
        { id: 'salary', label: 'What are your annual salary expectations?', options: ['EUR 90,000 per year', 'USD 90,000 per year', 'USD 90,000 per month'] },
        { id: 'referral', label: 'How did you hear about us?', options: ['Company website', 'Referral'] },
        { id: 'experience', label: 'Do you have experience with React?', options: ['Yes', 'No'] },
        { id: 'consent', label: 'Do you consent to the privacy policy?', options: ['Yes', 'No'] },
      ],
      answerBank: { [question]: 'Asana' },
    }, USER_OWNER, { db, fetchFn });
    assert.deepEqual(result.executableFills.map(({ fieldId, value }) => [fieldId, value]),
      [
        ['age', 'No'], ['notice', '2 weeks'], ['tools', 'Jira'], ['auth', 'Yes'],
        ['salary', 'USD 90,000 per year'], ['referral', 'Company website'], ['experience', 'Yes'],
      ]);
    const chosen = await executeChoose({
      candidateId: CANDIDATE_OWNED,
      question: { label: question, combo: true },
      options: ['Asana', 'Trello', 'Jira'],
    }, USER_OWNER, { db, fetchFn });
    assert.equal(chosen.choice, 'Jira');
  });

  await t.test('uses scoped Answer Bank topics before provider settings and preserves typed precedence', async () => {
    const rows = [
      ['relocation', 'Are you willing to relocate?', 'Yes'],
      ['start_date', 'When can you start?', '2027-02-01'],
      ['age_18_or_older', 'Are you at least 18?', 'Yes'],
      ['salary_expectation', 'What is your monthly salary expectation in EUR?', 'EUR 5000'],
    ].map(([topic, question, answer]) => ({ topic, question, answer, user_id: USER_OWNER, provenance: 'candidate' }));
    for (const question of [
      'Are you willing to relocate to Germany?',
      'Are you over the age of 18?',
      'What is your current monthly salary in EUR?',
      'What is your annual salary expectation in USD?',
    ]) {
      assert.equal(findReusableAnswer(question, rows), undefined, question);
    }
    const db = createMockDb({}, {}, { [CANDIDATE_OWNED]: { user_id: USER_OWNER } },
      { [USER_OWNER]: { notice_period_days: 30 } }, rows);
    const from = db.from;
    db.from = (table) => {
      assert.notEqual(table, 'user_ai_provider_configs');
      return from(table);
    };
    const result = await executePlan({ candidateId: CANDIDATE_OWNED, fields: [
      { id: 'relocation', label: 'Would you be open to relocation for this position?', options: ['No', 'Yes'] },
      { id: 'start', label: 'What is your earliest start date?', type: 'text' },
      { id: 'age', label: 'Are you 18 years or older?', options: ['No', 'Yes'] },
      { id: 'salary', label: 'What are your expected monthly compensation expectations in EUR?', options: ['EUR 3000', 'EUR 5000'] },
    ] }, USER_OWNER, { db });
    assert.deepEqual(result.executableFills.map(({ value }) => value), ['Yes', '2027-02-01', 'Yes', 'EUR 5000']);
    const choice = await executeChoose({ candidateId: CANDIDATE_OWNED,
      question: { label: 'Would you be open to relocation for this position?' }, options: ['Yes', 'No'],
    }, USER_OWNER, { db });
    assert.equal(choice.choice, 'Yes');
    const typed = createMockDb({}, {}, { [CANDIDATE_OWNED]: { user_id: USER_OWNER } },
      { [USER_OWNER]: { age_18_or_older: false } }, rows);
    const age = await executeChoose({ candidateId: CANDIDATE_OWNED,
      question: { label: 'Are you 18 years or older?' }, options: ['Yes', 'No'],
    }, USER_OWNER, { db: typed, fetchFn: async () => assert.fail('Expected the typed age answer') });
    assert.equal(age.choice, 'No');
  });

  await t.test('uses the optional fast provider for server Choose and falls back on a malformed answer', async () => {
    process.env.TYPESAFE_API_KEY = 'test-jev-key';
    const candidates = { [CANDIDATE_OWNED]: { user_id: USER_OWNER, country: 'Canada', email: 'private@example.com' } };
    const db = createMockDb({}, {}, candidates);
    const input = { candidateId: CANDIDATE_OWNED, question: { label: 'Country' }, options: ['Canada', 'Germany'] };
    const calls = [];
    let choice = 'option_0';
    const fetchFn = async (url, init) => {
      calls.push(String(url));
      if (String(url).includes('typesafe.ai')) {
        const payload = JSON.parse(init.body);
        assert.deepEqual(payload.state.confirmed_facts, { 'profile.location.country': 'Canada' });
        assert.deepEqual(Object.values(payload.questions.selection.criteria).slice(0, 2), input.options);
        return Response.json({ answers: { selection: { type: 'choice', choice } } });
      }
      return Response.json({ choices: [{ message: { content: '{"choice":"Canada"}' } }] });
    };
    assert.equal((await executeChoose(input, USER_OWNER, { db, fetchFn })).choice, 'Canada');
    choice = 'no_supported_option';
    assert.equal((await executeChoose(input, USER_OWNER, { db, fetchFn })).choice, null);
    choice = 'option_1';
    assert.equal((await executeChoose(input, USER_OWNER, { db, fetchFn })).choice, null);
    assert.deepEqual(calls, Array(3).fill('https://api.typesafe.ai/v1/systemone'));
    choice = 'unknown';
    assert.equal((await executeChoose(input, USER_OWNER, { db, fetchFn })).choice, 'Canada');
    assert.match(calls.at(-1), /chat\/completions$/);
    const portal = createMockDb({ [USER_OWNER]: { mode: 'portal_byok' } }, {}, candidates);
    calls.length = 0;
    await assert.rejects(() => executeChoose(input, USER_OWNER, { db: portal, fetchFn }), { status: 401 });
    assert.deepEqual(calls, []);
  });

  await t.test('1. server checks feature flag SERVER_ENABLE_STRUCTURED_AI_PLANNER (defaults to true; can be disabled)', async () => {
    // Enabled by default (undefined or 'true')
    delete process.env.SERVER_ENABLE_STRUCTURED_AI_PLANNER;
    assert.doesNotThrow(() => checkFeatureFlag());

    process.env.SERVER_ENABLE_STRUCTURED_AI_PLANNER = 'true';
    assert.doesNotThrow(() => checkFeatureFlag());

    // When set to 'false'
    process.env.SERVER_ENABLE_STRUCTURED_AI_PLANNER = 'false';
    assert.throws(
      () => checkFeatureFlag(),
      (err) => err instanceof OrchestratorError && err.status === 403 && err.code === 'FEATURE_DISABLED'
    );

    // When set to '0'
    process.env.SERVER_ENABLE_STRUCTURED_AI_PLANNER = '0';
    assert.throws(
      () => checkFeatureFlag(),
      (err) => err instanceof OrchestratorError && err.status === 403
    );
  });

  await t.test('2. verifies candidate belongs to authenticated user (auth.uid() / actorId)', async () => {
    const candidates = {
      [CANDIDATE_OWNED]: { id: CANDIDATE_OWNED, user_id: USER_OWNER, full_name: 'Owned Candidate' },
      [CANDIDATE_OTHER]: { id: CANDIDATE_OTHER, user_id: USER_OTHER, full_name: 'Other Candidate' },
    };
    const db = createMockDb({}, {}, candidates);

    const planReq = {
      candidateId: CANDIDATE_OTHER, // Belongs to other user!
      fields: [{ label: 'First Name', type: 'text' }],
    };

    await assert.rejects(
      async () => executePlan(planReq, USER_OWNER, { db }),
      (err) => err instanceof OrchestratorError && (err.status === 404 || err.status === 403)
    );
  });

  await t.test('3. if user has portal BYOK key, decrypts key and routes to user remote endpoint via SSRF safe agent', async () => {
    const origin = 'https://openrouter.ai/api/v1';
    const rawApiKey = 'sk-or-v1-custom-user-key-abcdef';
    const encrypted = encryptSecret(rawApiKey, USER_OWNER, origin);

    const userConfigs = {
      [USER_OWNER]: {
        user_id: USER_OWNER,
        mode: 'portal',
        provider: 'openrouter',
        base_url: origin,
        model_id: 'meta-llama/llama-3-70b-instruct',
      },
    };

    const userSecrets = {
      [USER_OWNER]: {
        user_id: USER_OWNER,
        encrypted_api_key: encrypted.encrypted,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_origin: origin,
      },
    };

    const db = createMockDb(userConfigs, userSecrets);

    let capturedUrl = null;
    let capturedAuthHeader = null;

    const mockFetch = async (url, opts) => {
      capturedUrl = url;
      capturedAuthHeader = opts.headers?.Authorization;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ fills: [] }) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = await resolveProviderClient(USER_OWNER, { db, fetchFn: mockFetch });
    assert.equal(client.baseUrl, origin);
    assert.equal(client.apiKey, rawApiKey);
    assert.equal(client.model, 'meta-llama/llama-3-70b-instruct');
    assert.ok(client.agent, 'Safe agent must be attached');
  });

  await t.test('4. never silently switches to server key if BYOK key fails (returns HTTP 401)', async () => {
    const origin = 'https://api.openai.com/v1';
    // User has portal mode configured, but secret record is missing or corrupted
    const userConfigs = {
      [USER_OWNER]: {
        user_id: USER_OWNER,
        mode: 'portal',
        provider: 'openai',
        base_url: origin,
        model_id: 'gpt-4o',
      },
    };

    const dbWithoutSecret = createMockDb(userConfigs, {});

    await assert.rejects(
      async () => resolveProviderClient(USER_OWNER, { db: dbWithoutSecret }),
      (err) => {
        assert.ok(err instanceof OrchestratorError);
        assert.equal(err.status, 401);
        assert.equal(err.message, 'Custom provider authentication failed');
        return true;
      }
    );

    // Also test when remote endpoint returns 401 Unauthorized during plan execution
    const encrypted = encryptSecret('sk-expired-key', USER_OWNER, origin);
    const userSecrets = {
      [USER_OWNER]: {
        user_id: USER_OWNER,
        encrypted_api_key: encrypted.encrypted,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_origin: origin,
      },
    };

    const candidates = {
      [CANDIDATE_OWNED]: { id: CANDIDATE_OWNED, user_id: USER_OWNER, full_name: 'Test Candidate' },
    };
    const dbWithSecret = createMockDb(userConfigs, userSecrets, candidates);

    const mockFetch401 = async () => {
      return new Response(
        JSON.stringify({ error: { message: 'Incorrect API key provided' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const planReq = {
      candidateId: CANDIDATE_OWNED,
      fields: [{ label: 'Full Name', type: 'text' }],
    };

    await assert.rejects(
      async () => executePlan(planReq, USER_OWNER, { db: dbWithSecret, fetchFn: mockFetch401 }),
      (err) => {
        assert.ok(err instanceof OrchestratorError);
        assert.equal(err.status, 401);
        assert.equal(err.message, 'Custom provider authentication failed');
        return true;
      }
    );
  });

  await t.test('5. executePlan returns PlanApiResponse with verified fills and evidence IDs', async () => {
    const candidate = {
      id: CANDIDATE_OWNED,
      user_id: USER_OWNER,
      full_name: 'Grace Hopper',
      current_city: 'New York',
      current_state: 'NY',
      authorized_in_usa: true,
      need_sponsorship_future: false,
    };
    const candidates = { [CANDIDATE_OWNED]: candidate };
    const db = createMockDb({}, {}, candidates);

    const mockFetch = async (url, opts) => {
      const fills = [
        { label: 'Full Name', value: 'Grace Hopper' },
        { label: 'City', value: 'New York' },
      ];
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ fills }) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const planReq = {
      candidateId: CANDIDATE_OWNED,
      fields: [
        { label: 'Full Name', type: 'text' },
        { label: 'City', type: 'text' },
      ],
    };

    const response = await executePlan(planReq, USER_OWNER, { db, fetchFn: mockFetch });

    assert.equal(response.ok, true);
    assert.ok(Array.isArray(response.fills));
    assert.equal(response.fills.length, 2);

    const nameFill = response.fills.find((f) => f.label === 'Full Name');
    assert.ok(nameFill);
    assert.equal(nameFill.value, 'Grace Hopper');
    assert.ok(nameFill.evidenceIds.includes('profile.name'));

    const cityFill = response.fills.find((f) => f.label === 'City');
    assert.ok(cityFill);
    assert.equal(cityFill.value, 'New York');
    assert.ok(cityFill.evidenceIds.includes('profile.location.city'));
  });

  await t.test('6. executeChoose runs combobox choice against captured options with grounded validation', async () => {
    const candidate = {
      id: CANDIDATE_OWNED,
      user_id: USER_OWNER,
      full_name: 'Grace Hopper',
      need_sponsorship_future: false,
      authorized_in_usa: true,
    };
    const candidates = { [CANDIDATE_OWNED]: candidate };
    const db = createMockDb({}, {}, candidates);

    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ choice: 'No' }) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const chooseReq = {
      candidateId: CANDIDATE_OWNED,
      question: {
        label: 'Will you now or in the future require visa sponsorship?',
        canonical_name: 'needs_sponsorship',
      },
      options: ['Yes', 'No', 'Not sure'],
    };

    const response = await executeChoose(chooseReq, USER_OWNER, { db, fetchFn: mockFetch });

    assert.equal(response.ok, true);
    assert.equal(response.choice, 'No');
    assert.ok(response.evidenceIds.includes('profile.work_auth.need_sponsorship_future'));
  });

  await t.test('7. App Router routes: plan/route and choose/route handle HTTP POST and OPTIONS', async () => {
    const mockActor = { id: USER_OWNER, role: 'candidate', status: 'active' };
    const dependencies = {
      '@/lib/capture/server': {
        cors: (req, res) => res,
      },
      '@/lib/extension-answers/candidate-context': {
        extensionResumeActor: async () => mockActor,
      },
      '@/lib/rate-limit': {
        checkRateLimit: () => ({ allowed: true }),
      },
      '@/lib/ai/autofill-orchestrator': {
        executePlan: async (req, actorId) => ({
          ok: true,
          fills: [{ label: 'Full Name', value: 'Test', evidenceIds: ['profile.name'] }],
        }),
        executeChoose: async (req, actorId) => ({
          ok: true,
          choice: 'Option A',
          evidenceIds: ['profile.name'],
        }),
        OrchestratorError,
      },
    };

    const planRoute = loadRouteModule('src/app/api/extension/autofill/plan/route', dependencies);
    const chooseRoute = loadRouteModule('src/app/api/extension/autofill/choose/route', dependencies);

    // OPTIONS
    const optResPlan = await planRoute.OPTIONS(new Request('http://localhost/api/extension/autofill/plan', { method: 'OPTIONS' }));
    assert.equal(optResPlan.status, 204);

    const optResChoose = await chooseRoute.OPTIONS(new Request('http://localhost/api/extension/autofill/choose', { method: 'OPTIONS' }));
    assert.equal(optResChoose.status, 204);

    // POST plan
    const planReq = new Request('http://localhost/api/extension/autofill/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: CANDIDATE_OWNED, fields: [] }),
    });
    const planRes = await planRoute.POST(planReq);
    assert.equal(planRes.status, 200);
    const planData = await planRes.json();
    assert.equal(planData.ok, true);

    // POST choose
    const chooseReq = new Request('http://localhost/api/extension/autofill/choose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: CANDIDATE_OWNED, question: { label: 'Q' }, options: ['A'] }),
    });
    const chooseRes = await chooseRoute.POST(chooseReq);
    assert.equal(chooseRes.status, 200);
    const chooseData = await chooseRes.json();
    assert.equal(chooseData.ok, true);
    assert.equal(chooseData.choice, 'Option A');
  });

  await t.test('8. SERVER_ENABLE_VERCEL_AI_SDK is disabled by default, enables ServerVercelProviderClient when true/1, and rolls back when false', async () => {
    const db = createMockDb({}, {}, {});

    // Disabled by default (unset)
    delete process.env.SERVER_ENABLE_VERCEL_AI_SDK;
    assert.equal(isVercelAiSdkEnabled(), false);
    const defaultClient = await resolveProviderClient(USER_OWNER, { db });
    assert.equal(defaultClient.constructor.name, 'ProviderClient');
    assert.ok(defaultClient instanceof ProviderClient);
    assert.equal(defaultClient instanceof ServerVercelProviderClient, false);

    // Enabled with 'true'
    process.env.SERVER_ENABLE_VERCEL_AI_SDK = 'true';
    assert.equal(isVercelAiSdkEnabled(), true);
    const sdkClientTrue = await resolveProviderClient(USER_OWNER, { db });
    assert.equal(sdkClientTrue.constructor.name, 'ServerVercelProviderClient');
    assert.ok(sdkClientTrue instanceof ServerVercelProviderClient);
    assert.ok(sdkClientTrue.agent instanceof SafeHttpsAgent);

    // Enabled with '1'
    process.env.SERVER_ENABLE_VERCEL_AI_SDK = '1';
    assert.equal(isVercelAiSdkEnabled(), true);
    const sdkClientOne = await resolveProviderClient(USER_OWNER, { db });
    assert.ok(sdkClientOne instanceof ServerVercelProviderClient);

    // Clean rollback with 'false'
    process.env.SERVER_ENABLE_VERCEL_AI_SDK = 'false';
    assert.equal(isVercelAiSdkEnabled(), false);
    const rolledBackClient = await resolveProviderClient(USER_OWNER, { db });
    assert.equal(rolledBackClient.constructor.name, 'ProviderClient');
    assert.equal(rolledBackClient instanceof ServerVercelProviderClient, false);
  });

  await t.test('9. end-to-end executePlan & executeChoose with SERVER_ENABLE_VERCEL_AI_SDK="true" (BYOK, 401, SafeHttpsAgent binding, telemetry)', async () => {
    process.env.SERVER_ENABLE_VERCEL_AI_SDK = 'true';
    ServerVercelProviderClient.clearCache();

    const origin = 'https://openrouter.ai/api/v1';
    const rawApiKey = 'sk-or-v1-sdk-byok-key-999';
    const encrypted = encryptSecret(rawApiKey, USER_OWNER, origin);

    const userConfigs = {
      [USER_OWNER]: {
        user_id: USER_OWNER,
        mode: 'portal',
        provider: 'openrouter',
        base_url: origin,
        model_id: 'openai/gpt-4o-mini',
      },
    };
    const userSecrets = {
      [USER_OWNER]: {
        user_id: USER_OWNER,
        encrypted_api_key: encrypted.encrypted,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_origin: origin,
      },
    };
    const candidate = {
      id: CANDIDATE_OWNED,
      user_id: USER_OWNER,
      full_name: 'Ada Lovelace',
      current_city: 'London',
      authorized_in_usa: true,
      need_sponsorship_future: false,
    };
    const dbByok = createMockDb(userConfigs, userSecrets, { [CANDIDATE_OWNED]: candidate });

    // A) executePlan with BYOK, SafeHttpsAgent socket binding verification, executableFills, and telemetry
    let seenPlanAuth = null;
    let seenPlanAgent = null;
    let seenPlanResponseFormat = null;
    const mockPlanFetch = async (_url, init) => {
      seenPlanAuth = init.headers?.authorization || init.headers?.Authorization;
      seenPlanAgent = init.agent;
      const body = JSON.parse(init.body);
      seenPlanResponseFormat = body.response_format;
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-sdk-plan',
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  fills: [
                    {
                      label: 'Full Name',
                      fieldId: 'f_name',
                      value: 'Ada Lovelace',
                      action: 'fill',
                      evidenceIds: ['forged.evidence'],
                    },
                    {
                      label: 'City',
                      value: 'London',
                      action: 'fill',
                    },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 60, completion_tokens: 25, total_tokens: 85 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const planRes = await executePlan(
      {
        candidateId: CANDIDATE_OWNED,
        fields: [
          { id: 'f_name', label: 'Full Name', type: 'text' },
          { label: 'City', type: 'text' },
        ],
      },
      USER_OWNER,
      { db: dbByok, fetchFn: mockPlanFetch }
    );

    assert.equal(planRes.ok, true);
    assert.equal(seenPlanAuth, `Bearer ${rawApiKey}`);
    assert.ok(seenPlanAgent instanceof SafeHttpsAgent, 'SafeHttpsAgent instance must reach fetch adapter');
    assert.ok(seenPlanAgent.targetIp, 'SafeHttpsAgent must have resolved targetIp');
    assert.equal(seenPlanAgent.hostname, 'openrouter.ai');
    assert.equal(seenPlanResponseFormat, undefined);

    // Verify SafeHttpsAgent socket binding preserves targetIp + SNI hostname
    let boundNetOpts = null;
    let boundTlsOpts = null;
    const fakeRawSocket = { once() {}, on() {}, destroy() {} };
    const fakeTlsSocket = { once() {}, on() {}, destroy() {} };
    const testAgent = new SafeHttpsAgent(seenPlanAgent.targetIp, seenPlanAgent.hostname, 443, {
      netConnect: (opts) => {
        boundNetOpts = opts;
        return fakeRawSocket;
      },
      tlsConnect: (opts) => {
        boundTlsOpts = opts;
        return fakeTlsSocket;
      },
    });
    testAgent.createConnection({ host: 'evil.rebind.example' });
    assert.equal(boundNetOpts.host, seenPlanAgent.targetIp);
    assert.equal(boundNetOpts.port, 443);
    assert.equal(boundTlsOpts.servername, 'openrouter.ai');

    assert.equal(planRes.fills.length, 2);
    assert.equal(planRes.executableFills.length, 1);
    assert.equal(planRes.executableFills[0].fieldId, 'f_name');
    const nameFill = planRes.fills.find((f) => f.label === 'Full Name');
    assert.deepEqual(nameFill.evidenceIds, ['profile.name']);
    assert.equal(planRes.telemetry?.usage?.promptTokens, 60);
    assert.equal(planRes.telemetry?.usage?.completionTokens, 25);
    assert.equal(planRes.telemetry?.usage?.totalTokens, 85);
    assert.equal(typeof planRes.telemetry?.durationMs, 'number');

    // B) executeChoose end-to-end with telemetry
    ServerVercelProviderClient.clearCache();
    let seenChooseAgent = null;
    const mockChooseFetch = async (_url, init) => {
      seenChooseAgent = init.agent;
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-sdk-choose',
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  choice: 'No',
                  evidenceIds: ['forged.choice.evidence'],
                  reason: 'Candidate does not need sponsorship',
                }),
              },
            },
          ],
          usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const chooseRes = await executeChoose(
      {
        candidateId: CANDIDATE_OWNED,
        question: { label: 'Will you now or in the future require visa sponsorship?' },
        options: ['Yes', 'No'],
      },
      USER_OWNER,
      { db: dbByok, fetchFn: mockChooseFetch }
    );

    assert.equal(chooseRes.ok, true);
    assert.equal(chooseRes.choice, 'No');
    assert.ok(seenChooseAgent instanceof SafeHttpsAgent);
    assert.ok(chooseRes.evidenceIds.includes('profile.work_auth.need_sponsorship_future'));
    assert.equal(chooseRes.telemetry?.usage?.promptTokens, 40);
    assert.equal(chooseRes.telemetry?.usage?.completionTokens, 10);
    assert.equal(chooseRes.telemetry?.usage?.totalTokens, 50);
    assert.equal(typeof chooseRes.telemetry?.durationMs, 'number');

    // C) BYOK 401 failure must not silently fall back
    ServerVercelProviderClient.clearCache();
    const mockFetch401 = async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(
      async () =>
        executePlan(
          { candidateId: CANDIDATE_OWNED, fields: [{ id: 'f_name', label: 'Full Name', type: 'text' }] },
          USER_OWNER,
          { db: dbByok, fetchFn: mockFetch401 }
        ),
      (err) => {
        assert.ok(err instanceof OrchestratorError);
        assert.equal(err.status, 401);
        assert.equal(err.code, 'AUTH_FAILED');
        assert.equal(err.message, 'Custom provider authentication failed');
        return true;
      }
    );
  });

  await t.test('10. resolveProviderClient allows custom non-whitelist public hosts in portal_byok and defaultBaseUrl while blocking private/loopback/metadata IPs', async () => {
    const mockDnsPublic = async () => [{ address: '93.184.216.34', family: 4 }];
    const mockDnsPrivate = async () => [{ address: '10.0.0.5', family: 4 }];

    // A) portal_byok with custom non-whitelist domain (mocked public DNS)
    const customOrigin = 'https://generativelanguage.googleapis.com/v1beta/openai';
    const rawApiKey = 'sk-custom-gemini-key-123';
    const encrypted = encryptSecret(rawApiKey, USER_OWNER, customOrigin);
    const dbCustomPortal = createMockDb(
      {
        [USER_OWNER]: {
          user_id: USER_OWNER,
          mode: 'portal_byok',
          provider: 'gemini',
          base_url: customOrigin,
          model_id: 'gemini-2.5-flash',
        },
      },
      {
        [USER_OWNER]: {
          user_id: USER_OWNER,
          encrypted_api_key: encrypted.encrypted,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          key_origin: customOrigin,
        },
      }
    );

    const customPortalClient = await resolveProviderClient(USER_OWNER, {
      db: dbCustomPortal,
      dnsLookup: mockDnsPublic,
    });
    assert.equal(customPortalClient.baseUrl, customOrigin);
    assert.equal(customPortalClient.apiKey, rawApiKey);
    assert.equal(customPortalClient.agent.targetIp, '93.184.216.34');

    // B) portal_byok with public IP literal
    const ipOrigin = 'https://93.184.216.34/v1';
    const encryptedIp = encryptSecret(rawApiKey, USER_OWNER, ipOrigin);
    const dbIpPortal = createMockDb(
      {
        [USER_OWNER]: {
          user_id: USER_OWNER,
          mode: 'portal_byok',
          provider: 'custom',
          base_url: ipOrigin,
          model_id: 'custom-model',
        },
      },
      {
        [USER_OWNER]: {
          user_id: USER_OWNER,
          encrypted_api_key: encryptedIp.encrypted,
          iv: encryptedIp.iv,
          auth_tag: encryptedIp.authTag,
          key_origin: ipOrigin,
        },
      }
    );
    const ipPortalClient = await resolveProviderClient(USER_OWNER, { db: dbIpPortal });
    assert.equal(ipPortalClient.baseUrl, ipOrigin);

    // C) defaultBaseUrl with custom non-whitelist domain (mocked public DNS) and public IP literal
    process.env.AI_PROVIDER_DEFAULT_BASE_URL = 'https://custom-gateway.example.com/v1';
    const defaultCustomClient = await resolveProviderClient(USER_OWNER, {
      db: createMockDb({}, {}),
      dnsLookup: mockDnsPublic,
    });
    assert.equal(defaultCustomClient.baseUrl, 'https://custom-gateway.example.com/v1');
    assert.equal(defaultCustomClient.agent.targetIp, '93.184.216.34');

    process.env.AI_PROVIDER_DEFAULT_BASE_URL = 'https://93.184.216.34/v1';
    const defaultIpClient = await resolveProviderClient(USER_OWNER, {
      db: createMockDb({}, {}),
    });
    assert.equal(defaultIpClient.baseUrl, 'https://93.184.216.34/v1');

    // D) Blocked loopback, private, metadata hosts/IPs are still rejected in both paths
    for (const blockedUrl of [
      'http://127.0.0.1:8080/v1',
      'http://localhost:8080/v1',
      'http://10.0.0.1/v1',
      'http://169.254.169.254/latest/meta-data/',
    ]) {
      const encBlocked = encryptSecret(rawApiKey, USER_OWNER, blockedUrl);
      const dbBlockedPortal = createMockDb(
        {
          [USER_OWNER]: {
            user_id: USER_OWNER,
            mode: 'portal_byok',
            provider: 'custom',
            base_url: blockedUrl,
            model_id: 'm',
          },
        },
        {
          [USER_OWNER]: {
            user_id: USER_OWNER,
            encrypted_api_key: encBlocked.encrypted,
            iv: encBlocked.iv,
            auth_tag: encBlocked.authTag,
            key_origin: blockedUrl,
          },
        }
      );

      await assert.rejects(
        async () => resolveProviderClient(USER_OWNER, { db: dbBlockedPortal }),
        (err) => err instanceof OrchestratorError && err.status === 400 && err.code === 'SSRF_BLOCKED'
      );

      process.env.AI_PROVIDER_DEFAULT_BASE_URL = blockedUrl;
      await assert.rejects(
        async () => resolveProviderClient(USER_OWNER, { db: createMockDb({}, {}) }),
        (err) => err instanceof OrchestratorError && err.status === 500 && err.code === 'SSRF_BLOCKED'
      );
    }

    // E) DNS resolving to private IP is also rejected
    process.env.AI_PROVIDER_DEFAULT_BASE_URL = 'https://rebind.example.com/v1';
    await assert.rejects(
      async () =>
        resolveProviderClient(USER_OWNER, {
          db: createMockDb({}, {}),
          dnsLookup: mockDnsPrivate,
        }),
      (err) => err instanceof OrchestratorError && err.status === 500 && err.code === 'SSRF_BLOCKED'
    );
  });

  await t.test('11. executePlan & executeChoose allow demographic fields with actor-scoped preferences while still blocking PII/consent/marketing', async () => {
    const candidates = {
      [CANDIDATE_OWNED]: { id: CANDIDATE_OWNED, user_id: USER_OWNER, full_name: 'Jordan Lee' },
    };
    const demographicPrefs = {
      [USER_OWNER]: {
        enabled: true,
        answers: {
          raceEthnicity: ['Asian'],
          veteran: ['No'],
        },
      },
      [USER_OTHER]: {
        enabled: true,
        answers: {
          raceEthnicity: ['White'],
          gender: ['Female'],
        },
      },
    };
    const db = createMockDb({}, {}, candidates, {}, [], [], demographicPrefs);

    let seenPlanPayload = null;
    const planFetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      seenPlanPayload = JSON.parse(body.messages[1].content);
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ fills: [] }) } }],
      });
    };

    const planRes = await executePlan(
      {
        candidateId: CANDIDATE_OWNED,
        fields: [
          { id: 'race', label: 'Race', options: ['Asian', 'White'] },
          {
            id: 'communities',
            label: 'Which of the following communities do you belong to?',
            options: ['Person with disability', 'Veteran', 'I prefer not to answer'],
          },
          { id: 'dob', label: 'Date of birth', type: 'text' },
          { id: 'privacy', label: 'I agree to the privacy policy', type: 'checkbox' },
          { id: 'future', label: 'Contact me about future job opportunities', type: 'checkbox' },
        ],
      },
      USER_OWNER,
      { db, fetchFn: planFetch },
    );
    assert.equal(planRes.ok, true);
    assert.deepEqual(
      seenPlanPayload.fields.map((f) => f.label),
      ['Race', 'Which of the following communities do you belong to?'],
      'Demographic fields must pass through to Phase B while DOB/privacy/marketing are blocked',
    );
    assert.deepEqual(seenPlanPayload.profile['demographics.raceEthnicity'], ['Asian']);
    assert.deepEqual(seenPlanPayload.profile['demographics.veteran'], ['No']);
    assert.equal(seenPlanPayload.profile['demographics.gender'], undefined, 'Must not leak other user demographics');

    // executeChoose accepts demographic questions without returning 422 and loads actor-scoped demographics
    let seenChoosePayload = null;
    const chooseFetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      seenChoosePayload = JSON.parse(body.messages[1].content);
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ choice: 'Asian' }) } }],
      });
    };

    const chooseRes = await executeChoose(
      {
        candidateId: CANDIDATE_OWNED,
        question: { id: 'race', label: 'Race', combo: true },
        options: ['Asian', 'White'],
        context: { url: 'https://boards.greenhouse.io/acme/jobs/123' },
      },
      USER_OWNER,
      { db, fetchFn: chooseFetch },
    );
    assert.equal(chooseRes.ok, true);
    assert.deepEqual(seenChoosePayload.profile['demographics.raceEthnicity'], ['Asian']);
    assert.equal(seenChoosePayload.profile['demographics.gender'], undefined);

    // executeChoose accepts Communities question without returning 422
    const communitiesRes = await executeChoose(
      {
        candidateId: CANDIDATE_OWNED,
        question: { id: 'communities', label: 'Which of the following communities do you belong to?', combo: true },
        options: ['Person with disability', 'Veteran', 'I prefer not to answer'],
      },
      USER_OWNER,
      {
        db,
        fetchFn: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ choice: '' }) } }] }),
      },
    );
    assert.equal(communitiesRes.ok, true);

    // executeChoose still rejects blocked PII/consent/marketing questions with 422
    for (const blockedLabel of [
      'Date of birth',
      'I agree to the privacy policy',
      'Contact me about future job opportunities',
    ]) {
      await assert.rejects(
        () =>
          executeChoose(
            {
              candidateId: CANDIDATE_OWNED,
              question: { label: blockedLabel },
              options: ['Yes', 'No'],
            },
            USER_OWNER,
            { db, fetchFn: chooseFetch },
          ),
        (err) => err instanceof OrchestratorError && err.status === 422,
        `Expected 422 for blocked field: ${blockedLabel}`,
      );
    }

    // Disabled demographic preferences emit zero demographics.* facts
    const disabledDb = createMockDb({}, {}, candidates, {}, [], [], {
      [USER_OWNER]: { enabled: false, answers: { raceEthnicity: ['Asian'] } },
    });
    await executeChoose(
      {
        candidateId: CANDIDATE_OWNED,
        question: { id: 'race', label: 'Race', combo: true },
        options: ['Asian', 'White'],
      },
      USER_OWNER,
      { db: disabledDb, fetchFn: chooseFetch },
    );
    assert.equal(seenChoosePayload.profile['demographics.raceEthnicity'], undefined);

    // Mock DB lacking demographic_preferences table degrades gracefully to disabled
    const legacyMockDb = {
      from(table) {
        if (table === 'demographic_preferences') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { code: '42P01', message: 'relation "public.demographic_preferences" does not exist' },
                }),
              }),
            }),
          };
        }
        return db.from(table);
      },
    };
    const legacyRes = await executePlan(
      {
        candidateId: CANDIDATE_OWNED,
        fields: [{ id: 'race', label: 'Race', options: ['Asian', 'White'] }],
      },
      USER_OWNER,
      { db: legacyMockDb, fetchFn: planFetch },
    );
    assert.equal(legacyRes.ok, true);
    assert.equal(seenPlanPayload.profile['demographics.raceEthnicity'], undefined);

    // Unexpected DB/permission/timeout errors mentioning demographic_preferences must NOT degrade silently
    const failingMockDb = {
      from(table) {
        if (table === 'demographic_preferences') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { code: '42501', message: 'permission denied for table demographic_preferences' },
                }),
              }),
            }),
          };
        }
        return db.from(table);
      },
    };
    await assert.rejects(
      () =>
        executePlan(
          {
            candidateId: CANDIDATE_OWNED,
            fields: [{ id: 'race', label: 'Race', options: ['Asian', 'White'] }],
          },
          USER_OWNER,
          { db: failingMockDb, fetchFn: planFetch },
        ),
      (err) => err?.code === '42501' && /permission denied for table demographic_preferences/.test(String(err?.message)),
    );

    // Upstream 429 rate-limit retries cleanly and maps exhausted 429s to UPSTREAM_RATE_LIMITED
    let retryAttempt = 0;
    const retryPlanFetch = async () => {
      retryAttempt += 1;
      if (retryAttempt === 1) {
        return Response.json({ error: { message: 'Rate limit exceeded' } }, { status: 429 });
      }
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                fills: [{ fieldId: 'race', label: 'Race', value: 'Asian' }],
              }),
            },
          },
        ],
      });
    };
    const recoveredPlan = await executePlan(
      {
        candidateId: CANDIDATE_OWNED,
        fields: [{ id: 'race', label: 'Race', options: ['Asian', 'White'] }],
      },
      USER_OWNER,
      { db, fetchFn: retryPlanFetch, rateLimitRetryDelaysMs: [0] },
    );
    assert.equal(retryAttempt, 2);
    assert.equal(recoveredPlan.executableFills?.[0]?.value, 'Asian');

    const always429Fetch = async () =>
      Response.json({ error: { message: 'Rate limit exceeded' } }, { status: 429 });
    await assert.rejects(
      () =>
        executePlan(
          {
            candidateId: CANDIDATE_OWNED,
            fields: [{ id: 'race', label: 'Race', options: ['Asian', 'White'] }],
          },
          USER_OWNER,
          { db, fetchFn: always429Fetch, rateLimitRetryDelaysMs: [0] },
        ),
      (err) => err instanceof OrchestratorError && err.status === 429 && err.code === 'UPSTREAM_RATE_LIMITED',
    );
    await assert.rejects(
      () =>
        executeChoose(
          {
            candidateId: CANDIDATE_OWNED,
            question: { id: 'race', label: 'Race', combo: true },
            options: ['Asian', 'White'],
          },
          USER_OWNER,
          { db, fetchFn: always429Fetch, rateLimitRetryDelaysMs: [0] },
        ),
      (err) => err instanceof OrchestratorError && err.status === 429 && err.code === 'UPSTREAM_RATE_LIMITED',
    );
  });
});
