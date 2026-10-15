import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const load=()=>import('../src/lib/submission-store.ts');
test('submission history loads beyond database row caps without dropping daily totals',async()=>{
 const {submissionStore}=await load();
 const urls=[];
 const database=createClient('https://database.example.test','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async url=>{
  const params=new URL(url).searchParams;urls.push(params);
  const offset=Number(params.get('offset')||0);const limit=Number(params.get('limit')||1000);
  const rows=Array.from({length:1001},(_,id)=>({id:String(id),submission_date:'2026-10-15'}));
  return Response.json(rows.slice(offset,offset+limit));
 }}});
 assert.equal((await submissionStore(database).getSubmissions('own')).length,1001);
 assert.ok(urls.every(params=>params.get('candidate_id')==='eq.own'));
});
function client(response) {
  return createClient('https://database.example.test','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>response.clone()}});
}
test('an empty database returns no invented submissions',async()=>{
  const {submissionStore}=await load();
  assert.deepEqual(await submissionStore(client(Response.json([]))).getSubmissions(),[]);
});
test('failed database writes return errors rather than successful demo records',async()=>{
  const {submissionStore}=await load();
  const store=submissionStore(client(Response.json({message:'database unavailable'},{status:503})));
  const created=await store.createSubmission({candidate_id:'candidate',company_name:'Acme',job_title:'Engineer'});
  assert.equal(created.data,null);assert.ok(created.error);
  const deleted=await store.deleteSubmission('missing');assert.equal(deleted.success,false);
});
test('failed database reads surface an error',async()=>{
  const {submissionStore}=await load();
  await assert.rejects(submissionStore(client(Response.json({message:'database unavailable'},{status:503}))).getSubmissions(),/load/);
});

test('editing a loaded submission sends editable fields without joins or attribution',async()=>{
  const {submissionStore}=await load();
  let written;
  const database=createClient('https://database.example.test','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(_url,options)=>{
    written=JSON.parse(options.body);
    return Response.json({id:'submission',company_name:'Acme',job_title:'Engineer',status:'Interview_Scheduled'});
  }}});
  await submissionStore(database).updateSubmission('submission',{
    id:'submission',candidate_id:'candidate',recruiter_id:'original-actor',technical_recruiter_id:null,job_id:'job',
    company_name:'Acme',job_title:'Engineer',status:'Interview_Scheduled',capture_status:'confirmed',email_confirmed_at:'2026-10-10',
    candidate:{full_name:'Candidate'},recruiter:{full_name:'Staff'},created_at:'2026-10-10',updated_at:'2026-10-11',
  });
  assert.deepEqual(written,{company_name:'Acme',job_title:'Engineer',status:'Interview_Scheduled'});
});
