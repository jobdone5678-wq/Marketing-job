import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = (name) => readFileSync(new URL('../supabase/migrations/' + name + '.sql', import.meta.url), 'utf8');
const actor = '10000000-0000-4000-8000-000000000001';
const candidate = '10000000-0000-4000-8000-000000000002';
const event = '10000000-0000-4000-8000-000000000003';
const secondEvent = '10000000-0000-4000-8000-000000000004';
const draft = '10000000-0000-4000-8000-000000000005';
const job = '10000000-0000-4000-8000-000000000006';
const intent = '10000000-0000-4000-8000-000000000007';
const url = 'https://jobs.lever.co/fixture/first';
const portalUrl = 'https://jobs.lever.co/fixture/portal';
const observed = '2026-11-23T08:00:00Z';

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TYPE public.submission_status AS ENUM ('Draft', 'Applied', 'Interview');
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, status text, role text);
    CREATE TABLE public.candidates (id uuid PRIMARY KEY, user_id uuid);
    CREATE TABLE public.job_sources (id uuid PRIMARY KEY);
    `);
  const jobsDdl = migration('20261009000500_jobs').split('\n').find(line => line.startsWith('CREATE TABLE public.jobs'));
  await db.exec(jobsDdl);
  await db.exec(`
    CREATE TABLE public.job_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid REFERENCES public.candidates,
      company_name text, job_title text, job_url text, portal_source text, job_location text,
      job_id uuid REFERENCES public.jobs, status public.submission_status, capture_status text,
      duplicate_flag boolean DEFAULT false, submission_date date DEFAULT CURRENT_DATE,
      notes text, applied_resume jsonb, source_type text, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION public.candidate_actor_can_access(uuid, uuid) RETURNS boolean LANGUAGE sql AS
      $$ SELECT EXISTS(SELECT FROM public.candidates WHERE id = $2 AND user_id = $1) $$;
    ALTER TABLE public.jobs ALTER COLUMN source_id DROP NOT NULL;
    ALTER TABLE public.jobs ADD COLUMN is_external boolean NOT NULL DEFAULT false, ADD COLUMN portal_source text;
    `);
  const capture = migration('20261009000800_browser_capture');
  for (const table of ['application_intents', 'browser_capture_events']) {
    await db.exec(capture.split('\n').find(line => line.startsWith('CREATE TABLE public.' + table + '(')));
  }
  const outside = migration('20261104000300_outside_jobs_support');
  await db.exec(outside.slice(outside.indexOf('CREATE TABLE IF NOT EXISTS public.outside_jobs'), outside.indexOf('ALTER TABLE public.outside_jobs ENABLE')));
  await db.exec(outside.slice(outside.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS jobs_external_url_idx'), outside.indexOf('-- 5.')));
  await db.exec(migration('20261113000200_outside_job_capture_details'));
  const snapshot = migration('20261011000300_application_answer_snapshots');
  for (const table of ['application_answer_snapshots', 'extension_submission_events']) {
    const start = snapshot.indexOf('CREATE TABLE IF NOT EXISTS public.' + table);
    await db.exec(snapshot.slice(start, snapshot.indexOf('\n);', start) + 3));
  }
  const browser = migration('20261111000100_candidate_only_roles');
  const start = browser.indexOf('CREATE OR REPLACE FUNCTION public.record_browser_event');
  await db.exec(browser.slice(start, browser.indexOf('END; $$;', start) + 'END; $$;'.length));
  await db.exec(migration('20261011000800_capture_integrity'));
  await db.exec(migration('20261120160000_atomic_submission_dual_write'));
  await db.exec(migration('20261123000100_atomic_application_receipt'));
  await db.query("INSERT INTO public.profiles VALUES ($1, 'active', 'candidate')", [actor]);
  await db.query('INSERT INTO public.candidates VALUES ($1, $2)', [candidate, actor]);
  return db;
}

const external = async (db, key, attempt = 1, fields = {}) => (await db.query(
  'SELECT public.record_extension_submission($1,$2,$3,$4,$5) AS result',
  [actor, candidate, key, attempt, { companyName: 'Fixture', jobTitle: 'Engineer', jobUrl: url,
    confirmationUrl: url + '/confirmation', employmentType: 'Full-time', appliedResume: null, ...fields }],
)).rows[0].result;

const portal = async (db, attempt = 1) => (await db.query(
  "SELECT public.record_application_observation($1,$2,$3,'submitted',$4,'extension_observation','Application submitted',$5,$6,ARRAY[$7]::text[]) AS result",
  [actor, intent, event, attempt, portalUrl + '/confirmation', observed, portalUrl],
)).rows[0].result;

async function portalDraft(db) {
  await db.query(`INSERT INTO public.jobs(id,external_id,title,company,source_url,application_url,description,employment_type,content_hash)
    VALUES($1,'job','Engineer','Fixture',$2,$2,'Description','permanent','hash')`, [job, portalUrl]);
  await db.query(`INSERT INTO public.job_submissions(id,candidate_id,job_id,job_url,status,capture_status)
    VALUES($1,$2,$3,$4,'Draft','in_progress')`, [draft, candidate, job, portalUrl]);
  await db.query('INSERT INTO public.application_intents(id,owner_id,candidate_id,job_id,submission_id) VALUES($1,$2,$3,$4,$5)',
    [intent, actor, candidate, job, draft]);
  await db.query("INSERT INTO public.outside_jobs(candidate_id,capture_owner_id,title,company,job_url) VALUES($1,$2,'Engineer','Fixture',$3)", [candidate, actor, portalUrl]);
}

test('External receipt rolls back both writes and its event if Outside Jobs fails', async t => {
  const db = await fixture(t);
  await db.exec("ALTER TABLE public.outside_jobs ADD CONSTRAINT injected_failure CHECK (status <> 'Applied')");
  await assert.rejects(external(db, event), /injected_failure/);
  for (const table of ['jobs', 'job_submissions', 'outside_jobs', 'extension_submission_events']) {
    assert.equal((await db.query('SELECT * FROM public.' + table)).rows.length, 0);
  }
  await db.exec('ALTER TABLE public.outside_jobs DROP CONSTRAINT injected_failure');
  const [first, second] = await Promise.all([external(db, event), external(db, secondEvent, 2)]);
  assert.equal(first.submission.id, second.submission.id);
  assert.equal(first.submission.applied_resume, null);
  assert.deepEqual((await db.query('SELECT outside.status, submission_id, submissions.status AS application_status FROM public.outside_jobs outside JOIN public.job_submissions submissions ON submissions.id = outside.submission_id')).rows,
    [{ status: 'Applied', submission_id: first.submission.id, application_status: 'Applied' }]);
  assert.equal((await db.query('SELECT * FROM public.job_submissions')).rows.length, 1);
  const replay = await external(db, event, 3);
  assert.equal(replay.replayed, true);
  assert.equal(replay.attempt, 1);
  assert.equal(replay.observed_at, first.observed_at);
  await assert.rejects(external(db, event, 1, { source: 'recruiter_attestation' }), /event key conflict/);
  await assert.rejects(external(db, event, 1, { jobUrl: url + '-different' }), /event key conflict/);
  const manual = await external(db, '10000000-0000-4000-8000-000000000008', 1, { source: 'recruiter_attestation' });
  assert.equal(manual.submission.id, first.submission.id);
  assert.deepEqual((await db.query('SELECT DISTINCT receipt_source FROM public.extension_submission_events ORDER BY receipt_source')).rows,
    [{ receipt_source: 'extension_observation' }, { receipt_source: 'recruiter_attestation' }]);
});

test('Portal receipt and linked capture roll back together and replay at the original attempt', async t => {
  const db = await fixture(t);
  await portalDraft(db);
  await db.exec("ALTER TABLE public.outside_jobs ADD CONSTRAINT injected_failure CHECK (status <> 'Applied')");
  await assert.rejects(portal(db), /injected_failure/);
  assert.deepEqual((await db.query('SELECT status FROM public.job_submissions')).rows, [{ status: 'Draft' }]);
  assert.deepEqual((await db.query('SELECT status FROM public.outside_jobs')).rows, [{ status: 'Discovered' }]);
  assert.deepEqual((await db.query('SELECT * FROM public.browser_capture_events')).rows, []);
  await db.exec('ALTER TABLE public.outside_jobs DROP CONSTRAINT injected_failure');
  const receipt = await portal(db);
  const replay = await portal(db, 4);
  assert.deepEqual(receipt, replay);
  assert.equal(receipt.status, 'submitted');
  assert.equal(receipt.attempt, 1);
  assert.deepEqual((await db.query('SELECT status FROM public.job_submissions')).rows, [{ status: 'Applied' }]);
  assert.deepEqual((await db.query('SELECT status, submission_id FROM public.outside_jobs')).rows, [{ status: 'Applied', submission_id: draft }]);
  assert.equal((await db.query('SELECT * FROM public.browser_capture_events')).rows.length, 1);
});

test('An auto-submit receipt with a matching portal intent links the existing draft and replays one answer revision', async t => {
  const db = await fixture(t);
  await portalDraft(db);
  const options = { jobUrl: portalUrl, intentId: intent, postingKeys: [portalUrl] };
  await db.exec("ALTER TABLE public.outside_jobs ADD CONSTRAINT injected_failure CHECK (status <> 'Applied')");
  await assert.rejects(external(db, event, 1, options), /injected_failure/);
  assert.deepEqual((await db.query('SELECT status FROM public.job_submissions')).rows, [{ status: 'Draft' }]);
  assert.deepEqual((await db.query('SELECT * FROM public.browser_capture_events')).rows, []);
  await db.exec('ALTER TABLE public.outside_jobs DROP CONSTRAINT injected_failure');
  const first = await external(db, event, 1, options);
  const replay = await external(db, event, 5, options);
  assert.equal(first.submission.id, draft);
  assert.equal(replay.intent_id, intent);
  assert.equal(replay.attempt, first.attempt);
  assert.deepEqual((await db.query('SELECT status, submission_id FROM public.outside_jobs')).rows, [{ status: 'Applied', submission_id: draft }]);
  const answers = [{ key: 'name', label: 'Name', value: 'Fixture' }];
  const saveAnswers = async receipt => (await db.query(
    'SELECT public.save_application_answer_snapshot($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS result',
    [actor, receipt.intent_id, receipt.submission.id, candidate, receipt.attempt, event, 'Fixture', portalUrl, null, answers, receipt.observed_at],
  )).rows[0].result;
  assert.deepEqual(await saveAnswers(first), await saveAnswers(replay));
  assert.equal((await db.query('SELECT * FROM public.application_answer_snapshots')).rows.length, 1);
  const signature = 'public.record_application_observation(uuid,uuid,uuid,text,integer,text,text,text,timestamptz,text[])';
  const { rows: [grants] } = await db.query(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated,
    has_function_privilege('anon', $1, 'EXECUTE') AS anon, has_function_privilege('service_role', $1, 'EXECUTE') AS service`, [signature]);
  assert.deepEqual(grants, { authenticated: false, anon: false, service: true });
});

