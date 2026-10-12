import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';
import {generateSalaryPeriod, generateCandidateCalendarPeriod} from '../src/lib/payroll/periods.ts';

let db;
const admin='10000000-0000-0000-0000-000000000101';
const staff='10000000-0000-0000-0000-000000000102';
const technical='10000000-0000-0000-0000-000000000103';
const candidateOwner='10000000-0000-0000-0000-000000000104';
before(async()=>{
  const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(name=>/^20261009\d{6}_|^20261011\d{6}_/.test(name)&&!name.includes('foundation')).sort();
  db=await recruitingDatabase(files);
  await db.query(`INSERT INTO auth.users VALUES($1,'admin@example.test','{"role":"client"}'),($2,'staff@example.test','{"role":"recruiter"}'),($3,'tech@example.test','{"role":"technical_recruiter"}'),($4,'candidate@example.test','{"role":"client"}')`,[admin,staff,technical,candidateOwner]);
  await db.query(`UPDATE profiles SET role='super_admin',status='active' WHERE id=$1`,[admin]);
  await db.query(`UPDATE profiles SET status='active' WHERE id=$1`,[staff]);
});
after(async()=>{await db?.close();});

test('salary anniversaries keep the original joining day through short and leap months',()=>{
  assert.deepEqual(generateSalaryPeriod('2024-01-31',0),{startDate:'2024-01-31',endDateExclusive:'2024-02-29'});
  assert.deepEqual(generateSalaryPeriod('2024-01-31',1),{startDate:'2024-02-29',endDateExclusive:'2024-03-31'});
  assert.deepEqual(generateSalaryPeriod('2025-01-31',1),{startDate:'2025-02-28',endDateExclusive:'2025-03-31'});
  assert.deepEqual(generateCandidateCalendarPeriod('2026-10-15','2026-10-01','2026-11-12'),{startDate:'2026-10-15',endDate:'2026-10-31'});
  assert.deepEqual(generateCandidateCalendarPeriod('2026-10-15','2026-11-01','2026-11-12'),{startDate:'2026-11-01',endDate:'2026-11-12'});
});

test('pending technical staff are denied and assignments retain their history on removal',async()=>{
  const candidate=(await db.query(`SELECT save_candidate_profile($1,NULL,NULL,'{"full_name":"Operations fixture"}') id`,[candidateOwner])).rows[0].id;
  await assert.rejects(db.query(`SELECT set_candidate_staff_assignment($1,$2,$3,'technical_recruiter',true)`,[admin,candidate,technical]),/active/);
  await db.query(`UPDATE profiles SET status='active' WHERE id=$1`,[technical]);
  await db.query(`SELECT set_candidate_staff_assignment($1,$2,$3,'technical_recruiter',true)`,[admin,candidate,technical]);
  assert.equal((await db.query(`SELECT candidate_actor_can_access($1,$2) allowed`,[technical,candidate])).rows[0].allowed,true);
  await db.query(`SELECT set_candidate_staff_assignment($1,$2,$3,'technical_recruiter',false)`,[admin,candidate,technical]);
  assert.equal((await db.query(`SELECT candidate_actor_can_access($1,$2) allowed`,[technical,candidate])).rows[0].allowed,false);
  assert.equal((await db.query(`SELECT count(*)::int count FROM candidate_staff_assignments WHERE candidate_id=$1 AND ended_at IS NOT NULL`,[candidate])).rows[0].count,1);
});

test('manual final salary adjustment survives refresh, partial payments and corrections are auditable',async()=>{
  const employment=(await db.query(`SELECT save_staff_employment($1,$2,'2024-01-31','2024-03-10','manual',1000,'USD','2024-01-31') result`,[admin,staff])).rows[0].result;
  const periods=(await db.query(`SELECT id,start_date::text,end_date_exclusive::text,status FROM staff_salary_periods WHERE employment_id=$1 ORDER BY period_index`,[employment.id])).rows;
  assert.equal(periods.length,2);
  assert.equal(periods[0].start_date,'2024-01-31');assert.equal(periods[0].end_date_exclusive,'2024-02-29');
  assert.equal(periods[1].end_date_exclusive,'2024-03-11');assert.equal(periods[1].status,'awaiting_adjustment');
  await db.query(`SELECT adjust_staff_salary_period($1,$2,400,'Agreed final period amount')`,[admin,periods[1].id]);
  await db.query(`SELECT sync_staff_salary_periods($1)`,[employment.id]);
  assert.equal(Number((await db.query(`SELECT amount FROM staff_salary_periods WHERE id=$1`,[periods[1].id])).rows[0].amount),400);
  const payment=(await db.query(`SELECT record_external_payment($1,$2,NULL,100,'USD','2024-03-11','Bank','salary-fixture',NULL,NULL,NULL) result`,[admin,periods[1].id])).rows[0].result;
  assert.equal(Number(payment.balance),300);
  await assert.rejects(db.query(`SELECT record_external_payment($1,$2,NULL,350,'USD','2024-03-11','Bank',NULL,NULL,NULL,NULL)`,[admin,periods[1].id]),/outstanding/);
  await db.query(`SELECT record_external_payment($1,$2,NULL,-25,'USD','2024-03-11','Correction',NULL,NULL,$3,'Corrected receipt')`,[admin,periods[1].id,payment.id]);
  assert.equal(Number((await db.query(`SELECT sum(amount) total FROM external_payments WHERE salary_period_id=$1`,[periods[1].id])).rows[0].total),75);
  await assert.rejects(db.query(`SELECT record_external_payment($1,$2,NULL,-100,'USD','2024-03-11','Correction',NULL,NULL,$3,'Too large')`,[admin,periods[1].id,payment.id]),/remaining original/);
  assert.equal((await db.query(`SELECT count(*)::int count FROM audit_events WHERE action IN ('salary_period_adjusted','external_payment_recorded','external_payment_corrected')`)).rows[0].count,3);
});

