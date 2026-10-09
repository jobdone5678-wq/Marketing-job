import test from 'node:test';
import assert from 'node:assert/strict';
import {readAllRows} from '../src/lib/email-confirmations/pagination.ts';

test('matching reads identities beyond a database response page',async()=>{
  const identities=Array.from({length:1010},(_,index)=>({id:String(index)}));
  const result=await readAllRows((from,to)=>Promise.resolve(identities.slice(from,to+1)));
  assert.deepEqual(result,identities);
});
test('a later page failure is not treated as a complete candidate list',async()=>{
  await assert.rejects(readAllRows(from=>from===0?Promise.resolve(Array.from({length:500},()=>({id:'test'}))):Promise.reject(new Error('unavailable'))),/unavailable/);
});
