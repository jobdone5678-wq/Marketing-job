import test from 'node:test';import assert from 'node:assert/strict';
import {canClaimPublicJobTask} from '../src/lib/jobs/sync-policy.ts';
test('public job repair claims only due queued source tasks with remaining attempts',()=>{
  const now=Date.parse('2026-10-08T12:00:00Z');
  const task={kind:'source_sync',status:'queued',attempts:0,available_at:'2026-10-08T11:59:00Z'};
  assert.equal(canClaimPublicJobTask(task,now),true);
  for(const patch of [{kind:'resume_extract'},{kind:'candidate_match'},{status:'running'},{status:'succeeded'},{attempts:3},{available_at:'2026-10-08T12:01:00Z'},{available_at:'invalid'}])assert.equal(canClaimPublicJobTask({...task,...patch},now),false);
});