test('salary snapshots cannot be backdated or rewritten by later terms',async()=>{
  const employment=(await db.query(`SELECT save_staff_employment($1,$2,'2024-01-31','2024-03-10','manual',2000,'EUR','2024-03-01') result`,[admin,staff])).rows[0].result;
  const periods=(await db.query(`SELECT amount,currency FROM staff_salary_periods WHERE employment_id=$1 ORDER BY period_index`,[employment.id])).rows;
  assert.equal(Number(periods[0].amount),1000);assert.equal(periods[0].currency,'USD');
  assert.equal(Number(periods[1].amount),400);assert.equal(periods[1].currency,'USD');
  await assert.rejects(db.query(`SELECT save_staff_employment($1,$2,'2024-01-30','2024-03-10','manual',2000,'EUR','2024-03-01')`,[admin,staff]),/joining date/i);
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${technical}';`);
  assert.equal((await db.query('SELECT id FROM staff_salary_periods')).rows.length,0);
  await assert.rejects(db.query(`SELECT record_external_payment($1,$2,NULL,1,'USD','2024-03-11','Bank',NULL,NULL,NULL,NULL)`,[admin,'00000000-0000-0000-0000-000000000001']),/permission denied/);
  await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');
});

test('placement months retain reviewed partial amounts and joining commissions require approval',async()=>{
 const candidate=(await db.query(`SELECT save_candidate_profile($1,NULL,NULL,'{"full_name":"Placed fixture"}') id`,[admin])).rows[0].id;
 const placement=(await db.query(`INSERT INTO placements(candidate_id,company,role_title,status,technical_recruiter_id,actual_join_date,actual_end_date,candidate_monthly_amount,candidate_currency,commission_amount,commission_currency,created_by) VALUES($1,'Fixture','Engineer','completed',$2,'2024-10-15','2024-11-12',1200,'USD',200,'USD',$3) RETURNING id`,[candidate,technical,admin])).rows[0].id;
 await db.query(`SELECT sync_placement_months($1)`,[placement]);
 const months=(await db.query(`SELECT id,covered_start::text,covered_end::text,agreed_amount FROM placement_months WHERE placement_id=$1 ORDER BY month_start`,[placement])).rows;
 assert.equal(months.length,2);assert.equal(months[0].covered_start,'2024-10-15');assert.equal(months[1].covered_end,'2024-11-12');assert.equal(months[0].agreed_amount,null);
 await db.query(`SELECT adjust_placement_month($1,$2,$3,600,'USD','Approved half month','Reviewed agreement')`,[admin,placement,months[0].id]);
 await db.query(`SELECT sync_placement_months($1)`,[placement]);
 assert.equal(Number((await db.query(`SELECT agreed_amount FROM placement_months WHERE id=$1`,[months[0].id])).rows[0].agreed_amount),600);
 const commission=(await db.query(`SELECT * FROM technical_recruiter_commissions WHERE placement_id=$1`,[placement])).rows[0];
 assert.equal(commission.status,'awaiting_approval');assert.equal(commission.technical_recruiter_id,technical);
 await assert.rejects(db.query(`SELECT record_external_payment($1,NULL,$2,100,'USD','2024-10-16','Bank','commission-fixture',NULL,NULL,NULL)`,[admin,commission.id]),/approval/);
 await db.query(`SELECT decide_placement_commission($1,$2,'approved',NULL)`,[admin,commission.id]);
 await db.query(`SELECT record_external_payment($1,NULL,$2,100,'USD','2024-10-16','Bank','commission-fixture',NULL,NULL,NULL)`,[admin,commission.id]);
 assert.equal((await db.query(`SELECT status FROM technical_recruiter_commissions WHERE id=$1`,[commission.id])).rows[0].status,'partially_paid');
 await assert.rejects(db.query(`UPDATE placements SET commission_amount=300 WHERE id=$1`,[placement]),/approved commission/);
 await assert.rejects(db.query(`SELECT record_external_payment($1,NULL,$2,100,'USD','2024-10-16','Bank','commission-fixture',NULL,NULL,NULL)`,[admin,commission.id]),/duplicate key/);
});

