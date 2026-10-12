import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { moduleLoader, fixtureDatabase } from './helpers/load-ts-module.mjs';

const owner = '10000000-0000-4000-8000-000000000001';
const ownId = '10000000-0000-4000-8000-000000000002';
const otherId = '10000000-0000-4000-8000-000000000003';
const token = 'a'.repeat(43);
class CaptureError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function setup({ role = 'client', candidates, jobs = [], revoked = false } = {}) {
  const profile = { id: owner, role, status: 'active' };
  const tables = {
    candidates: candidates || [
      { id: ownId, user_id: owner, assigned_recruiter_id:role==='recruiter'?owner:null, full_name: 'Own profile', provenance_status: 'confirmed', primary_skills: 'Python, SQL' },
      { id: otherId, user_id: 'another-owner', full_name: 'Other profile', provenance_status: 'confirmed', primary_skills: 'Java' },
    ],
    jobs,
    profiles: [profile],
    extension_credentials: [{ owner_id: owner, token_hash: createHash('sha256').update(token).digest('hex'), expires_at: '2099-01-01', revoked_at: revoked ? '2026-01-01' : null }],
  };
  const db = fixtureDatabase(tables);
  const load = moduleLoader({
    '@/lib/db/admin': { database: () => db, checkDb: error => { if (error) throw error; }, CaptureError, errorResponse: error => Response.json({ error: error.message }, { status: error.status || 500 }), requireSameOrigin() {} },
    '@/lib/auth/require-profile': { requireProfile: async () => profile },
  });
  return { load, tables };
}

test('candidate job discovery ranks the whole feed before pagination', async () => {
  const jobs = Array.from({ length: 510 }, (_, i) => ({ id: String(i).padStart(4, '0'), title: 'Java Developer', description: 'JavaScript', state: 'active', updated_at: '2026-01-01' }));
  jobs.push({ id: 'older-match', title: 'Python Developer', description: 'Python and SQL', state: 'active', updated_at: '2025-01-01' });
  const { load } = setup({ jobs });
  const response = await load('src/app/api/jobs/route.ts').GET(new Request('https://portal.test/api/jobs'));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.jobs.map(job => job.id), ['older-match']);
  assert.equal(result.total, 1);
  assert.equal(result.recommendation.candidateId, ownId);
});

test('candidates cannot use another candidate profile for job recommendations', async () => {
  const { load } = setup();
  const response = await load('src/app/api/jobs/route.ts').GET(new Request('https://portal.test/api/jobs?candidateId=' + otherId));
  assert.equal(response.status, 404);
});

test('candidates without reviewed profiles see an upload prompt rather than unrelated jobs', async () => {
  const { load } = setup({ candidates: [], jobs: [{ id: 'all', title: 'Anything', state: 'active' }] });
  const response = await load('src/app/api/jobs/route.ts').GET(new Request('https://portal.test/api/jobs'));
  const result = await response.json();
  assert.deepEqual(result.jobs, []);
  assert.equal(result.recommendation.requiresProfile, true);
});

test('staff can browse all jobs or filter them for a selected reviewed candidate', async () => {
  const { load } = setup({ role: 'recruiter', jobs: [{ id: 'java', title: 'Java Developer', description: 'Java', state: 'active' }, { id: 'python', title: 'Python Developer', description: 'Python', state: 'active' }] });
  const { GET } = load('src/app/api/jobs/route.ts');
  const all = await (await GET(new Request('https://portal.test/api/jobs'))).json();
  const selected = await (await GET(new Request('https://portal.test/api/jobs?candidateId=' + ownId))).json();
  assert.equal(all.jobs.length, 2);
  assert.deepEqual(selected.jobs.map(job => job.id), ['python']);
});

test('candidate extension tokens receive only their own reviewed profile', async () => {
  const { load, tables } = setup();
  tables.candidates.push({ id: 'unreviewed', user_id: owner, provenance_status: 'legacy_unconfirmed' });
  const response = await load('src/app/api/extension/candidates/route.ts').GET(new Request('https://portal.test/api/extension/candidates', { headers: { authorization: 'Bearer ' + token } }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.candidates.map(candidate => candidate.id), [ownId]);
  assert.equal(result.ownCandidateId, ownId);
  assert.equal(result.role, 'client');
});

test('revoked extension credentials cannot retrieve profiles', async () => {
  const { load } = setup({ revoked: true });
  const response = await load('src/app/api/extension/candidates/route.ts').GET(new Request('https://portal.test/api/extension/candidates', { headers: { authorization: 'Bearer ' + token } }));
  assert.equal(response.status, 401);
});

test('a linked recruiter can retrieve the exact reviewed candidate beyond the first list page', async () => {
  const { load } = setup({ role: 'recruiter', candidates: [
    ...Array.from({ length: 110 }, (_, i) => ({ id: 'earlier-' + i, full_name: 'Earlier', provenance_status: 'confirmed' })),
    { id: ownId, assigned_recruiter_id:owner, full_name: 'Linked candidate', provenance_status: 'confirmed' },
  ] });
  const response = await load('src/app/api/extension/candidates/route.ts').GET(new Request('https://portal.test/api/extension/candidates?candidateId=' + ownId, { headers: { authorization: 'Bearer ' + token } }));
  const result = await response.json();
  assert.deepEqual(result.candidates.map(candidate => candidate.id), [ownId]);
});

test('recruiters cannot select an unassigned profile for recommendations',async()=>{
 const {load}=setup({role:'recruiter'});
 const response=await load('src/app/api/jobs/route.ts').GET(new Request('https://portal.test/api/jobs?candidateId='+otherId));
 assert.equal(response.status,404);
});

test('candidate autofill credentials do not gain access to staff submission actions', async () => {
  const { load } = setup();
  const { extensionActor } = load('src/lib/capture/server.ts');
  await assert.rejects(extensionActor(new Request('https://portal.test', { headers: { authorization: 'Bearer ' + token } })), error => error.status === 403);
});
