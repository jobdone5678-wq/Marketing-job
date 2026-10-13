import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
import {profileAccess} from '../src/lib/auth/profile-access.ts';
class CaptureError extends Error{constructor(message,status=400){super(message);this.status=status;}}
test('service collection write routes reject candidate, recruiter and suspended admin before database work',async()=>{
 let actor,calls=0;
 const load=moduleLoader({
  '@/lib/auth/require-profile':{requireProfile:async access=>{if(!profileAccess(actor,access))throw new CaptureError('Forbidden',403);return actor;}},
  '@/lib/db/admin':{CaptureError,checkDb:()=>{},database:()=>{calls++;throw new Error('Unexpected database call');},requireSameOrigin:()=>{},errorResponse:error=>Response.json({error:error.message},{status:error.status||500})},
 });
 const enrollment=load('src/app/api/admin/service-collections/route.ts'),receipt=load('src/app/api/admin/service-receipts/route.ts');
 for(actor of [{id:'client',role:'client',status:'active'},{id:'recruiter',role:'recruiter',status:'active'},{id:'admin',role:'super_admin',status:'suspended'}]){
  for(const [handler,method] of [[enrollment.GET,'GET'],[enrollment.POST,'POST'],[enrollment.PATCH,'PATCH'],[receipt.POST,'POST']]){
   const response=await handler(new Request('https://portal.test/api/admin/service-collections',{method,...(method==='GET'?{}:{body:'{}'})}));assert.equal(response.status,403);
  }
 }
 assert.equal(calls,0);
});
test('candidate collection API scopes billing reads to authenticated owner candidate ids',async()=>{
 let scoped;
 const query={select(){return this;},eq(field,value){assert.equal(field,'user_id');assert.equal(value,'owner');return Promise.resolve({data:[{id:'own-candidate'}],error:null});}};
 const load=moduleLoader({
  '@/lib/auth/require-profile':{requireProfile:async()=>({id:'owner',role:'client',status:'active'})},
  '@/lib/db/admin':{CaptureError,checkDb:()=>{},database:()=>({from:table=>{assert.equal(table,'candidates');return query;}}),requireSameOrigin:()=>{},errorResponse:error=>Response.json({error:error.message},{status:error.status||500})},
  '@/lib/billing/repository':{serviceCollections:async ids=>{scoped=ids;return {enrollments:[]};}},
 });
 const {GET}=load('src/app/api/service-collections/route.ts');
 assert.equal((await GET(new Request('https://portal.test/api/service-collections'))).status,200);
 assert.deepEqual(scoped,['own-candidate']);
});
