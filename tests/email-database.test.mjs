import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
const recruiter='10000000-0000-0000-0000-000000000001';
const other='10000000-0000-0000-0000-000000000002';
const candidate='20000000-0000-0000-0000-000000000001';
const receiptId='30000000-0000-0000-0000-000000000001';
const connectionId='40000000-0000-0000-0000-000000000001';

before(async()=>{
  db=new PGlite();
  // Minimal pre-existing schema, independently written to exercise the new real PostgreSQL migration.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TYPE app_role AS ENUM ('super_admin','recruiter','client');
    CREATE TYPE account_status AS ENUM ('active','pending','suspended');
    CREATE TYPE submission_status AS ENUM ('Applied','Vendor_Screening','Submitted_to_Client','Interview_Scheduled','Round_1','Round_2','Offer_Received','Rejected','No_Response');
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
    CREATE TABLE profiles(id uuid PRIMARY KEY,role app_role,status account_status,email text,full_name text,phone text);
    CREATE TABLE candidates(id uuid PRIMARY KEY);
    CREATE TABLE job_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_id uuid REFERENCES candidates(id),recruiter_id uuid,
      company_name text,job_title text,submission_date date,portal_source text,status submission_status,job_location text);
    CREATE FUNCTION get_current_role() RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT role FROM profiles WHERE id=auth.uid() LIMIT 1 $$;
    ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
    ALTER TABLE job_submissions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY staff_candidates ON candidates FOR ALL TO authenticated USING(get_current_role() IN ('recruiter','super_admin'));
    CREATE POLICY staff_submissions ON job_submissions FOR ALL TO authenticated USING(get_current_role() IN ('recruiter','super_admin'));
    GRANT USAGE ON SCHEMA public,auth TO authenticated;
    GRANT SELECT,INSERT,UPDATE ON profiles TO authenticated;
    GRANT SELECT,INSERT,UPDATE ON candidates,job_submissions TO authenticated;
    INSERT INTO profiles(id,role,status) VALUES ('${recruiter}','recruiter','active'),('${other}','recruiter','active');
    INSERT INTO candidates VALUES ('${candidate}');
  `);
  const migration=await readFile(new URL('../supabase/migrations/20261008_email_confirmation_capture.sql',import.meta.url),'utf8');
  await db.exec(migration);
  await db.query(`INSERT INTO email_connections(id,owner_id,provider,mailbox_email,refresh_token_encrypted) VALUES($1,$2,'gmail','recruiter@example.test','encrypted')`,[connectionId,recruiter]);
  await db.query(`INSERT INTO email_receipts(id,owner_id,message_key,source,sender,subject,received_at,body_text,review_reason)
    VALUES($1,$2,'first','manual_import','careers@example.test','Application received','2026-10-08T10:00:00Z','Synthetic application receipt','Needs review')`,[receiptId,recruiter]);
});
after(async()=>{await db?.close();});

test('a confirmation retry creates one application and one event atomically',async()=>{
  const args=[recruiter,receiptId,candidate,'Acme','Contract Engineer',null,true];
  const first=await db.query('SELECT confirm_email_receipt($1,$2,$3,$4,$5,$6,$7) AS id',args);
  const second=await db.query('SELECT confirm_email_receipt($1,$2,$3,$4,$5,$6,$7) AS id',args);
  assert.equal(first.rows[0].id,second.rows[0].id);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM job_submissions')).rows[0].count,1);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM email_confirmation_events')).rows[0].count,1);
  const saved=(await db.query('SELECT status,capture_status FROM job_submissions')).rows[0];
  assert.equal(saved.status,'Applied');assert.equal(saved.capture_status,'confirmed');
});

test('receipts for the same existing application preserve interview status',async()=>{
  await db.exec(`UPDATE job_submissions SET status='Interview_Scheduled';`);
  const next='30000000-0000-0000-0000-000000000002';
  await db.query(`INSERT INTO email_receipts(id,owner_id,message_key,source,sender,subject,received_at,body_text,review_reason)
    VALUES($1,$2,'second','manual_import','careers@example.test','Receipt',now(),'Receipt','Review')`,[next,recruiter]);
  await db.query('SELECT confirm_email_receipt($1,$2,$3,$4,$5,NULL,true)',[recruiter,next,candidate,'Acme','Contract Engineer']);
  assert.equal((await db.query('SELECT status FROM job_submissions')).rows[0].status,'Interview_Scheduled');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM job_submissions')).rows[0].count,1);
});

test('another recruiter cannot confirm someone else\'s receipt',async()=>{
  await assert.rejects(db.query('SELECT confirm_email_receipt($1,$2,$3,$4,$5,NULL,true)',[other,receiptId,candidate,'Acme','Contract Engineer']),/Receipt not found/);
});

test('candidate mismatch rolls back without confirming the receipt',async()=>{
  const next='30000000-0000-0000-0000-000000000003';
  await db.query(`INSERT INTO email_receipts(id,owner_id,message_key,source,sender,subject,received_at,body_text,review_reason)
    VALUES($1,$2,'third','manual_import','careers@example.test','Receipt',now(),'Receipt','Review')`,[next,recruiter]);
  await assert.rejects(db.query('SELECT confirm_email_receipt($1,$2,$3,$4,$5,NULL,true)',[recruiter,next,'20000000-0000-0000-0000-000000000099','Acme','Engineer']),/Candidate not found/);
  assert.equal((await db.query('SELECT disposition FROM email_receipts WHERE id=$1',[next])).rows[0].disposition,'needs_review');
});

test('RLS hides other recruiters\' private receipts and prevents secret reads',async()=>{
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${other}';`);
  try {
    assert.equal((await db.query('SELECT id FROM email_receipts')).rows.length,0);
    await assert.rejects(db.query('SELECT refresh_token_encrypted FROM email_connections'),/permission denied/);
    await assert.rejects(db.query('SELECT confirm_email_receipt($1,$2,$3,$4,$5,NULL,true)',[recruiter,receiptId,candidate,'Acme','Engineer']),/permission denied/);
  } finally {await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');}
});

