import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';
const migrations=new URL('../supabase/migrations/',import.meta.url);
test('the deployable operations bundle applies after the existing schema and includes both new guards',async()=>{
 const prior=(await readdir(migrations)).filter(name=>/^20261009\d{6}_/.test(name)&&!name.includes('foundation')).sort();
 const db=await recruitingDatabase(prior);
 try{
  await db.exec(await readFile(new URL('../supabase/recruiting-operations-update.sql',import.meta.url),'utf8'));
  assert.equal((await db.query("SELECT to_regclass('public.oauth_registration_intents') relation")).rows[0].relation,'oauth_registration_intents');
  const publicUpdate=await readFile(new URL('../supabase/public-ai-update.sql',import.meta.url),'utf8');
  await db.exec(publicUpdate);await db.exec(publicUpdate);
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.import_public_vendors(jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("SELECT count(*)::int count FROM pg_proc WHERE proname IN ('correct_staff_account_role','register_new_oauth_staff')")).rows[0].count,2);
  const actorMigration=await readFile(new URL('202610120001_submission_actor_integrity.sql',migrations),'utf8');
  const incremental=await readFile(new URL('../supabase/recruiting-operations-2026-10-12.sql',import.meta.url),'utf8');
  assert.ok(incremental.includes(actorMigration.trim()));
  assert.ok(incremental.includes((await readFile(new URL('20261011001100_oauth_staff_registration.sql',migrations),'utf8')).trim()));
 }finally{await db.close();}
});
