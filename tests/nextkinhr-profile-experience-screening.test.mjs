import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { z } from 'zod';
import { unzipSync, zipSync } from 'fflate';
import mammoth from 'mammoth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const USER_1 = '11111111-1111-4000-8000-111111111111';
const USER_2 = '22222222-2222-4000-8000-222222222222';

const migrationSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20261125000100_freehire_profile_experience_screening.sql'),
  'utf8'
);
const alignMigrationSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20261125000300_align_freehire_1to1_schema.sql'),
  'utf8'
);

function createModuleLoader() {
  const cache = new Map();
  const rawCountries = JSON.parse(
    readFileSync(resolve(repoRoot, 'src/lib/profile-countries.json'), 'utf8')
  );

  const staticDeps = {
    'node:crypto': { createHash },
    zod: { z },
    fflate: { unzipSync, zipSync },
    mammoth,
  };

  function resolveTarget(specifier, fromDir) {
    if (staticDeps[specifier]) return { kind: 'static', value: staticDeps[specifier] };
    if (specifier.endsWith('.json')) {
      if (specifier.includes('profile-countries.json')) {
        return { kind: 'static', value: rawCountries };
      }
      const p = resolve(fromDir, specifier);
      return { kind: 'static', value: JSON.parse(readFileSync(p, 'utf8')) };
    }
    let targetPath;
    if (specifier.startsWith('@/')) {
      targetPath = resolve(repoRoot, 'src', specifier.slice(2));
    } else if (specifier.startsWith('.')) {
      targetPath = resolve(fromDir, specifier);
    } else {
      throw new Error(`Unmocked dependency "${specifier}" from "${fromDir}"`);
    }
    if (!targetPath.endsWith('.ts')) targetPath += '.ts';
    return { kind: 'ts', path: targetPath };
  }

  function loadTs(relFromSrc) {
    const absPath = resolve(repoRoot, 'src', relFromSrc);
    return loadAbsTs(absPath);
  }

  function loadAbsTs(absPath) {
    if (cache.has(absPath)) return cache.get(absPath);
    const source = readFileSync(absPath, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    });
    const exports = {};
    const module = { exports };
    cache.set(absPath, exports);
    const fileDir = dirname(absPath);
    runInNewContext(outputText, {
      exports,
      module,
      URL,
      Request,
      Response,
      FormData,
      File,
      Blob,
      Buffer,
      console,
      process,
      setTimeout,
      clearTimeout,
      require: (specifier) => {
        const resolved = resolveTarget(specifier, fileDir);
        if (resolved.kind === 'static') return resolved.value;
        return loadAbsTs(resolved.path);
      },
    });
    return module.exports;
  }

  return { loadTs };
}

async function createTestDbWithStorage() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email text,
      raw_user_meta_data jsonb,
      created_at timestamptz DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text,
      public boolean,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid DEFAULT gen_random_uuid(),
      bucket_id text,
      name text
    );
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text NOT NULL,
      full_name text,
      role text NOT NULL DEFAULT 'candidate',
      status text NOT NULL DEFAULT 'active',
      phone text,
      company_name text,
      created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
      updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
    );
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY scoped_profiles ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
    CREATE POLICY update_own_profile ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  `);

  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@example.com')`, [USER_1]);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'bob@example.com')`, [USER_2]);
  await db.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ($1, 'alice@example.com', 'Alice')`, [USER_1]);
  await db.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ($1, 'bob@example.com', 'Bob')`, [USER_2]);

  await db.exec(migrationSql);
  await db.exec(alignMigrationSql);

  const storageObjects = new Map();
  db.storage = {
    from(bucket) {
      return {
        async upload(key, buffer, opts) {
          storageObjects.set(`${bucket}:${key}`, { buffer, contentType: opts?.contentType });
          return { data: { path: key }, error: null };
        },
        async createSignedUrl(key) {
          if (!storageObjects.has(`${bucket}:${key}`)) {
            return { data: null, error: { message: 'Not found' } };
          }
          return { data: { signedUrl: `https://storage.test/${bucket}/${key}` }, error: null };
        },
        async remove(keys) {
          for (const k of keys) storageObjects.delete(`${bucket}:${k}`);
          return { data: null, error: null };
        },
      };
    },
  };

  return { db, storageObjects };
}

