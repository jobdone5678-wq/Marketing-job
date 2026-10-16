import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';
let db;
const admin='10000000-0000-4000-8000-000000000101',owner='10000000-0000-4000-8000-000000000102',other='10000000-0000-4000-8000-000000000103';
let candidate,job,brief,resume,task;
before(async()=>{
 const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(name=>/^20261009\d{6}_|^20261011\d{6}_/.test(name)&&!name.includes('foundation')).sort();
 db=await recruitingDatabase(files);
 await db.exec(await readFile(new URL('../supabase/migrations/20261016000100_jd_tailored_resumes.sql',import.meta.url),'utf8'));
 await db.query(`INSERT INTO auth.users VALUES($1,'admin@example.test','{}'),($2,'owner@example.test','{}'),($3,'other@example.test','{}')`,[admin,owner,other]);
 await db.query(`UPDATE profiles SET role='super_admin',status='active' WHERE id=$1`,[admin]);
 candidate=(await db.query(`SELECT save_candidate_profile($1,NULL,NULL,'{"full_name":"Reviewed Candidate","primary_skills":"Python, SQL"}') id`,[owner])).rows[0].id;
 const source=(await db.query(`INSERT INTO job_sources(provider,board_slug,company,created_by) VALUES('greenhouse','fixture','Fixture',$1) RETURNING id`,[admin])).rows[0].id;
 job=(await db.query(`INSERT INTO jobs(source_id,external_id,title,company,source_url,application_url,description,content_hash,employment_type) VALUES($1,'fixture','Python Developer','Fixture','https://jobs.lever.co/fixture/1','https://jobs.lever.co/fixture/1','Python and SQL required','hash','unknown') RETURNING id`,[source])).rows[0].id;
});
after(async()=>{await db?.close();});
test('JD uploads are admin-only, duplicate-safe and require versioned review',async()=>{
 await assert.rejects(db.query(`SELECT create_job_brief($1,gen_random_uuid(),'Role','Company','Python and SQL required',NULL,NULL,'hash')`,[owner]),/admin/i);
 const result=(await db.query(`SELECT create_job_brief($1,gen_random_uuid(),'Role','Company','Python and SQL required',NULL,NULL,'hash') data`,[admin])).rows[0].data;brief=result.briefId;
 const repeated=(await db.query(`SELECT create_job_brief($1,gen_random_uuid(),'Role','Company','Python and SQL required',NULL,NULL,'hash') data`,[admin])).rows[0].data;
 assert.equal(repeated.briefId,brief);assert.equal(repeated.taskId,result.taskId);
 await db.query(`UPDATE job_briefs SET status='review',requirements='{"requirements":[{"requirement":"Python","jobEvidence":"Python and SQL required","importance":"required"}],"constraints":[]}' WHERE id=$1`,[brief]);
 await db.query(`SELECT review_job_brief($1,$2,1,(SELECT requirements FROM job_briefs WHERE id=$2))`,[admin,brief]);
 await assert.rejects(db.query(`SELECT review_job_brief($1,$2,1,(SELECT requirements FROM job_briefs WHERE id=$2))`,[admin,brief]),/changed/i);
});
test('tailored generation checks ownership, deduplicates requests and binds source versions',async()=>{
 await assert.rejects(db.query(`SELECT request_tailored_resume($1,$2,$3,NULL)`,[other,candidate,job]),/access/i);
 const result=(await db.query(`SELECT request_tailored_resume($1,$2,$3,NULL) data`,[owner,candidate,job])).rows[0].data;resume=result.resumeId;task=result.taskId;
 const again=(await db.query(`SELECT request_tailored_resume($1,$2,$3,NULL) data`,[owner,candidate,job])).rows[0].data;
 assert.equal(again.resumeId,resume);assert.equal(again.taskId,task);
 assert.equal((await db.query(`SELECT task_actor_can_access($1,$2) allowed`,[owner,task])).rows[0].allowed,true);
 assert.equal((await db.query(`SELECT task_actor_can_access($1,$2) allowed`,[other,task])).rows[0].allowed,false);
});
test('tailored saves need a current lease, review preserves history and stale edits are rejected',async()=>{
 const lease='10000000-0000-4000-8000-000000000199';
 await assert.rejects(db.query(`SELECT save_tailored_resume($1,$2,$3,'Factual resume','{}','test')`,[task,lease,resume]),/lease/i);
 await db.query(`UPDATE background_tasks SET status='running',lease_token=$2,lease_until=now()+interval '3 minutes' WHERE id=$1`,[task,lease]);
 await db.query(`SELECT save_tailored_resume($1,$2,$3,'Factual resume','{}','test')`,[task,lease,resume]);
 await db.query(`SELECT review_tailored_resume($1,$2,1,'Reviewed factual resume')`,[owner,resume]);
 assert.equal((await db.query(`SELECT count(*)::int n FROM tailored_resume_edits WHERE resume_id=$1`,[resume])).rows[0].n,2);
 await assert.rejects(db.query(`SELECT review_tailored_resume($1,$2,1,'Lost update')`,[owner,resume]),/changed/i);
 await db.query(`UPDATE candidates SET version=version+1,confirmed_facts=confirmed_facts||'{"primary_skills":"Python, SQL, Java"}' WHERE id=$1`,[candidate]);
 await assert.rejects(db.query(`SELECT review_tailored_resume($1,$2,2,'Stale source')`,[owner,resume]),/changed/i);
});
test('direct authenticated SQL cannot read confidential briefs or generated resumes',async()=>{
 await db.exec('SET ROLE authenticated');
 await assert.rejects(db.query('SELECT * FROM job_briefs'),/permission denied/);
 await assert.rejects(db.query('SELECT * FROM tailored_resumes'),/permission denied/);
 await db.exec('RESET ROLE');
});
test('live job content changes advance versions while duplicate refreshes preserve them',async()=>{
 const before=(await db.query('SELECT version FROM jobs WHERE id=$1',[job])).rows[0].version;
 await db.query(`UPDATE jobs SET description='Python and SQL and Kafka required',content_hash='new-hash' WHERE id=$1`,[job]);
 assert.equal((await db.query('SELECT version FROM jobs WHERE id=$1',[job])).rows[0].version,before+1);
 await db.query(`UPDATE jobs SET description='Python and SQL and Kafka required',content_hash='new-hash' WHERE id=$1`,[job]);
 assert.equal((await db.query('SELECT version FROM jobs WHERE id=$1',[job])).rows[0].version,before+1);
});
