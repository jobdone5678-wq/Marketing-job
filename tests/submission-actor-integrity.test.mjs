import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';

let db, candidate, secondCandidate;
const admin='10000000-0000-0000-0000-000000000301';
const staff='10000000-0000-0000-0000-000000000302';
const technical='10000000-0000-0000-0000-000000000303';
before(async()=>{
  const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(name=>/^20261009\d{6}_|^20261011\d{6}_|^202610120001_/.test(name)&&!name.includes('foundation')).sort();
  db=await recruitingDatabase(files);
  await db.query(`INSERT INTO auth.users VALUES($1,'actor-admin@example.test','{"role":"client"}'),($2,'actor-staff@example.test','{"role":"recruiter"}'),($3,'actor-tech@example.test','{"role":"technical_recruiter"}')`,[admin,staff,technical]);
  await db.query(`UPDATE profiles SET status='active',role=CASE WHEN id=$1 THEN 'super_admin'::app_role ELSE role END`,[admin]);
  candidate=(await db.query(`SELECT save_candidate_profile($1,NULL,NULL,'{"full_name":"Actor fixture"}') id`,[admin])).rows[0].id;
  secondCandidate=(await db.query(`SELECT save_candidate_profile($1,NULL,NULL,'{"full_name":"Second actor fixture"}') id`,[admin])).rows[0].id;
  for(const id of [candidate,secondCandidate]){
    await db.query(`SELECT set_candidate_staff_assignment($1,$2,$3,'recruiter',true)`,[admin,id,staff]);
    await db.query(`SELECT set_candidate_staff_assignment($1,$2,$3,'technical_recruiter',true)`,[admin,id,technical]);
  }
});
after(async()=>{await db?.close();});
async function asActor(actor,work){
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${actor}';`);
  try{return await work();}finally{await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');}
}

test('manual submissions record the authenticated staff actor instead of supplied credit',async()=>{
  await asActor(staff,async()=>{
    const row=(await db.query(`INSERT INTO job_submissions(candidate_id,company_name,job_title,recruiter_id,technical_recruiter_id) VALUES($1,'Actor fixture','Engineer',$2,$3) RETURNING recruiter_id,technical_recruiter_id`,[candidate,admin,technical])).rows[0];
    assert.equal(row.recruiter_id,staff);
    assert.equal(row.technical_recruiter_id,null);
  });
  await asActor(technical,async()=>{
    const row=(await db.query(`INSERT INTO job_submissions(candidate_id,company_name,job_title) VALUES($1,'Technical fixture','Engineer') RETURNING recruiter_id,technical_recruiter_id`,[candidate])).rows[0];
    assert.equal(row.recruiter_id,null);
    assert.equal(row.technical_recruiter_id,technical);
  });
});

test('staff edits retain original actor and candidate while allowing ordinary status changes',async()=>{
  const submission=(await db.query(`INSERT INTO job_submissions(candidate_id,recruiter_id,company_name,job_title) VALUES($1,$2,'History fixture','Engineer') RETURNING id`,[candidate,staff])).rows[0].id;
  await asActor(staff,async()=>{
    await assert.rejects(db.query(`UPDATE job_submissions SET recruiter_id=$1 WHERE id=$2`,[admin,submission]),/attribution/i);
    await assert.rejects(db.query(`UPDATE job_submissions SET technical_recruiter_id=$1 WHERE id=$2`,[technical,submission]),/attribution/i);
    await assert.rejects(db.query(`UPDATE job_submissions SET candidate_id=$1 WHERE id=$2`,[secondCandidate,submission]),/attribution/i);
    const row=(await db.query(`UPDATE job_submissions SET status='Interview_Scheduled',notes='Interview agreed' WHERE id=$1 RETURNING status,recruiter_id,candidate_id`,[submission])).rows[0];
    assert.equal(row.status,'Interview_Scheduled');assert.equal(row.recruiter_id,staff);assert.equal(row.candidate_id,candidate);
  });
  await db.query(`SELECT set_candidate_staff_assignment($1,$2,$3,'recruiter',false)`,[admin,candidate,staff]);
  assert.equal((await db.query(`SELECT recruiter_id FROM job_submissions WHERE id=$1`,[submission])).rows[0].recruiter_id,staff);
});
