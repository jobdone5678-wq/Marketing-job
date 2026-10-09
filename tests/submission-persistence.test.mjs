import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const load=()=>import('../src/lib/submission-store.ts');
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
