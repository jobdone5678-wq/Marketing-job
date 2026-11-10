import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';

test('incremental platform update applies to the existing operations schema',async()=>{
 const root=new URL('../supabase/migrations/',import.meta.url);
 const prior=(await readdir(root)).filter(name=>(/^20261009\d{6}_|^20261011\d{6}_/.test(name))&&!name.includes('foundation')).sort();
 const db=await recruitingDatabase([...prior,'202610120001_submission_actor_integrity.sql']);
 try{
  await db.exec(await readFile(new URL('../supabase/platform-fixes-2026-10-12.sql',import.meta.url),'utf8'));
  for(const name of ['service_enrollments','service_bills','service_receipts'])assert.equal((await db.query('SELECT to_regclass($1) relation',['public.'+name])).rows[0].relation,name);
  assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name IN ('posted_at','closes_at')")).rows[0].n,2);
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.claim_specific_task(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