test('NextKinHR 1:1 exact database schema, constraints, RLS, and backend /api/v1/me/* endpoints', async (t) => {
  const { db, storageObjects } = await createTestDbWithStorage();
  t.after(async () => {
    await db.close();
  });

  const { loadTs } = createModuleLoader();
  const profileRoute = loadTs('lib/v1/me/profile.ts');
  const excludeCompRoute = loadTs('lib/v1/me/excluded-companies.ts');
  const unexcludeCompRoute = loadTs('lib/v1/me/excluded-company-item.ts');
  const contactsRoute = loadTs('lib/v1/me/contacts.ts');
  const resumeRoute = loadTs('lib/v1/me/resume.ts');
  const photoRoute = loadTs('lib/v1/me/photo.ts');
  const experienceRoute = loadTs('lib/v1/me/experience.ts');
  const empItemRoute = loadTs('lib/v1/me/employment-item.ts');
  const atomItemRoute = loadTs('lib/v1/me/experience-atom-item.ts');
  const mergeRoute = loadTs('lib/v1/me/experience-atoms-merge.ts');
  const screeningRoute = loadTs('lib/v1/me/screening-answers.ts');
  const answerBankRoute = loadTs('lib/v1/me/answer-bank.ts');
  const experienceLib = loadTs('lib/candidate/experience.ts');
  const screeningLib = loadTs('lib/ingest/screeninganswers.ts');
  const answerBankLib = loadTs('lib/candidate/answerbank.ts');

  const authHeaders = (uid) => ({
    Authorization: `Bearer ${uid}`,
    'Content-Type': 'application/json',
  });

  await t.test('Authentication: all /api/v1/me/* endpoints reject unauthenticated requests with 401', async () => {
    for (const [handler, url, method] of [
      [profileRoute.GET, 'http://localhost/api/v1/me/profile', 'GET'],
      [profileRoute.PUT, 'http://localhost/api/v1/me/profile', 'PUT'],
      [profileRoute.DELETE, 'http://localhost/api/v1/me/profile', 'DELETE'],
      [contactsRoute.GET, 'http://localhost/api/v1/me/contacts', 'GET'],
      [resumeRoute.GET, 'http://localhost/api/v1/me/resume', 'GET'],
      [photoRoute.GET, 'http://localhost/api/v1/me/photo', 'GET'],
      [experienceRoute.GET, 'http://localhost/api/v1/me/experience', 'GET'],
      [screeningRoute.GET, 'http://localhost/api/v1/me/screening-answers', 'GET'],
      [answerBankRoute.GET, 'http://localhost/api/v1/me/answer-bank', 'GET'],
    ]) {
      const res = await handler(new Request(url, { method }), { db });
      assert.equal(res.status, 401, `${method} ${url} must return 401`);
    }
  });

  await t.test('1. user_profiles: job_languages, c_level, eu/global regions, lowercase countries, and excluded_companies endpoints', async () => {
    // Reject non-curated specialization
    const badSpec = await profileRoute.PUT(
      new Request('http://localhost/api/v1/me/profile', {
        method: 'PUT',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          specializations: ['not_a_real_category'],
          skills: ['typescript'],
        }),
      }),
      { db }
    );
    assert.equal(badSpec.status, 400);

    // Reject invalid seniority
    const badSen = await profileRoute.PUT(
      new Request('http://localhost/api/v1/me/profile', {
        method: 'PUT',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          specializations: ['backend'],
          skills: ['go'],
          seniorities: ['grandmaster'],
        }),
      }),
      { db }
    );
    assert.equal(badSen.status, 400);

    // Partial empty save allowed (NextKinHR migration 0224) + empty location stored NULL
    const partialRes = await profileRoute.PUT(
      new Request('http://localhost/api/v1/me/profile', {
        method: 'PUT',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          specializations: [],
          skills: [],
        }),
      }),
      { db }
    );
    assert.equal(partialRes.status, 200);
    const partialBody = await partialRes.json();
    assert.equal(partialBody.profile.location_preferences, null);

    // Valid PUT with c_level, job_languages, eu/global regions, lowercase countries; excluded_companies ignored on PUT
    const validRes = await profileRoute.PUT(
      new Request('http://localhost/api/v1/me/profile', {
        method: 'PUT',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          specializations: ['backend', 'DevOps'],
          skills: ['Go', 'TypeScript', 'PostgreSQL'],
          seniorities: ['Senior', 'c_level'],
          excluded_skills: ['PHP', 'go', 'WordPress'],
          excluded_sources: ['Dice', 'Monster'],
          excluded_companies: ['Revature'],
          job_languages: ['EN', 'de'],
          location_preferences: {
            work_modes: ['remote', 'hybrid'],
            remote: { regions: ['North America', 'eu', 'global'], countries: ['US', 'DE'] },
            base: { country: 'US', city: 'Austin' },
            relocation: {
              open: true,
              regions: ['eu'],
              countries: ['NL', 'DE'],
              cities: ['Amsterdam', 'Berlin'],
            },
          },
        }),
      }),
      { db }
    );
    assert.equal(validRes.status, 200);
    const validJson = await validRes.json();
    const { profile } = validJson;

    assert.deepEqual(validJson.meta, { ignored_fields: ['excluded_companies'] });
    assert.deepEqual(profile.specializations, ['backend', 'devops']);
    assert.deepEqual(profile.skills, ['go', 'typescript', 'postgresql']);
    assert.deepEqual(profile.seniorities, ['senior', 'c_level']);
    assert.deepEqual(profile.excluded_skills, ['php', 'wordpress']); // 'go' stripped
    assert.deepEqual(profile.excluded_sources, ['dice', 'monster']);
    assert.deepEqual(profile.excluded_companies, []);
    assert.deepEqual(profile.job_languages, ['en', 'de']);
    assert.deepEqual(profile.location_preferences.remote, {
      regions: ['north_america', 'eu', 'global'],
      countries: ['us', 'de'],
    });

    // Dedicated company exclusion endpoints
    const excRes = await excludeCompRoute.POST(
      new Request('http://localhost/api/v1/me/profile/excluded-companies', {
        method: 'POST',
        headers: authHeaders(USER_1),
        body: JSON.stringify({ company_slug: 'Revature' }),
      }),
      { db }
    );
    assert.equal(excRes.status, 200);
    assert.deepEqual((await excRes.json()).profile.excluded_companies, ['revature']);

    const unexcRes = await unexcludeCompRoute.DELETE(
      new Request('http://localhost/api/v1/me/profile/excluded-companies/revature', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${USER_1}` },
      }),
      { params: Promise.resolve({ company_slug: 'revature' }), db }
    );
    assert.equal(unexcRes.status, 200);
    assert.deepEqual((await unexcRes.json()).profile.excluded_companies, []);
  });

  await t.test('2. Resume upload + Contacts (candidate_contacts) + Photo + Structured CV + PII omission in /me/profile', async () => {
    const sampleCv = `
Jane Marie Doe
jane.doe@example.com | (415) 555-9876 | Austin, TX
https://linkedin.com/in/janedoe
https://github.com/janedoe

PROFESSIONAL SUMMARY
Principal Backend Engineer with 9 years building distributed Go and TypeScript systems.

WORK EXPERIENCE
Principal Engineer - Acme Cloud Services, Austin, TX
2021-03 - Present
- Reduced API p99 latency by 45% across 120M daily requests using Go and PostgreSQL
- Scaled Kubernetes clusters to 500 nodes

EDUCATION
Master of Science in Computer Science - University of Texas at Austin
2016 - 2018

PROJECTS
Distributed Cache Engine
https://github.com/janedoe/dcache
- Achieved 99.98% hit rate under 10k rps synthetic benchmark

SKILLS
Go, TypeScript, PostgreSQL, Kubernetes, Docker

CERTIFICATIONS
AWS Certified Solutions Architect

LANGUAGES
English, Spanish
`;

    const uploadRes = await resumeRoute.POST(
      new Request('http://localhost/api/v1/me/resume', {
        method: 'POST',
        headers: authHeaders(USER_1),
        body: JSON.stringify({ raw_text: sampleCv, filename: 'jane_doe_cv.txt' }),
      }),
      { db }
    );
    assert.equal(uploadRes.status, 200);
    const upBody = await uploadRes.json();

    assert.equal(upBody.resume_object_key, `resumes/${USER_1}`);
    assert.ok(upBody.resume_uploaded_at);
    assert.ok(storageObjects.has(`resumes:resumes/${USER_1}`));

    // Education.year is PeriodDate, Project omits summary
    assert.ok(upBody.resume_structured.education[0].year);
    assert.equal(upBody.resume_structured.education[0].year.year, 2018);
    assert.equal(upBody.resume_structured.projects[0].summary, undefined);

    // Check public.users view exposes NextKinHR extract status & geography columns
    const usersRes = await db.query(
      `SELECT resume_object_key, resume_extract_status, resume_countries, candidate_contacts
       FROM public.users WHERE id = $1`,
      [USER_1]
    );
    assert.equal(usersRes.rows[0].resume_object_key, `resumes/${USER_1}`);
    assert.equal(usersRes.rows[0].resume_extract_status, 'ok');
    assert.deepEqual(usersRes.rows[0].resume_countries, ['us']);
    assert.equal(usersRes.rows[0].candidate_contacts.email, 'jane.doe@example.com');

    // GET /me/profile returns NextKinHR `cv` block with `location` but omits PII (`email`, `phone`, `links`, `full_name`)
    const getProfRes = await profileRoute.GET(
      new Request('http://localhost/api/v1/me/profile', {
        headers: { Authorization: `Bearer ${USER_1}` },
      }),
      { db }
    );
    assert.equal(getProfRes.status, 200);
    const profBody = await getProfRes.json();
    assert.equal(profBody.cv.full_name, undefined);
    assert.equal(profBody.cv.email, undefined);
    assert.equal(profBody.cv.phone, undefined);
    assert.equal(profBody.cv.links, undefined);
    assert.equal(profBody.cv.location, 'Austin, TX');
    assert.deepEqual(profBody.derived_location, {
      countries: ['us'],
      regions: ['north_america'],
      cities: ['Austin'],
    });

    // Headshot photo upload (photos/<userID>)
    const form = new FormData();
    form.append('photo', new File([new Uint8Array([137, 80, 78, 71])], 'headshot.png', { type: 'image/png' }));
    const photoRes = await photoRoute.PUT(
      new Request('http://localhost/api/v1/me/photo', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${USER_1}` },
        body: form,
      }),
      { db }
    );
    assert.equal(photoRes.status, 200);
    assert.equal((await photoRes.json()).photo_object_key, `photos/${USER_1}`);
    assert.ok(storageObjects.has(`photos:photos/${USER_1}`));
  });

  await t.test('3. Experience Bank: experience_atoms (nullable employment_id, metrics text[], claim_key, merge, owner CRUD)', async () => {
    const listRes = await experienceRoute.GET(
      new Request('http://localhost/api/v1/me/experience', {
        headers: { Authorization: `Bearer ${USER_1}` },
      }),
      { db }
    );
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.ok(listBody.employments.length >= 1);
    const empId = listBody.employments[0].id;

    // Project kind emits `name` on wire
    const projEmp = listBody.employments.find((e) => e.kind === 'project');
    assert.ok(projEmp?.name);
    assert.equal(projEmp?.company, undefined);

    // Create an unplaced atom (employment_id null)
    const unplacedRes = await experienceRoute.POST(
      new Request('http://localhost/api/v1/me/experience', {
        method: 'POST',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          claim: 'Led cross-functional incident response tabletops',
          context: 'Quarterly resilience drills across 6 teams',
          metrics: ['45m MTTR reduction'],
          skills: ['incident-response'],
          provenance: 'stated_in_chat',
        }),
      }),
      { db }
    );
    assert.equal(unplacedRes.status, 201);
    const unplacedAtom = (await unplacedRes.json()).atom;
    assert.equal(unplacedAtom.employment_id, null);

    // Append an agent_inferred atom with array metrics[]
    const infRes = await experienceRoute.POST(
      new Request('http://localhost/api/v1/me/experience', {
        method: 'POST',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          type: 'atom',
          employment_id: empId,
          claim: 'Migrated billing pipeline to event-driven workers',
          context: 'Using Kafka',
          metrics: ['99.99% uptime', '$180k/yr infra savings'],
          skills: ['Go', 'Kafka'],
          provenance: 'agent_inferred',
        }),
      }),
      { db }
    );
    assert.equal(infRes.status, 201);
    const atom1 = (await infRes.json()).atom;
    assert.deepEqual(atom1.metrics, ['99.99% uptime', '$180k/yr infra savings']);
    assert.equal(experienceLib.canWriteToTailoredCv('agent_inferred'), false);

    // Confirm upgrade via manual same-claim insert (NextKinHR 0047/queries/experience.sql ON CONFLICT upgrade)
    const upgradeRes = await experienceRoute.POST(
      new Request('http://localhost/api/v1/me/experience', {
        method: 'POST',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          type: 'atom',
          employment_id: empId,
          claim: 'Migrated billing pipeline to event-driven workers!',
          context: 'Confirmed context',
          metrics: [],
          provenance: 'manual',
        }),
      }),
      { db }
    );
    assert.equal(upgradeRes.status, 201);
    const upgraded = (await upgradeRes.json()).atom;
    assert.equal(upgraded.id, atom1.id);
    assert.equal(upgraded.provenance, 'manual');
    assert.deepEqual(upgraded.metrics, ['99.99% uptime', '$180k/yr infra savings']);

    // Add second atom under empId & merge
    const a2Res = await experienceRoute.POST(
      new Request('http://localhost/api/v1/me/experience', {
        method: 'POST',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          type: 'atom',
          employment_id: empId,
          claim: 'Reduced billing worker memory footprint',
          metrics: ['35% RAM reduction'],
          skills: ['rust'],
          provenance: 'manual',
        }),
      }),
      { db }
    );
    const atom2 = (await a2Res.json()).atom;

    const mergedRes = await mergeRoute.POST(
      new Request('http://localhost/api/v1/me/experience/atoms/merge', {
        method: 'POST',
        headers: authHeaders(USER_1),
        body: JSON.stringify({ ids: [atom1.id, atom2.id] }),
      }),
      { db }
    );
    assert.equal(mergedRes.status, 200);
    const kept = (await mergedRes.json()).data;
    assert.equal(kept.id, atom1.id);
    assert.ok(kept.metrics.includes('35% RAM reduction'));
    assert.ok(kept.metrics.includes('99.99% uptime'));

    // Owner PUT/DELETE routes work directly on experience_employments & experience_atoms
    const updEmp = await empItemRoute.PUT(
      new Request(`http://localhost/api/v1/me/experience/employments/${empId}`, {
        method: 'PUT',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          kind: 'job',
          company: 'Acme Cloud Services Updated',
          role: 'Staff Engineer',
          start: { year: 2021, month: 3 },
          current: true,
        }),
      }),
      { params: Promise.resolve({ id: empId }), db }
    );
    assert.equal(updEmp.status, 200);
    assert.equal((await updEmp.json()).data.company, 'Acme Cloud Services Updated');

    const delAtom = await atomItemRoute.DELETE(
      new Request(`http://localhost/api/v1/me/experience/atoms/${unplacedAtom.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${USER_1}` },
      }),
      { params: Promise.resolve({ id: unplacedAtom.id }), db }
    );
    assert.equal(delAtom.status, 204);
  });

  await t.test('4. Screening Answers (privacy_consent, lowercase countries, clear[]) & Answer Bank', async () => {
    const put1 = await screeningRoute.PUT(
      new Request('http://localhost/api/v1/me/screening-answers', {
        method: 'PUT',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          authorized_countries: ['US', 'GB'],
          visa_sponsorship_needed: false,
          desired_salary_amount: 185000,
          desired_salary_currency: 'usd',
          desired_salary_period: 'year',
          privacy_consent: true,
        }),
      }),
      { db }
    );
    assert.equal(put1.status, 200);
    const s1 = (await put1.json()).screening_answers;
    assert.deepEqual(s1.authorized_countries, ['us', 'gb']);
    assert.equal(s1.desired_salary_amount, 185000);
    assert.equal(s1.desired_salary_currency, 'USD');
    assert.equal(s1.desired_salary_period, 'year');
    assert.equal(s1.privacy_consent, true);

    // Clear individual field via NextKinHR `clear` list + set remaining fields
    const put2 = await screeningRoute.PUT(
      new Request('http://localhost/api/v1/me/screening-answers', {
        method: 'PUT',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          notice_period_days: 14,
          willing_to_relocate: true,
          age_18_or_older: true,
          clear: ['visa_sponsorship_needed'],
        }),
      }),
      { db }
    );
    assert.equal(put2.status, 200);
    const s2 = (await put2.json()).screening_answers;
    assert.equal(s2.visa_sponsorship_needed, null);
    assert.equal(s2.notice_period_days, 14);
    assert.equal(s2.privacy_consent, true);

    // Period 'week' is rejected in NextKinHR (only year/month/day/hour)
    const badPeriod = await screeningRoute.PUT(
      new Request('http://localhost/api/v1/me/screening-answers', {
        method: 'PUT',
        headers: authHeaders(USER_1),
        body: JSON.stringify({ desired_salary_period: 'week' }),
      }),
      { db }
    );
    assert.equal(badPeriod.status, 400);

    // Country-scoped work auth check
    assert.equal(screeningLib.checkCountryWorkAuthorization(s2, 'us'), true);
    assert.equal(screeningLib.checkCountryWorkAuthorization(s2, 'ca'), null);

    // Answer bank topic folding & candidate provenance enforcement (ignores agent_inferred in body)
    assert.equal(
      answerBankLib.normalizeAnswerBankTopic('Please tell us your desired salary?'),
      'salary_expectation'
    );
    assert.equal(
      answerBankLib.normalizeAnswerBankTopic('Please tell us about your Café architecture!'),
      'about your cafe architecture'
    );

    const abRes = await answerBankRoute.POST(
      new Request('http://localhost/api/v1/me/answer-bank', {
        method: 'POST',
        headers: authHeaders(USER_1),
        body: JSON.stringify({
          question: 'Please tell us your desired salary?',
          answer: '$185,000 USD per year',
          provenance: 'agent_inferred', // must be ignored on /me/answer-bank -> stored 'candidate'
        }),
      }),
      { db }
    );
    assert.equal(abRes.status, 200);
    assert.equal((await abRes.json()).entry.provenance, 'candidate');

    const answerBankUrl = 'http://localhost/api/v1/me/answer-bank';
    const extensionOrigin = 'chrome-extension://ebhfafmnihndlaoibgjnfjhkjlnaencj';
    const preflight = answerBankRoute.OPTIONS(new Request(answerBankUrl, {
      method: 'OPTIONS',
      headers: { Origin: extensionOrigin, 'Access-Control-Request-Method': 'PUT' },
    }));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), extensionOrigin);
    assert.match(preflight.headers.get('access-control-allow-methods'), /\bPUT\b/);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);

    const update = await answerBankRoute.PUT(new Request(answerBankUrl, {
      method: 'PUT',
      headers: { ...authHeaders(USER_1), Origin: extensionOrigin },
      body: JSON.stringify({ question: 'Please tell us your desired salary?', answer: '190000 USD per year' }),
    }), { db });
    assert.equal(update.status, 200);
    assert.equal(update.headers.get('access-control-allow-origin'), extensionOrigin);
    const updated = await update.json();
    assert.equal(updated.ok, true);
    assert.equal(updated.entry.answer, '190000 USD per year');

    // EEO & cross-country work-auth yes/no blocked
    const eeoBlocked = await answerBankRoute.POST(
      new Request('http://localhost/api/v1/me/answer-bank', {
        method: 'POST',
        headers: authHeaders(USER_1),
        body: JSON.stringify({ question: 'What is your gender?', answer: 'Prefer not to say' }),
      }),
      { db }
    );
    assert.equal(eeoBlocked.status, 422);
  });

  await t.test('5. Postgres RLS enforces strict per-user isolation across NextKinHR 1:1 tables and public.users', async () => {
    await db.exec('BEGIN');
    await db.exec(`SET LOCAL ROLE authenticated`);
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${USER_2}', true)`);

    const up = await db.query(`SELECT * FROM public.user_profiles`);
    const exp = await db.query(`SELECT * FROM public.experience_employments`);
    const atoms = await db.query(`SELECT * FROM public.experience_atoms`);
    const sa = await db.query(`SELECT * FROM public.screening_answers`);
    const ab = await db.query(`SELECT * FROM public.screening_answer_bank`);
    const usr = await db.query(`SELECT id FROM public.users`);

    assert.equal(up.rows.length, 0);
    assert.equal(exp.rows.length, 0);
    assert.equal(atoms.rows.length, 0);
    assert.equal(sa.rows.length, 0);
    assert.equal(ab.rows.length, 0);
    assert.deepEqual(usr.rows.map((r) => r.id), [USER_2]);
    await db.exec('ROLLBACK');
  });

  await t.test('6. DELETE /api/v1/me/resume preserves candidate_contacts and DELETE /api/v1/me/profile cleans up', async () => {
    const delResume = await resumeRoute.DELETE(
      new Request('http://localhost/api/v1/me/resume', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${USER_1}` },
      }),
      { db }
    );
    assert.equal(delResume.status, 200);
    assert.equal(storageObjects.has(`resumes:resumes/${USER_1}`), false);

    // candidate_contacts preserved after ClearUserResume (matching NextKinHR ClearUserResume)
    const afterDel = await contactsRoute.GET(
      new Request('http://localhost/api/v1/me/contacts', {
        headers: { Authorization: `Bearer ${USER_1}` },
      }),
      { db }
    );
    assert.equal((await afterDel.json()).contacts.email, 'jane.doe@example.com');

    const delProfile = await profileRoute.DELETE(
      new Request('http://localhost/api/v1/me/profile', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${USER_1}` },
      }),
      { db }
    );
    assert.equal(delProfile.status, 200);

    const afterGet = await profileRoute.GET(
      new Request('http://localhost/api/v1/me/profile', {
        headers: { Authorization: `Bearer ${USER_1}` },
      }),
      { db }
    );
    assert.equal((await afterGet.json()).profile, null);
  });
});
