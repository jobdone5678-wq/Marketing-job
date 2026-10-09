import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {recruitingDatabase} from './helpers/recruiting-db.mjs';
let db;const owner='10000000-0000-0000-0000-000000000071';const other='10000000-0000-0000-0000-000000000072';let document;
before(async()=>{db=await recruitingDatabase(['20261009000200_crm.sql','20261009000300_tasks.sql','20261009000400_resumes.sql']);
  for(const id of [owner,other])await db.query(`INSERT INTO auth.users VALUES($1,'fixture@example.test','{"role":"client"}')`,[id]);
  document=(await db.query(`INSERT INTO candidate_documents(owner_id,object_path,filename,content_hash,consent_at,status) VALUES($1,$2,'resume.pdf','synthetic',now(),'review') RETURNING id`,[owner,owner+'/resume.pdf'])).rows[0].id;
  await db.query(`INSERT INTO resume_extractions(document_id,data,model,prompt_version) VALUES($1,$2::jsonb,'synthetic-model','v1')`,[document,JSON.stringify({fields:{full_name:'Alex Example'},employmentHistory:[],educationHistory:[],evidence:[],warnings:[]})]);});
after(async()=>{await db?.close();});
test('another candidate cannot read a resume or its extracted private details',async()=>{
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${other}';`);
  try {assert.equal((await db.query('SELECT id FROM candidate_documents')).rows.length,0);assert.equal((await db.query('SELECT document_id FROM resume_extractions')).rows.length,0);}
  finally{await db.exec('RESET ROLE;RESET request.jwt.claim.sub;');}
});
test('confirmation links a reviewed document to an owned persistent profile',async()=>{
  const result=await db.query('SELECT confirm_resume($1,$2,NULL,$3::jsonb) AS id',[owner,document,JSON.stringify({full_name:'Alex Example',primary_skills:'SQL'})]);
  const candidate=result.rows[0].id;assert.equal((await db.query('SELECT user_id FROM candidates WHERE id=$1',[candidate])).rows[0].user_id,owner);
  assert.equal((await db.query('SELECT status,candidate_id FROM candidate_documents WHERE id=$1',[document])).rows[0].candidate_id,candidate);
  await assert.rejects(db.query('SELECT confirm_resume($1,$2,NULL,$3::jsonb)',[other,document,JSON.stringify({full_name:'Other'})]),/access/);
});
