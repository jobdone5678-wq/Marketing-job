import test from 'node:test';
import assert from 'node:assert/strict';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';
import {normalizeSnapshot} from '../src/lib/jobs/normalize.ts';
test('job dates persist through lease checked snapshots, update versions, and leave historical dates unknown',async t=>{
 const db=await recruitingDatabase(['20261009000200_crm.sql','20261009000300_tasks.sql','20261009000500_jobs.sql','202610120003_job_dates.sql']);t.after(()=>db.close());
 const actor='10000000-0000-0000-0000-000000000081',lease='90000000-0000-0000-0000-000000000081';
 await db.query(`INSERT INTO auth.users VALUES($1,'dates@example.test','{"role":"recruiter"}')`,[actor]);await db.query("UPDATE profiles SET status='active' WHERE id=$1",[actor]);
 const source=(await db.query("INSERT INTO job_sources(provider,board_slug,company,created_by) VALUES('ashby','dates','Fixture',$1) RETURNING id",[actor])).rows[0].id;
 const job=normalizeSnapshot({provider:'ashby',company:'Fixture'},{jobs:[{title:'Python Engineer',jobUrl:'https://jobs.ashbyhq.com/dates/job',publishedAt:'2026-10-01T12:00:00Z'}]}).jobs[0];
 async function save(value,complete=true){const task=(await db.query('SELECT enqueue_source_sync($1,$2) id',[actor,source])).rows[0].id;await db.query('SELECT * FROM claim_task($1)',[lease]);await db.query('SELECT save_job_snapshot($1,$2,$3,$4::jsonb,$5)',[task,lease,source,JSON.stringify(value),complete]);await db.query("SELECT finish_task($1,$2,'{}',NULL,false)",[task,lease]);}
 await save([{...job,closes_at:'2026-11-01T12:00:00Z'}]);
 let stored=(await db.query('SELECT * FROM jobs')).rows[0];
 assert.equal(new Date(stored.posted_at).toISOString(),'2026-10-01T12:00:00.000Z');assert.equal(new Date(stored.closes_at).toISOString(),'2026-11-01T12:00:00.000Z');
 await save([{...job,closes_at:'2026-11-01T12:00:00Z'}]);assert.equal((await db.query('SELECT version FROM jobs')).rows[0].version,1);
 await save([{...job,posted_at:null,closes_at:null,content_hash:'new-content'}]);stored=(await db.query('SELECT * FROM jobs')).rows[0];assert.equal(stored.posted_at,null);assert.equal(stored.closes_at,null);assert.equal(stored.version,2);
 await save([],false);assert.equal((await db.query('SELECT state FROM jobs')).rows[0].state,'active');
 await save([]);stored=(await db.query('SELECT * FROM jobs')).rows[0];assert.equal(stored.state,'closed');assert.equal(stored.closes_at,null);
});
