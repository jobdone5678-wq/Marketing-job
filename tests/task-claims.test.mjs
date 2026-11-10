import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';
let db;
const actor='10000000-0000-0000-0000-000000000211';
const lease='90000000-0000-0000-0000-000000000211';
before(async()=>{
 db=await recruitingDatabase(['20261009000200_crm.sql','20261009000300_tasks.sql','20261009000400_resumes.sql','20261009000500_jobs.sql','20261009000600_matches.sql','20261009000700_intake_tasks.sql','20261009001100_webhook_and_task_priority.sql','202610120005_safe_task_claims.sql']);
 await db.query(`INSERT INTO auth.users VALUES($1,'claims@example.test','{"role":"recruiter"}')`,[actor]);
 await db.query(`UPDATE profiles SET status='active' WHERE id=$1`,[actor]);
});
after(async()=>{await db?.close();});
test('targeted claim cannot reclaim an active lease even with the same token',async()=>{
 const task=(await db.query(`SELECT enqueue_task($1,'resume_extract','{}','same-lease') id`,[actor])).rows[0].id;
 const claimed=(await db.query(`SELECT * FROM claim_specific_task($1,$2)`,[task,lease])).rows;
 assert.equal(claimed.length,1);assert.equal(claimed[0].attempts,1);
 assert.equal((await db.query(`SELECT * FROM claim_specific_task($1,$2)`,[task,lease])).rows.length,0);
 assert.equal((await db.query(`SELECT attempts FROM background_tasks WHERE id=$1`,[task])).rows[0].attempts,1);
});
test('targeted claim recovers expired leases but respects actor status, availability and attempt limit',async()=>{
 const task=(await db.query(`SELECT enqueue_task($1,'resume_extract','{}','boundaries') id`,[actor])).rows[0].id;
 await db.query(`UPDATE background_tasks SET available_at=now()+interval '1 hour' WHERE id=$1`,[task]);
 assert.equal((await db.query(`SELECT * FROM claim_specific_task($1,$2)`,[task,lease])).rows.length,0);
 await db.query(`UPDATE background_tasks SET status='running',lease_until=now()-interval '1 minute',attempts=1 WHERE id=$1`,[task]);
 await db.query(`UPDATE profiles SET status='pending' WHERE id=$1`,[actor]);
 assert.equal((await db.query(`SELECT * FROM claim_specific_task($1,$2)`,[task,lease])).rows.length,0);
 await db.query(`UPDATE profiles SET status='active' WHERE id=$1`,[actor]);
 assert.equal((await db.query(`SELECT * FROM claim_specific_task($1,$2)`,[task,lease])).rows[0].attempts,2);
 await db.query(`UPDATE background_tasks SET lease_until=now()-interval '1 minute',attempts=3 WHERE id=$1`,[task]);
 assert.equal((await db.query(`SELECT * FROM claim_specific_task($1,$2)`,[task,lease])).rows.length,0);
});
test('targeted claim is executable only by the service role',async()=>{
 const privileges=(await db.query(`SELECT has_function_privilege('authenticated','public.claim_specific_task(uuid,uuid)','EXECUTE') authenticated, has_function_privilege('anon','public.claim_specific_task(uuid,uuid)','EXECUTE') anon, has_function_privilege('service_role','public.claim_specific_task(uuid,uuid)','EXECUTE') service`)).rows[0];
 assert.deepEqual(privileges,{authenticated:false,anon:false,service:true});
});