test('an ordinary profile write cannot grant admin privilege',async()=>{
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${other}';`);
  try {await assert.rejects(db.query(`UPDATE profiles SET role='super_admin' WHERE id=$1`,[other]),/administrator operation/);}
  finally {await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');}
});

test('one worker holds the mailbox lease and another cannot claim concurrently',async()=>{
  const first=await db.query('SELECT id FROM claim_email_sync($1,$2,$3)',[connectionId,recruiter,'50000000-0000-0000-0000-000000000001']);
  const second=await db.query('SELECT id FROM claim_email_sync($1,$2,$3)',[connectionId,recruiter,'50000000-0000-0000-0000-000000000002']);
  assert.equal(first.rows.length,1);assert.equal(second.rows.length,0);
});

test('self-selected recruiter signup requires approval before mailbox access',async()=>{
  const newUser='10000000-0000-0000-0000-000000000009';
  await db.query(`INSERT INTO auth.users VALUES($1,'new@example.test','{"role":"recruiter","full_name":"New User"}')`,[newUser]);
  const profile=(await db.query('SELECT role,status FROM profiles WHERE id=$1',[newUser])).rows[0];
  assert.equal(profile?.role,'recruiter');assert.equal(profile?.status,'pending');
});

test('pending staff cannot read candidates or submissions through existing policies',async()=>{
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000009';`);
  try {
    assert.equal((await db.query('SELECT id FROM candidates')).rows.length,0);
    assert.equal((await db.query('SELECT id FROM job_submissions')).rows.length,0);
  } finally {await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');}
});

test('staff cannot forge confirmation fields through a browser database write',async()=>{
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${recruiter}';`);
  try {
    await assert.rejects(db.query(`UPDATE job_submissions SET email_confirmed_at=now()`),/confirmation evidence/);
    await assert.rejects(db.query(`INSERT INTO job_submissions(candidate_id,company_name,job_title,capture_status) VALUES($1,'Forged','Engineer','confirmed')`,[candidate]),/confirmation evidence/);
  } finally {await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');}
});

test('confirmed application evidence survives attempted submission deletion',async()=>{
  await assert.rejects(db.query('DELETE FROM job_submissions'),/foreign key constraint/);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM email_confirmation_events')).rows[0].count,2);
});

test('mailbox ingestion requires the live lease and stops after disconnect',async()=>{
  const payload={sender:'careers@acme.test',recipients:['alex@example.test'],subject:'Receipt',received_at:'2026-10-08T10:00:00Z',body_text:'Receipt',
    review_reason:'Exact match',candidate_id:candidate,extracted_company:'Acme',extracted_job_title:'Contract Engineer'};
  const lease='50000000-0000-0000-0000-000000000001';
  const args=[recruiter,connectionId,lease,'gmail:live',JSON.stringify(payload),true];
  const result=await db.query('SELECT * FROM ingest_mailbox_receipt($1,$2,$3,$4,$5::jsonb,$6)',args);
  assert.equal(result.rows[0].disposition,'confirmed');
  const duplicate=await db.query('SELECT * FROM ingest_mailbox_receipt($1,$2,$3,$4,$5::jsonb,$6)',args);
  assert.equal(duplicate.rows[0].duplicate,true);
  await db.query(`UPDATE email_connections SET status='disconnected',sync_lease_token=NULL WHERE id=$1`,[connectionId]);
  await assert.rejects(db.query('SELECT * FROM ingest_mailbox_receipt($1,$2,$3,$4,$5::jsonb,$6)',[recruiter,connectionId,lease,'gmail:after-disconnect',JSON.stringify(payload),true]),/active mailbox lease/);
  assert.equal((await db.query(`SELECT id FROM email_receipts WHERE message_key='gmail:after-disconnect'`)).rows.length,0);
});

test('scheduler rotates failed attempts and excludes inactive or leased mailboxes',async()=>{
  const first='40000000-0000-0000-0000-000000000010';
  const second='40000000-0000-0000-0000-000000000011';
  const suspended='40000000-0000-0000-0000-000000000012';
  await db.query(`INSERT INTO email_connections(id,owner_id,provider,mailbox_email,refresh_token_encrypted) VALUES
    ($1,$4,'gmail','first@example.test','encrypted'),($2,$4,'gmail','second@example.test','encrypted'),($3,$5,'gmail','inactive@example.test','encrypted')`,[first,second,suspended,recruiter,other]);
  await db.query(`UPDATE profiles SET status='suspended' WHERE id=$1`,[other]);
  await db.query(`SELECT * FROM claim_email_sync($1,$2,$3)`,[first,recruiter,'50000000-0000-0000-0000-000000000010']);
  await db.query(`UPDATE email_connections SET sync_lease_until=NULL,sync_lease_token=NULL WHERE id=$1`,[first]);
  const eligible=await db.query('SELECT * FROM eligible_email_connections()');
  assert.equal(eligible.rows[0].id,second);assert.ok(!eligible.rows.some(row=>row.id===suspended));
  await db.query(`SELECT * FROM claim_email_sync($1,$2,$3)`,[second,recruiter,'50000000-0000-0000-0000-000000000011']);
  assert.ok(!(await db.query('SELECT * FROM eligible_email_connections()')).rows.some(row=>row.id===second));
});
