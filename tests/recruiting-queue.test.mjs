import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';
let db;const actor='10000000-0000-0000-0000-000000000061';const lease='90000000-0000-0000-0000-000000000061';
before(async()=>{db=await recruitingDatabase(['20261009000200_crm.sql','20261009000300_tasks.sql']);
  await db.query(`INSERT INTO auth.users VALUES($1,'staff@example.test','{"role":"recruiter"}')`,[actor]);await db.query(`UPDATE profiles SET status='active' WHERE id=$1`,[actor]);});
after(async()=>{await db?.close();});
test('durable tasks deduplicate, lease once and recover expired attempts',async()=>{
  const args=[actor,'resume_extract','{}','synthetic-document:v1'];
  const first=(await db.query(`SELECT enqueue_task($1,$2,$3::jsonb,$4) AS id`,args)).rows[0].id;
  assert.equal((await db.query(`SELECT enqueue_task($1,$2,$3::jsonb,$4) AS id`,args)).rows[0].id,first);
  const claimed=await db.query('SELECT * FROM claim_task($1)',[lease]);assert.equal(claimed.rows[0].id,first);
  assert.equal((await db.query('SELECT * FROM claim_task($1)',['90000000-0000-0000-0000-000000000062'])).rows.length,0);
  await db.query(`UPDATE background_tasks SET lease_until=now()-interval '1 second' WHERE id=$1`,[first]);
  assert.equal((await db.query('SELECT * FROM claim_task($1)',[lease])).rows[0].attempts,2);
  await assert.rejects(db.query('SELECT finish_task($1,$2,$3::jsonb,NULL,false)',[first,'90000000-0000-0000-0000-000000000069','{}']),/lease/);
});
test('atomic AI allowances include failed/unknown outcomes',async()=>{
  await db.exec(`UPDATE workspace_settings SET ai_daily_limit=1`);
  const task=(await db.query('SELECT id FROM background_tasks LIMIT 1')).rows[0].id;
  await db.query('SELECT reserve_ai_call($1,$2,$3)',[task,lease,'synthetic-model']);
  await assert.rejects(db.query('SELECT reserve_ai_call($1,$2,$3)',[task,lease,'synthetic-model']),/budget/);
});
test('worker failure is visible and stops after the retry limit',async()=>{
  const task=(await db.query('SELECT id FROM background_tasks LIMIT 1')).rows[0].id;
  await db.query('SELECT finish_task($1,$2,NULL,$3,true)',[task,lease,'Provider unavailable']);
  await db.query(`UPDATE background_tasks SET available_at=now() WHERE id=$1`,[task]);
  await db.query('SELECT * FROM claim_task($1)',[lease]);
  await db.query('SELECT finish_task($1,$2,NULL,$3,true)',[task,lease,'Provider unavailable']);
  assert.equal((await db.query('SELECT status FROM background_tasks WHERE id=$1',[task])).rows[0].status,'failed');
});
