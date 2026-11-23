import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { questionSchema } from '../src/lib/extension-answers/evidence.ts';

const application = new URL('https://jobs.lever.co/fixture/01234567-0123-4567-89ab-0123456789ab/apply');
const source = (file) => readFileSync(new URL(`../jobright_extension/${file}`, import.meta.url), 'utf8');
const prose = 'You can review my recent projects on GitHub.';

class Input extends EventTarget {
  tagName = 'INPUT';
  isConnected = true;
  value = '';
  getAttribute() { return null; }
  closest() { return null; }
}

function fixture() {
  const fields = [
    ['Full Name', 'name'], ['Email', 'email'], ['Twitter URL', 'urls[Twitter]'],
    ['GitHub URL', 'urls[GitHub]', 'url'], ['Portfolio', 'urls[Portfolio]'],
    ['Other', 'urls[Other]'], ['Why do you want to join this company?', 'motivation'],
  ].map(([label, name, type = 'text']) => ({
    key: name, label, kind: 'text', options: [], element: Object.assign(new Input(), { name, type }),
  }));
  const context = {
    location: application, document: { querySelectorAll: () => [] }, crypto, Event, URL,
    HTMLInputElement: Input, NextkinJobCapture: { read: () => null },
    NextkinForms: { discoverFields: () => fields },
  };
  for (const file of ['core/field-mapping.js', 'core/field-writer.js', 'core/application.js']) {
    runInNewContext(source(file), context);
  }
  const lookup = (key) => fields.find((field) => field.key === key);
  return { context, lookup };
}

test('Lever fills only saved valid links and keeps URL fields out of screening', async () => {
  const { context, lookup } = fixture();
  const facts = {
    full_name: 'Fixture Candidate', email: 'candidate@example.test',
    github_url: 'https://github.com/fixture', portfolio_url: 'javascript:alert(1)',
  };
  lookup('urls[Other]').element.value = 'https://manually-entered.example.test';
  const results = await context.NextkinApplication.fill(
    application.href, { provenance_status: 'confirmed', confirmed_facts: facts }, null,
    false, null, { 'twitter url': { type: 'text', value: prose } },
    { 'github url': prose, 'twitter url': prose, portfolio: prose, other: prose },
  );
  assert.equal(lookup('urls[GitHub]').element.value, facts.github_url);
  assert.equal(lookup('urls[Twitter]').element.value, '');
  assert.equal(lookup('urls[Portfolio]').element.value, '');
  assert.equal(lookup('urls[Other]').element.value, 'https://manually-entered.example.test');
  assert.equal(results.questions.length, 1);
  assert.match(results.questions[0].label, /why do you want/i);
  assert.ok(results.unfilled.some((entry) => /valid profile URL/.test(entry.reason)));
  assert.ok(!results.filled.some((entry) => entry.ai || entry.learned));
});

test('write-time validation rejects invalid or non-profile URL plans', async () => {
  const { context, lookup } = fixture();
  const field = lookup('urls[Twitter]');
  const plan = { field, status: 'supported', factKey: 'twitter_url' };
  for (const details of [
    { value: prose }, { value: 'https://fixture.test and more' }, { value: 'https:///fixture.test' },
    { value: 'mailto:person@example.test' }, { value: 'https://user:password@fixture.test' },
    { value: 'https://fixture.test', ai: true }, { value: 'https://fixture.test', learned: true },
  ]) {
    const receipts = await context.NextkinFieldWriter.applyFill(
      [{ ...plan, ...details }], { isCurrent: () => true }
    );
    assert.equal(receipts.length, 0);
    assert.equal(field.element.value, '');
  }
});

test('structured URL questions are rejected by background screening admission', () => {
  for (const q of [
    { id: 'urls[Other]', label: 'Other', type: 'text' },
    { id: 'a', label: 'Any label', type: 'url' },
    { id: 'b', label: 'Please provide your GitHub profile URL', type: 'text' },
    { id: 'github_url', label: 'Other', type: 'text' },
    { id: 'website', label: 'Homepage', type: 'text' },
    { id: 'c', label: 'GitHub.com', type: 'text' },
  ]) assert.equal(questionSchema.safeParse(q).success, false);
  assert.equal(questionSchema.safeParse({
    id: 'motivation', label: 'Tell us about your experience with GitHub', type: 'text',
  }).success, true);
});

