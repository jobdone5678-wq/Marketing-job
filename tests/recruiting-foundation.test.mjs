import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
let db;
const user='10000000-0000-0000-0000-000000000051';
before(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  const base=await readFile(new URL('../supabase/migrations/20261006_bench_marketing_schema.sql',import.meta.url),'utf8');
  await db.exec(base.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',''));
  await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;');
  for(const file of ['20261008_email_confirmation_capture.sql','20261009000100_foundation.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.query(`INSERT INTO auth.users VALUES($1,'candidate@example.test','{"role":"client"}')`,[user]);
});
after(async()=>{await db?.close();});
test('a confirmed candidate is saved durably with unknown facts and server ownership',async()=>{
  const data=await db.query(`SELECT save_candidate_profile($1,NULL,NULL,$2::jsonb) AS id`,[user,JSON.stringify({full_name:'Synthetic Candidate',primary_skills:'SQL'})]);
  const id=data.rows[0].id;
  const row=(await db.query('SELECT * FROM candidates WHERE id=$1',[id])).rows[0];
  assert.equal(row.user_id,user);assert.equal(row.visa_status,null);assert.equal(row.authorized_in_usa,null);
  assert.equal(row.expected_salary,null);assert.equal(row.provenance_status,'confirmed');
  await assert.rejects(db.query(`SELECT save_candidate_profile($1,$2,0,$3::jsonb)`,[user,id,JSON.stringify({full_name:'Wrong version'})]),/changed/);
});
test('candidate owners cannot reassign identity or grant provenance through direct writes',async()=>{
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${user}';`);
  try {await assert.rejects(db.query(`UPDATE candidates SET assigned_recruiter_id=$1 WHERE user_id=$1`,[user]),/protected|permission/);}
  finally{await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');}
});
test('database profile permissions fail closed instead of trusting metadata',async()=>{
  const {profileAccess}=await import('../src/lib/auth/profile-access.ts');
  assert.equal(profileAccess(null,'staff'),false);
  assert.equal(profileAccess({role:'recruiter',status:'pending'},'staff'),false);
  assert.equal(profileAccess({role:'client',status:'active'},'candidate_or_staff'),true);
});
