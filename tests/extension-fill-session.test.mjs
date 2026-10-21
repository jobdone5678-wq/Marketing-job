import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

async function loadContext() {
  const engine = await readFile(new URL('../browser-extension/resume-engine.js', import.meta.url), 'utf8');
  let candidateContextCode = '';
  let jobContextCode = '';
  let fillSessionCode = '';
  try {
    candidateContextCode = await readFile(new URL('../browser-extension/candidate-context.js', import.meta.url), 'utf8');
    jobContextCode = await readFile(new URL('../browser-extension/job-context.js', import.meta.url), 'utf8');
    fillSessionCode = await readFile(new URL('../browser-extension/fill-session.js', import.meta.url), 'utf8');
  } catch {}

  const sandbox = {
    crypto: webcrypto,
    TextEncoder,
    URL,
    URLSearchParams,
    console,
    Map
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(engine, context);
  if (candidateContextCode) vm.runInContext(candidateContextCode, context);
  if (jobContextCode) vm.runInContext(jobContextCode, context);
  if (fillSessionCode) vm.runInContext(fillSessionCode, context);
  return context;
}

test('FillSession reports not ready when candidate or JD is missing', async () => {
  const ctx = await loadContext();
  assert.ok(ctx.NextkinFillSession, 'NextkinFillSession must be defined');

  const emptySession = ctx.NextkinFillSession.create({
    candidate: null,
    job: null
  });
  const readiness = emptySession.getReadiness();
  assert.equal(readiness.ready, false);
  assert.ok(readiness.reasons.some(r => /candidate/i.test(r)));
  assert.ok(readiness.reasons.some(r => /job/i.test(r)));
});

test('FillSession reports not ready when candidate facts are unconfirmed', async () => {
  const ctx = await loadContext();
  const session = ctx.NextkinFillSession.create({
    candidate: { id: 'c1', full_name: 'Alex', provenance_status: 'unconfirmed' },
    job: { title: 'Engineer', company: 'Acme', description: 'Looking for engineer', url: 'https://jobs.test/1' }
  });
  const readiness = session.getReadiness();
  assert.equal(readiness.ready, false);
  assert.ok(readiness.reasons.some(r => /confirm|review/i.test(r)));
});

test('FillSession reports ready when reviewed candidate and complete JD exist', async () => {
  const ctx = await loadContext();
  const session = ctx.NextkinFillSession.create({
    candidate: { id: 'c1', full_name: 'Alex', provenance_status: 'confirmed', primary_skills: 'Python' },
    job: { title: 'Engineer', company: 'Acme', description: 'Looking for a senior engineer with Python experience.', url: 'https://jobs.test/1' }
  });
  const readiness = session.getReadiness();
  assert.equal(readiness.ready, true);
  assert.equal(readiness.reasons.length, 0);
  assert.ok(session.sessionId);
});

test('FillSession tracks written receipts and enables safe undo only when value matches writtenValue', async () => {
  const ctx = await loadContext();
  const session = ctx.NextkinFillSession.create({
    candidate: { id: 'c1', full_name: 'Alex', provenance_status: 'confirmed' },
    job: { title: 'Engineer', company: 'Acme', description: 'Looking for engineer.', url: 'https://jobs.test/1' }
  });

  session.recordWrite('email', '', 'alex@example.test');
  assert.equal(session.canUndo('email', 'alex@example.test'), true);
  assert.equal(session.canUndo('email', 'user-edited@example.test'), false);
  assert.equal(session.getPreviousValue('email'), '');
});

test('Two distinct job postings with the same title produce distinct job keys and session IDs', async () => {
  const ctx = await loadContext();
  const cand = { id: 'c1', full_name: 'Alex', provenance_status: 'confirmed' };
  const s1 = ctx.NextkinFillSession.create({
    candidate: cand,
    job: { title: 'Engineer', company: 'Acme', description: 'JD 1', url: 'https://jobs.test/job/101' }
  });
  const s2 = ctx.NextkinFillSession.create({
    candidate: cand,
    job: { title: 'Engineer', company: 'Acme', description: 'JD 2', url: 'https://jobs.test/job/102' }
  });
  assert.notEqual(s1.sessionId, s2.sessionId);
  assert.notEqual(s1.jobContext.jobKey, s2.jobContext.jobKey);
});