test('A second candidate cannot adopt another candidate’s outside capture or its artifacts', async t => {
  const db = await fixture(t);
  const candidateB = '10000000-0000-4000-8000-000000000009';
  await db.query('INSERT INTO public.candidates VALUES ($1, $2)', [candidateB, actor]);
  await external(db, event, 1, { answers: [{ key: 'name', value: 'Candidate A' }] });
  await db.query('UPDATE public.outside_jobs SET applied_resume = $1 WHERE candidate_id = $2',
    [{ filename: 'candidate-a.pdf' }, candidate]);
  const { rows: before } = await db.query('SELECT * FROM public.outside_jobs');
  await assert.rejects(db.query('SELECT public.record_extension_submission($1,$2,$3,$4,$5)',
    [actor, candidateB, secondEvent, 1, { companyName: 'Fixture', jobTitle: 'Engineer', jobUrl: url }]),
  /Outside Jobs candidate conflict/);
  assert.deepEqual((await db.query('SELECT * FROM public.outside_jobs')).rows, before);
  assert.deepEqual((await db.query('SELECT candidate_id FROM public.job_submissions')).rows, [{ candidate_id: candidate }]);
  assert.deepEqual((await db.query('SELECT event_key FROM public.extension_submission_events')).rows, [{ event_key: event }]);
});

