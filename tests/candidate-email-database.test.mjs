import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';
test('candidate and recruiter mailbox receipts link one owned application without leaking other candidates',async()=>{
 const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(n=>(/^20261009\d{6}_|^20261011\d{6}_/.test(n))&&!n.includes('foundation')).sort();
 const db=await recruitingDatabase([...files,'202610120001_submission_actor_integrity.sql','20261014000200_candidate_email_capture.sql']);
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',staff='10000000-0000-4000-8000-000000000003';
 try{
 for(const [id,email] of [[owner,'owner@example.test'],[other,'other@example.test'],[staff,'staff@example.test']])await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[id,email,{}]);
 await db.query("UPDATE profiles SET role='recruiter',status='active' WHERE id=$1",[staff]);
 const own=(await db.query("INSERT INTO candidates(full_name,user_id,assigned_recruiter_id) VALUES('Own',$1,$2) RETURNING id",[owner,staff])).rows[0].id;
 const foreign=(await db.query("INSERT INTO candidates(full_name,user_id) VALUES('Other',$1) RETURNING id",[other])).rows[0].id;
 async function receipt(actor,key){return (await db.query("INSERT INTO email_receipts(owner_id,message_key,source,sender,subject,received_at,body_text,review_reason) VALUES($1,$2,'manual_import','careers@example.test','Receipt',now(),'Receipt','Review') RETURNING id",[actor,key])).rows[0].id;}
 const first=await receipt(owner,'first');
 await assert.rejects(db.query("SELECT confirm_email_receipt($1,$2,$3,'Acme','Engineer',NULL,true)",[owner,first,foreign]),/Candidate access denied/);
 const app=(await db.query("SELECT confirm_email_receipt($1,$2,$3,'Acme','Engineer',NULL,true) id",[owner,first,own])).rows[0].id;
 const submission=(await db.query('SELECT * FROM job_submissions WHERE id=$1',[app])).rows[0];assert.equal(submission.recruiter_id,null);assert.equal(submission.technical_recruiter_id,null);assert.equal(submission.capture_status,'confirmed');
 const second=await receipt(staff,'staff');
 assert.equal((await db.query("SELECT confirm_email_receipt($1,$2,$3,'Acme','Engineer',NULL,true) id",[staff,second,own])).rows[0].id,app);
 assert.equal((await db.query('SELECT count(*)::int n FROM job_submissions')).rows[0].n,1);
 const connection=(await db.query("INSERT INTO email_connections(owner_id,provider,mailbox_email,refresh_token_encrypted) VALUES($1,'gmail','owner@example.test','encrypted') RETURNING id",[owner])).rows[0].id;
 assert.ok((await db.query('SELECT * FROM eligible_email_connections()')).rows.some(r=>r.owner_id===owner));
 const lease='20000000-0000-4000-8000-000000000001';
 assert.equal((await db.query('SELECT * FROM claim_email_sync($1,$2,$3)',[connection,owner,lease])).rows.length,1);
 const payload={candidate_id:own,submission_id:app,sender:'careers@example.test',recipients:['owner@example.test'],subject:'Receipt',received_at:new Date().toISOString(),body_text:'Receipt',review_reason:'Match',extracted_company:'Acme',extracted_job_title:'Engineer'};
 await assert.rejects(db.query('SELECT * FROM ingest_mailbox_receipt($1,$2,$3,$4,$5,true)',[owner,connection,lease,'bad',{...payload,candidate_id:foreign}]),/Candidate access denied/);
 const saved=await db.query('SELECT * FROM ingest_mailbox_receipt($1,$2,$3,$4,$5,true)',[owner,connection,lease,'gmail:one',payload]);assert.equal(saved.rows[0].disposition,'confirmed');
 assert.equal((await db.query('SELECT * FROM ingest_mailbox_receipt($1,$2,$3,$4,$5,true)',[owner,connection,lease,'gmail:one',payload])).rows[0].duplicate,true);
 assert.equal((await db.query('SELECT count(*)::int n FROM job_submissions')).rows[0].n,1);
 await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}'`);
 assert.equal((await db.query('SELECT * FROM email_receipts')).rows.length,2);
 assert.equal((await db.query('SELECT id FROM email_connections')).rows.length,1);
 await assert.rejects(db.query('SELECT * FROM eligible_email_connections()'),/permission denied/);
 await db.exec('RESET ROLE;RESET request.jwt.claim.sub');
 await db.query("UPDATE profiles SET status='suspended' WHERE id=$1",[owner]);
 await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}'`);
 assert.equal((await db.query('SELECT * FROM email_receipts')).rows.length,0);
 }finally{await db.close();}
});
