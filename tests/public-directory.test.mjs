import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {moduleLoader} from './helpers/load-ts-module.mjs';

test('public catalogs contain primary source evidence and no invented commercial or personal data', () => {
  const load = moduleLoader();
  const {PUBLIC_JOB_BOARDS, PUBLIC_VENDORS, publicVendorRecord} = load('src/lib/public-directory.ts');
  assert.ok(PUBLIC_JOB_BOARDS.length >= 8);
  assert.ok(PUBLIC_VENDORS.length >= 5);
  assert.equal(new Set(PUBLIC_JOB_BOARDS.map(b => `${b.provider}/${b.board_slug}`)).size, PUBLIC_JOB_BOARDS.length);
  for (const board of PUBLIC_JOB_BOARDS) {
    const hosts={greenhouse:'job-boards.greenhouse.io',ashby:'jobs.ashbyhq.com',lever:'jobs.lever.co',smartrecruiters:'careers.smartrecruiters.com',breezy:`${board.board_slug}.breezy.hr`,remoteok:'remoteok.com'};
    const url=new URL(board.source_url);
    assert.equal(url.protocol,'https:');assert.equal(url.hostname,hosts[board.provider]);
    assert.match(board.board_slug, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
  }
  for (const vendor of PUBLIC_VENDORS) {
    const record = publicVendorRecord(vendor);
    assert.deepEqual(record.contacts, []);
    for (const field of ['tier', 'payment_terms', 'agreement_status', 'responsiveness', 'rating']) assert.equal(record[field], null);
    assert.ok(record.source_url.startsWith('https://'));
    assert.ok(record.careers_url.startsWith('https://'));
    assert.equal(record.public_directory_id, vendor.id);
  }
});

test('vendor import is idempotent and preserves edited and manually entered records', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.vendors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,data jsonb NOT NULL DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261014000300_public_vendor_import.sql', import.meta.url), 'utf8'));
    const load = moduleLoader();
    const {PUBLIC_VENDORS, publicVendorRecord} = load('src/lib/public-directory.ts');
    const entries = PUBLIC_VENDORS.slice(0, 2).map(publicVendorRecord);
    const run = async data => (await db.query('SELECT public.import_public_vendors($1::jsonb) AS result', [JSON.stringify(data)])).rows[0].result;
    assert.deepEqual(await run(entries), {imported:2, skipped:0});
    await db.exec("UPDATE public.vendors SET name='Staff edited name',data=data || '{\"notes\":\"Keep staff notes\",\"rating\":5}'::jsonb WHERE data->>'public_directory_id'='teksystems'");
    assert.deepEqual(await run(entries), {imported:0, skipped:2});
    const edited = (await db.query("SELECT name,data FROM public.vendors WHERE data->>'public_directory_id'='teksystems'")).rows[0];
    assert.equal(edited.name, 'Staff edited name');
    assert.equal(edited.data.notes, 'Keep staff notes');
    assert.equal(edited.data.rating, 5);
    await db.query('INSERT INTO public.vendors(name,data) VALUES($1,$2::jsonb)', ['Manual partner', JSON.stringify({website: PUBLIC_VENDORS[2].website + '/about', notes:'Manual'})]);
    assert.deepEqual(await run([publicVendorRecord(PUBLIC_VENDORS[2])]), {imported:0, skipped:1});
    await db.exec('SET ROLE authenticated');
    await assert.rejects(run(entries), /permission denied/);
  } finally { await db.close(); }
});

test('live persistence creates catalog source IDs and surfaces database failures', async () => {
  const writes = [];
  const db = {from(table) {
    const query = {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'saved-source'},error:null}),
      upsert:async(data, options)=>{writes.push({table,data,options});return {error:table === 'jobs' && data.some(row => row.title === 'fail') ? new Error('database write failed') : null};}};
    return query;
  }};
  const load = moduleLoader({'@/lib/db/admin':{database:()=>db,checkDb:error=>{if(error)throw error;}}});
  const {persistLiveJobs} = load('src/lib/jobs/live-persistence.ts');
  const board = {provider:'ashby',board_slug:'notion',company:'Notion'};
  assert.equal(await persistLiveJobs(board, 'actor', [{title:'Engineer', external_id:'job'}], true), 1);
  assert.equal(writes[0].table, 'job_sources');
  assert.equal(writes[0].options.ignoreDuplicates, true);
  assert.equal(writes[1].data[0].source_id, 'saved-source');
  await assert.rejects(persistLiveJobs({...board,id:'saved-source'}, 'actor', [{title:'fail'}]), /database write failed/);
  writes.length = 0;
  await persistLiveJobs(board, 'candidate', Array.from({length:205},(_,id)=>({title:'Engineer',external_id:String(id)})));
  assert.deepEqual(writes.map(write => write.table), ['job_sources','jobs','jobs','jobs']);
  assert.equal(writes[0].options.ignoreDuplicates,true);
  assert.deepEqual(writes.slice(1).map(write => write.data.length), [100,100,5]);
  const missing = moduleLoader({'@/lib/db/admin':{database:()=>({from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null}),upsert(){throw new Error('Unauthorized source registration');}})}),checkDb:error=>{if(error)throw error;}}})('src/lib/jobs/live-persistence.ts');
  await assert.rejects(missing.persistLiveJobs({...board,board_slug:'unlisted-board'},'candidate',[{title:'Engineer'}]),/Ask a recruiter/);
});

test('public vendor API permits only authorized staff and curated company IDs', async () => {
  let authorized = true;
  const calls = [];
  class CaptureError extends Error {constructor(message,status=400){super(message);this.status=status;}}
  const load = moduleLoader({
    '@/lib/auth/require-profile':{requireProfile:async access => {assert.equal(access,'staff'); if (!authorized) throw new CaptureError('Forbidden',403); return {id:'actor'};}},
    '@/lib/db/admin':{CaptureError,checkDb:error=>{if(error)throw error;},requireSameOrigin(){},errorResponse:error=>Response.json({error:error.message},{status:error.status || 500}),database:()=>({rpc:async (name,args) => {calls.push({name,args});return {data:{imported:1,skipped:0},error:null};}})},
  });
  const {POST} = load('src/app/api/vendors/import-public/route.ts');
  const request = ids => new Request('https://portal.test/api/vendors/import-public',{method:'POST',body:JSON.stringify({ids})});
  assert.equal((await POST(request(['teksystems','teksystems']))).status,200);
  assert.equal(calls[0].args.p_entries.length,1);
  assert.equal((await POST(request(['arbitrary-company']))).status,400);
  authorized = false;
  assert.equal((await POST(request(['teksystems']))).status,403);
  assert.equal(calls.length,1);
});
