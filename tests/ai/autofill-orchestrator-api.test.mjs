import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  executePlan,
  executeChoose,
  checkFeatureFlag,
  resolveProviderClient,
  OrchestratorError,
} from '../../src/lib/ai/autofill-orchestrator.ts';
import { encryptSecret } from '../../src/lib/ai/encryption.ts';
import { APPROVED_DEFAULT_HOSTS } from '../../src/lib/ai/ssrf-guard.ts';

const ENCRYPTION_KEY_HEX = crypto.randomBytes(32).toString('hex');
const USER_OWNER = '11111111-1111-4000-8000-111111111111';
const USER_OTHER = '22222222-2222-4000-8000-222222222222';
const CANDIDATE_OWNED = 'aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa';
const CANDIDATE_OTHER = 'bbbbbbbb-bbbb-4000-8000-bbbbbbbbbbbb';

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
  function createMockDb(userConfigs = {}, userSecrets = {}, candidates = {}) {
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
                return { data: c, error: null };
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
            return { data: null, error: null };
          },
          single: async () => query.maybeSingle(),
        };
        return query;
      },
    };
  }

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
});
