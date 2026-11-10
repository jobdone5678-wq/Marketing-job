import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('email migration integrates with actual prior schema and closes pending staff access',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    const base=await readFile(new URL('../supabase/migrations/20261006_bench_marketing_schema.sql',import.meta.url),'utf8');
    // PGlite lacks this unused extension. All tables, functions, policies, triggers and defaults are unchanged.
    await db.exec(base.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',''));
    await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;');
    const migration=await readFile(new URL('../supabase/migrations/20261008_email_confirmation_capture.sql',import.meta.url),'utf8');
    await db.exec(migration);
    const user='10000000-0000-0000-0000-000000000019';
    await db.query(`INSERT INTO auth.users VALUES($1,'fixture@example.test','{"role":"recruiter"}')`,[user]);
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${user}';`);
    assert.equal((await db.query('SELECT id FROM candidates')).rows.length,0);
    await assert.rejects(db.query(`UPDATE profiles SET status='active' WHERE id=$1`,[user]),/administrator operation/);
    await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');
    await db.query(`UPDATE profiles SET status='active' WHERE id=$1`,[user]);
    const candidate=(await db.query("INSERT INTO candidates(full_name) VALUES('Synthetic candidate') RETURNING id")).rows[0].id;
    const receipt=(await db.query(`INSERT INTO email_receipts(owner_id,message_key,source,sender,subject,received_at,body_text,review_reason)
      VALUES($1,'full-schema','manual_import','fixture@example.test','Receipt',now(),'Synthetic receipt','Review') RETURNING id`,[user])).rows[0].id;
    await db.query(`SELECT confirm_email_receipt($1,$2,$3,'Fixture Company','Contract Engineer',NULL,true)`,[user,receipt,candidate]);
    const application=(await db.query(`SELECT status,capture_status,job_location FROM job_submissions WHERE company_name='Fixture Company'`)).rows[0];
    assert.equal(application.status,'Applied');assert.equal(application.capture_status,'confirmed');assert.equal(application.job_location,null);
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${user}';`);
    await assert.rejects(db.query(`UPDATE job_submissions SET capture_status='submitted' WHERE company_name='Fixture Company'`),/confirmation evidence/);
  } finally {await db.close();}
});
