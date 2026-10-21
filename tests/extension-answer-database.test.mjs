import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';
import {randomUUID} from 'node:crypto';
let db,candidate;const actor=randomUUID(),other=randomUUID();
before(async()=>{
 const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(name=>/^20261009\d{6}_|^20261011\d{6}_/.test(name)&&!name.includes('foundation')).sort();db=await recruitingDatabase(files);
 for(const file of ['20261016000100_jd_tailored_resumes.sql','20261021000100_extension_answer_tasks.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.query(`INSERT INTO auth.users VALUES($1,'a@example.test','{}'),($2,'b@example.test','{}')`,[actor,other]);
 candidate=(await db.query(`SELECT save_candidate_profile($1,NULL,NULL,'{"full_name":"Reviewed Candidate","primary_skills":"Python"}') id`,[actor])).rows[0].id;
});
after(async()=>db?.close());
test('screening kind is durable, actor scoped and rechecks candidate ownership',async()=>{
 const payload={candidateId:candidate,screening:{candidateId:candidate}};
 const task=(await db.query(`SELECT enqueue_task($1,'application_answers',$2,$3) id`,[actor,JSON.stringify(payload),'screening-fixture'])).rows[0].id;
 assert.equal((await db.query(`SELECT task_actor_can_access($1,$2) allowed`,[actor,task])).rows[0].allowed,true);
 assert.equal((await db.query(`SELECT task_actor_can_access($1,$2) allowed`,[other,task])).rows[0].allowed,false);
 await db.query(`UPDATE candidates SET user_id=$1 WHERE id=$2`,[other,candidate]);
 assert.equal((await db.query(`SELECT task_actor_can_access($1,$2) allowed`,[actor,task])).rows[0].allowed,false);
});
test('uploaded drafts stay task-owner scoped; quota reservation and lease recovery apply',async()=>{
 const task=(await db.query(`SELECT enqueue_task($1,'application_answers',$2,$3) id`,[actor,JSON.stringify({screening:{uploadedCandidate:{id:'uploaded-fixture'}}}),'uploaded-fixture'])).rows[0].id;
 assert.equal((await db.query(`SELECT task_actor_can_access($1,$2) allowed`,[actor,task])).rows[0].allowed,true);
 assert.equal((await db.query(`SELECT task_actor_can_access($1,$2) allowed`,[other,task])).rows[0].allowed,false);
 const lease=randomUUID();await db.query(`UPDATE background_tasks SET status='running',lease_token=$2,lease_until=now()+interval '3 minutes',attempts=1 WHERE id=$1`,[task,lease]);
 await db.query(`UPDATE workspace_settings SET ai_daily_limit=1 WHERE id=true`);
 await db.query(`SELECT reserve_ai_call($1,$2,'fixture')`,[task,lease]);
 await assert.rejects(db.query(`SELECT reserve_ai_call($1,$2,'fixture')`,[task,lease]),/budget/i);
 await db.query(`UPDATE background_tasks SET lease_until=now()-interval '1 minute' WHERE id=$1`,[task]);
 await assert.rejects(db.query(`SELECT check_task_lease($1,$2)`,[task,lease]),/lease/i);
 const replacement=randomUUID();await db.query(`SELECT claim_task($1)`,[replacement]);
 assert.equal((await db.query(`SELECT count(*)::int n FROM provider_usage WHERE task_id=$1`,[task])).rows[0].n,1);
});