test('screening panel sends only eligible questions and retries only the unresolved ones', async () => {
  const { context } = fixture();
  const panel = source('panel.js');
  const code = panel.slice(panel.indexOf('async function mapConcurrent('), panel.indexOf('function outsideApplicationPage('));
  const calls = [];
  const runtime = {
    NextkinFieldMapping: context.NextkinFieldMapping,
    crypto,
    checkScreeningContext: async () => {},
    async api(path, request) {
      const body = JSON.parse(request.body);
      calls.push({ path, body });
      if (path === 'generate-answer') {
        return body.questionId === 'bio' ? { ok: true, answer: 'Biography facts' } : { ok: false };
      }
      return {
        status: 'succeeded', sessionId: body.sessionId,
        answers: { motivation: 'Relevant work', bio: 'Ignore this', 'urls[Other]': prose },
      };
    },
  };
  runInNewContext(code, runtime);
  const job = {
    title: 'Engineer', company: 'Acme',
    description: 'A sufficiently complete fixture role description for screening.',
    jobUrl: application.href,
  };
  const urls = [
    { id: 'urls[Other]', label: 'Other', type: 'text' },
    { id: 'urls[Twitter]', label: 'Twitter URL', type: 'text' },
  ];
  await runtime.draftScreening({}, { id: 'fixture' }, {}, job, urls);
  assert.deepEqual(calls, []);
  const results = await runtime.draftScreening({}, { id: 'fixture' }, {}, job, [
    ...urls,
    { id: 'bio', label: 'Tell us about yourself', type: 'text' },
    { id: 'motivation', label: 'Why do you want this job?', type: 'text' },
  ]);
  const direct = calls.filter((call) => call.path === 'generate-answer');
  assert.deepEqual(direct.map((call) => call.body.questionId).sort(), ['bio', 'motivation']);
  const fallback = calls.find((call) => call.path === 'answer-drafts');
  assert.deepEqual(fallback.body.questions.map((q) => q.id), ['motivation']);
  assert.deepEqual({ ...results }, { bio: 'Biography facts', motivation: 'Relevant work' });
});

test('screening scope rejects stale SPA jobs, frames, and persisted candidate changes', async () => {
  const panel = source('panel.js');
  const code = panel.slice(panel.indexOf('function formTarget('), panel.indexOf('function answerScope('));
  const session = { origin: 'https://nextkinhr.com', token: 'fixture' };
  const frame = { frameId: 4, documentId: 'original', result: { url: application.href } };
  let activeCandidateId = 'candidate-one';
  let snapshot = { documentId: 'original', result: { url: application.href, jobKey: 'job-one' } };
  const scope = { frame, source: frame, jobKey: 'job-one', selection: activeCandidateId };
  const runtime = {
    checkFormContext: async () => {},
    getStoredCredentials: async () => ({ ...session, activeCandidateId }),
    chrome: { scripting: { executeScript: async () => [snapshot] } },
  };
  runInNewContext(code, runtime);
  const verify = () => runtime.checkScreeningContext({ id: 1 }, session, 'candidate-one', scope);
  await verify();
  snapshot.result.jobKey = 'job-two';
  await assert.rejects(verify, /job.*changed/i);
  snapshot.result.jobKey = 'job-one';
  snapshot.documentId = 'new-frame';
  await assert.rejects(verify, /application frame.*changed/i);
  snapshot.documentId = 'original';
  activeCandidateId = 'candidate-two';
  await assert.rejects(verify, /selected candidate.*changed/i);
});

test('screening validates the separate posting source for forms without local metadata', async () => {
  const panel = source('panel.js');
  const code = panel.slice(panel.indexOf('function formTarget('), panel.indexOf('function answerScope('));
  const session = { origin: 'https://nextkinhr.com', token: 'fixture' };
  const tab = { id: 1, url: 'https://careers.example.test/roles/17' };
  const frame = { frameId: 4, documentId: 'form', result: { url: application.href } };
  const sourceFrame = { frameId: 0, documentId: 'parent', result: { url: tab.url } };
  const snapshots = {
    form: { documentId: 'form', result: { url: application.href, jobKey: null } },
    parent: { documentId: 'parent', result: { url: tab.url, jobKey: 'posting' } },
  };
  const runtime = {
    checkFormContext: async () => {},
    getStoredCredentials: async () => ({ ...session, activeCandidateId: 'candidate-one' }),
    chrome: { scripting: { executeScript: async ({ target }) => [snapshots[target.documentIds[0]]] } },
  };
  runInNewContext(code, runtime);
  const scope = { frame, source: sourceFrame, jobKey: 'posting', selection: 'candidate-one' };
  await runtime.checkScreeningContext(tab, session, 'candidate-one', scope);
  snapshots.parent.result.jobKey = 'another-posting';
  await assert.rejects(runtime.checkScreeningContext(tab, session, 'candidate-one', scope), /job changed/i);
});
