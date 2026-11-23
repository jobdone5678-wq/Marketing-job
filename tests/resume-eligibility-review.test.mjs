import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { extractResumeLocal } from '../src/lib/resumes/local-extract.ts';
import { approvedSavedAnswers } from '../src/lib/extension-answers/saved-answers.ts';

function loadSource(path, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL('../src/' + path + '.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports, URL, Response, Buffer, console, ...globals,
    require: (name) => dependencies[name],
  });
  return exports;
}

test('Dashboard resume uploads preserve reviewed eligibility and explicit clears through saved-only autofill', async () => {
  const origin = 'https://www.nextkinhr.com';
  const actor = { id: 'candidate-user', role: 'candidate' };
  let candidate = null;
  const query = {
    select() { return this; },
    eq() { return this; },
    or() { return this; },
    order() { return this; },
    limit() { return { data: candidate ? [candidate] : [] }; },
    async maybeSingle() { return { data: candidate }; },
    insert(values) {
      candidate = { id: 'profile', ...JSON.parse(JSON.stringify(values)) };
      return this;
    },
    update(values) {
      candidate = { ...candidate, ...JSON.parse(JSON.stringify(values)) };
      return this;
    },
    async single() { return { data: candidate }; },
  };
  const dependencies = {
    '@/lib/capture/server': {
      cors: (_request, response) => response,
      extensionProfile: async () => actor,
      extensionRoute: async (_request, handler) => Response.json(await handler()),
    },
    '@/lib/db/admin': { database: () => ({ from: () => query }), checkDb: assert.ifError },
  };
  const { POST } = loadSource('app/api/jobseeker/resume/route', dependencies);
  const { GET } = loadSource('app/api/extension/candidates/route', {
    ...dependencies,
    '@/lib/ai/schemas': loadSource('lib/ai/schemas', { zod: { z } }),
    '@/lib/extension-answers/saved-answers': { approvedSavedAnswers },
  });
  const store = loadSource('lib/profile/profile-store', {}, {
    localStorage: { setItem() {} },
    window: { location: { origin }, postMessage() {} },
    fetch: (url, options) => POST(new Request(origin + url, options)),
  });
  const { parseResumeFile } = loadSource('lib/profile/resume-parser', {
    '@/lib/resumes/validation': { ResumeReadError: Error },
    '@/lib/resumes/local-extract': { extractResumeLocal },
    '@/lib/profile/skills-data': loadSource('lib/profile/skills-data'),
    '@/lib/profile/profile-store': store,
  });
  const parse = async (filename, text) => {
    const bytes = Buffer.from(text);
    return (await parseResumeFile(bytes, filename, bytes.length)).profile;
  };
  const projected = async () => {
    const response = await GET(new Request(origin + '/api/extension/candidates?savedOnly=true'));
    assert.equal(response.status, 200);
    return (await response.json()).candidates[0];
  };

  const first = await parse('first.txt', 'Jess Nguyen\njess@example.test | Austin, TX\nSoftware Engineer');
  assert.deepEqual(Array.from(first.screeningAnswers.authorized_countries), []);
  assert.equal(first.screeningAnswers.age_18_or_older, '');
  assert.equal(first.screeningAnswers.country_specific_answers.us_auth, undefined);
  assert.equal(await store.persistProfileToServer(first), true);
  let saved = await projected();
  assert.equal(saved.full_name, 'Jess Nguyen');
  assert.equal(saved.authorized_in_usa, null);
  assert.equal(saved.work_authorization, null);
  assert.equal(saved.age_18_or_older, undefined);
  assert.equal(saved.screeningAnswers, undefined);
  assert.equal(saved.confirmed_facts.raw_text, undefined);

  const directReview = await POST(new Request(origin + '/api/jobseeker/resume', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Jess Nguyen',
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: true,
      visa_status: 'Permanent resident',
      work_authorization: 'Permanent resident',
    }),
  }));
  assert.equal(directReview.status, 200);
  saved = await projected();
  for (const row of [candidate, candidate.confirmed_facts, saved]) {
    assert.equal(row.authorized_in_usa, true);
    assert.equal(row.need_sponsorship_now, false);
    assert.equal(row.need_sponsorship_future, true);
    assert.equal(row.visa_status, 'Permanent resident');
    assert.equal(row.work_authorization, 'Permanent resident');
  }

  const review = {
    age_18_or_older: 'no',
    authorized_countries: ['ca'],
    country_specific_answers: { us_auth: 'yes' },
    visa_sponsorship_needed: 'no',
  };
  assert.equal(await store.persistProfileToServer(first, review), true);
  const replacement = await parse('replacement.txt', 'Jess Nguyen\njess@example.test | London, UK\nSoftware Engineer');
  assert.equal(await store.persistProfileToServer(replacement), true);
  saved = await projected();
  assert.equal(saved.authorized_in_usa, true);
  assert.equal(saved.work_authorization, 'Permanent resident');
  assert.equal(saved.need_sponsorship_now, false);
  assert.equal(candidate.confirmed_facts.screeningAnswers.age_18_or_older, 'no');
  assert.deepEqual(candidate.confirmed_facts.screeningAnswers.authorized_countries, ['ca']);

  // A profile originally written by the portal may still have values in its
  // dedicated columns that differ from the dashboard's confirmed facts.
  candidate.work_authorization = 'Stale work authorization';
  candidate.visa_status = 'Stale visa status';
  candidate.need_sponsorship_future = true;
  const clear = {
    age_18_or_older: '',
    authorized_countries: [],
    country_specific_answers: { us_auth: '' },
    visa_sponsorship_needed: '',
  };
  assert.equal(await store.persistProfileToServer(replacement, clear), true);
  const upload = await POST(new Request(origin + '/api/jobseeker/resume', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Jess Nguyen',
      filename: 'another.txt',
      raw_text: 'Jess Nguyen is a software engineer in Seattle.',
      authorized_in_usa: true,
      need_sponsorship_now: true,
      work_authorization: 'Authorized to work in US',
      visa_status: 'US Citizen',
      screeningAnswers: {
        age_18_or_older: 'yes',
        authorized_countries: ['us'],
        country_specific_answers: { us_auth: 'yes' },
        visa_sponsorship_needed: 'yes',
      },
    }),
  }));
  assert.equal(upload.status, 200);
  saved = await projected();
  assert.equal(saved.authorized_in_usa, null);
  assert.equal(saved.work_authorization, null);
  assert.equal(saved.visa_status, null);
  assert.equal(saved.need_sponsorship_now, null);
  assert.equal(saved.need_sponsorship_future, null);
  assert.equal(candidate.authorized_in_usa, null);
  assert.equal(candidate.need_sponsorship_now, null);
  assert.equal(candidate.need_sponsorship_future, null);
  assert.equal(candidate.work_authorization, null);
  assert.equal(candidate.visa_status, null);
  assert.equal(candidate.confirmed_facts.screeningAnswers.age_18_or_older, '');
  assert.equal(candidate.confirmed_facts.screeningAnswers.country_specific_answers.us_auth, '');
  assert.deepEqual(candidate.confirmed_facts.screeningAnswers.authorized_countries, []);

  const directClear = await POST(new Request(origin + '/api/jobseeker/resume', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Jess Nguyen', need_sponsorship_future: false }),
  }));
  assert.equal(directClear.status, 200);
  assert.equal((await projected()).need_sponsorship_future, false);
  const clearFuture = await POST(new Request(origin + '/api/jobseeker/resume', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Jess Nguyen', need_sponsorship_future: null }),
  }));
  assert.equal(clearFuture.status, 200);
  assert.equal((await projected()).need_sponsorship_future, null);
  assert.equal(candidate.need_sponsorship_future, null);
});
