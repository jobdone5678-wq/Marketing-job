import test from 'node:test';
import assert from 'node:assert/strict';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';
test('application resume migration restricts access to service role and supports arbitrary distinct job snapshots',async()=>{
 const db=await recruitingDatabase(['20261019000100_application_resume_versions.sql']);
 try{
  const privileges=await db.query("SELECT has_table_privilege('authenticated','public.application_resume_versions','SELECT') client_read,has_table_privilege('authenticated','public.application_resume_versions','INSERT') client_write,has_table_privilege('service_role','public.application_resume_versions','INSERT') service_write");
  assert.deepEqual(privileges.rows[0],{client_read:false,client_write:false,service_write:true});
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.application_resume_versions'::regclass")).rows[0].relrowsecurity,true);
  const actor='10000000-0000-4000-8000-000000000301';await db.query("INSERT INTO auth.users VALUES($1,'fixture@example.test','{}')",[actor]);
  await db.query("INSERT INTO candidates(id,user_id,full_name) VALUES($1,$1,'Fixture Candidate')",[actor]);
  for(let n=1;n<=12;n++)await db.query("INSERT INTO application_resume_versions(actor_id,candidate_id,candidate_version,candidate_hash,scope_key,job_title,company_name,job_url,job_description,result) VALUES($1,$1,1,$2,$3,'Engineer','Company','https://jobs.test/'||$4,'Python development and SQL services','{}')",[actor,'a'.repeat(64),String(n).padStart(64,'0'),String(n)]);
  assert.equal((await db.query('SELECT count(*)::int count FROM application_resume_versions')).rows[0].count,12);
  await assert.rejects(db.query("INSERT INTO application_resume_versions SELECT gen_random_uuid(),actor_id,candidate_id,candidate_version,candidate_hash,scope_key,job_title,company_name,job_url,job_description,result,created_at FROM application_resume_versions LIMIT 1"),/unique/i);
 }finally{await db.close();}
});