test('submission retries reuse the application and answer revisions remain assignment-scoped',async()=>{
 const candidate=(await db.query(`SELECT save_candidate_profile($1,NULL,NULL,'{"full_name":"Capture fixture"}') id`,[admin])).rows[0].id;
 await db.query(`SELECT set_candidate_staff_assignment($1,$2,$3,'recruiter',true)`,[admin,candidate,staff]);
 const event='40000000-0000-4000-8000-000000000101';
 const fields=JSON.stringify({companyName:'Capture Fixture',jobTitle:'Engineer'});
 const first=(await db.query(`SELECT record_extension_submission($1,$2,$3,1,$4::jsonb) result`,[staff,candidate,event,fields])).rows[0].result;
 const retry=(await db.query(`SELECT record_extension_submission($1,$2,$3,1,$4::jsonb) result`,[staff,candidate,event,fields])).rows[0].result;
 assert.equal(retry.submission.id,first.submission.id);assert.equal(retry.replayed,true);
 const save=key=>db.query(`SELECT save_application_answer_snapshot($1,NULL,$2,$3,1,$4,'jobs.ashbyhq.com','https://jobs.ashbyhq.com/fixture/role',1,'[{"key":"email","label":"Email","value":"edited@example.test"}]',now()) result`,[staff,first.submission.id,candidate,key]);
 const snapshot=(await save(event)).rows[0].result;
 assert.equal((await save(event)).rows[0].result.id,snapshot.id);
 assert.equal((await save('40000000-0000-4000-8000-000000000102')).rows[0].result.revision,2);
 await db.query(`SELECT set_candidate_staff_assignment($1,$2,$3,'recruiter',false)`,[admin,candidate,staff]);
 await assert.rejects(save('40000000-0000-4000-8000-000000000103'),/access denied/);
 await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${staff}';`);
 assert.equal((await db.query(`SELECT id FROM application_answer_snapshots WHERE candidate_id=$1`,[candidate])).rows.length,0);
 await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');
});

test('dashboard financial totals keep currencies and corrections separate',async()=>{
 const totals=(await db.query(`SELECT recruiting_operations_totals($1) totals`,[admin])).rows[0].totals;
 assert.deepEqual(totals.money.salaryPaid,[{currency:'USD',amount:75}]);
 assert.deepEqual(totals.money.salaryOutstanding,[{currency:'USD',amount:1325}]);
 assert.deepEqual(totals.money.commissionPaid,[{currency:'USD',amount:100}]);
 await assert.rejects(db.query(`SELECT recruiting_operations_totals($1)`,[staff]),/administrator/);
});

test('candidate reassignment revokes task results and task retry permission',async()=>{
 const candidate=(await db.query(`SELECT save_candidate_profile($1,NULL,NULL,'{"full_name":"Task fixture"}') id`,[admin])).rows[0].id;
 await db.query(`SELECT set_candidate_staff_assignment($1,$2,$3,'recruiter',true)`,[admin,candidate,staff]);
 const task=(await db.query(`INSERT INTO background_tasks(actor_id,kind,payload,idempotency_key,status,result) VALUES($1,'candidate_match',jsonb_build_object('candidateId',$2::text),'assignment-task-fixture','failed','{"summary":"Private candidate details"}') RETURNING id`,[staff,candidate])).rows[0].id;
 await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${staff}';`);
 assert.equal((await db.query(`SELECT id FROM background_tasks WHERE id=$1`,[task])).rows.length,1);
 await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');
 await db.query(`SELECT set_candidate_staff_assignment($1,$2,$3,'recruiter',false)`,[admin,candidate,staff]);
 await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${staff}';`);
 assert.equal((await db.query(`SELECT id FROM background_tasks WHERE id=$1`,[task])).rows.length,0);
 await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');
 await assert.rejects(db.query(`SELECT retry_task($1,$2)`,[staff,task]),/access denied/);
});

test('ending an active placement preserves its earned commission for later approval',async()=>{
 const candidate=(await db.query(`SELECT save_candidate_profile($1,NULL,NULL,'{"full_name":"Completed commission fixture"}') id`,[admin])).rows[0].id;
 const placement=(await db.query(`INSERT INTO placements(candidate_id,company,role_title,status,technical_recruiter_id,actual_join_date,commission_amount,commission_currency,commission_milestone,created_by) VALUES($1,'Fixture','Engineer','active',$2,'2024-01-15',200,'USD','placement_active',$3) RETURNING id`,[candidate,technical,admin])).rows[0].id;
 const earned=(await db.query(`SELECT * FROM technical_recruiter_commissions WHERE placement_id=$1`,[placement])).rows[0];
 await db.query(`UPDATE placements SET actual_end_date='2024-02-15',status='ended_early' WHERE id=$1`,[placement]);
 const ended=(await db.query(`SELECT * FROM technical_recruiter_commissions WHERE placement_id=$1`,[placement])).rows[0];
 assert.equal(ended.status,'awaiting_approval');assert.deepEqual(ended.eligible_at,earned.eligible_at);assert.deepEqual(ended.due_date,earned.due_date);
 await db.query(`SELECT decide_placement_commission($1,$2,'approved',NULL)`,[admin,ended.id]);
});