test('Replaying an older receipt cannot replace the newer resume on either linked record', async t => {
  const db = await fixture(t);
  const first = await external(db, event);
  const second = await external(db, secondEvent, 2);
  const archive = async (key, filename) => (await db.query(
    'SELECT public.save_application_receipt_resume($1,$2,$3,$4,$5) AS resume',
    [actor, candidate, first.submission.id, key, { filename }],
  )).rows[0].resume;
  assert.equal(second.submission.id, first.submission.id);
  assert.deepEqual(await archive(event, 'first.pdf'), { filename: 'first.pdf' });
  assert.deepEqual(await archive(secondEvent, 'newer.pdf'), { filename: 'newer.pdf' });
  assert.equal((await external(db, event)).replayed, true);
  assert.deepEqual(await archive(event, 'first.pdf'), { filename: 'newer.pdf' });
  assert.deepEqual(await archive(secondEvent, 'changed-retry.pdf'), { filename: 'newer.pdf' });
  for (const table of ['job_submissions', 'outside_jobs']) {
    assert.deepEqual((await db.query('SELECT applied_resume FROM public.' + table)).rows,
      [{ applied_resume: { filename: 'newer.pdf' } }]);
  }
});

test('Receipts adopt an owned capture that was discovered before a candidate profile existed', async t => {
  const db = await fixture(t);
  const candidateBeforeCapture = '10000000-0000-4000-8000-000000000010';
  const otherOwner = '10000000-0000-4000-8000-000000000011';
  await db.query("INSERT INTO public.profiles VALUES ($1, 'active', 'candidate')", [otherOwner]);
  const { rows: [outside] } = await db.query(`INSERT INTO public.outside_jobs(capture_owner_id,title,company,job_url)
    VALUES($1,'Engineer','Fixture',$2) RETURNING id`, [actor, url]);
  await db.query(`INSERT INTO public.outside_jobs(capture_owner_id,title,company,job_url)
    VALUES($1,'Other capture','Fixture',$2)`, [otherOwner, url]);
  await db.query('INSERT INTO public.candidates VALUES ($1,$2)', [candidateBeforeCapture, actor]);
  const { rows: [{ receipt }] } = await db.query('SELECT public.record_extension_submission($1,$2,$3,$4,$5) AS receipt',
    [actor, candidateBeforeCapture, event, 1, { companyName: 'Fixture', jobTitle: 'Engineer', jobUrl: url }]);
  const { rows: adopted } = await db.query('SELECT candidate_id, submission_id, status FROM public.outside_jobs WHERE id = $1', [outside.id]);
  assert.deepEqual(adopted, [{ candidate_id: candidateBeforeCapture, submission_id: receipt.submission.id, status: 'Applied' }]);
  assert.deepEqual((await db.query('SELECT candidate_id, submission_id, status FROM public.outside_jobs WHERE capture_owner_id = $1', [otherOwner])).rows,
    [{ candidate_id: null, submission_id: null, status: 'Discovered' }]);

  await portalDraft(db);
  await db.query('UPDATE public.outside_jobs SET candidate_id = NULL WHERE job_url = $1', [portalUrl]);
  await portal(db);
  assert.deepEqual((await db.query('SELECT candidate_id, submission_id, status FROM public.outside_jobs WHERE job_url = $1', [portalUrl])).rows,
    [{ candidate_id: candidate, submission_id: draft, status: 'Applied' }]);

  await db.query('UPDATE public.outside_jobs SET candidate_id = NULL WHERE id = $1', [outside.id]);
  await assert.rejects(external(db, secondEvent), /Outside Jobs candidate conflict/);
  assert.deepEqual((await db.query('SELECT candidate_id, submission_id FROM public.outside_jobs WHERE id = $1', [outside.id])).rows,
    [{ candidate_id: null, submission_id: receipt.submission.id }]);
});
