import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';

function repository(rpc) {
 return moduleLoader({'@/lib/db/admin':{database:()=>({rpc}),checkDb:error=>{if(error)throw error;},CaptureError:Error}})('src/lib/payroll/repository.ts');
}
test('salary refresh batches and deduplicates IDs instead of one HTTP request per employment',async()=>{
 const calls=[];const repo=repository(async(name,args)=>{calls.push({name,args});return {error:null};});
 await repo.ensureSalaryPeriodsBatch(['a','b','a']);
 assert.deepEqual(calls,[{name:'sync_recruiting_periods',args:{p_employments:['a','b'],p_placements:[]}}]);
 await repo.ensureSalaryPeriodsBatch([]);assert.equal(calls.length,1);
});
test('staff finances start before placement maintenance and candidates cannot see private compensation',async()=>{
 const events=[];
 const tables={placements:[{id:'placement',candidate_id:'candidate',candidate_compensation_visible:false,candidate_monthly_amount:5000,candidate_currency:'USD'}],placement_months:[{id:'month',placement_id:'placement',agreed_amount:5000,currency:'USD'}],candidates:[{id:'candidate',user_id:'actor',assigned_recruiter_id:'actor'}]};
 const fixture=fixtureDatabase(tables);
 const db={from(table){events.push(table);return fixture.from(table);}};
 let role='recruiter';
 const {GET}=moduleLoader({'@/lib/http/protected-route':{protectedRoute:(_r,_a,work)=>work({id:'actor',role})},'@/lib/db/admin':{database:()=>db,checkDb:error=>{if(error)throw error;}},'@/lib/payroll/repository':{ensureSalaryPeriods:async()=>{},earningSummary:()=>({})},'@/lib/placements/repository':{syncPlacementMonths:async()=>{},syncPlacementMonthsBatch:async()=>{events.push('refresh');}}})('src/app/api/placements/route.ts');
 await GET(new Request('https://test/api/placements'));
 assert.ok(events.indexOf('staff_employments')<events.indexOf('placement_months'),events.join(','));
 role='client';events.length=0;
 const data=await GET(new Request('https://test/api/placements'));
 assert.equal(data.placements[0].candidate_monthly_amount,null);
 assert.equal(data.placements[0].months[0].agreed_amount,null);
 assert.equal(events.includes('staff_employments'),false);
});
test('batch refresh only falls back for an unapplied migration, never hides database failures',async()=>{
 const calls=[];const repo=repository(async(name,args)=>{calls.push({name,args});return {error:name==='sync_recruiting_periods'?{code:'PGRST202',message:'not installed'}:null};});
 await repo.ensureSalaryPeriodsBatch(['a','b']);assert.equal(calls.length,3);
 const broken=repository(async()=>({error:{code:'57014',message:'statement timeout'}}));
 await assert.rejects(()=>broken.ensureSalaryPeriodsBatch(['a']));
});
test('large refreshes use bounded batches without exceeding SQL payload limits',async()=>{
 const calls=[];const repo=repository(async(name,args)=>{calls.push({name,args});return {error:null};});
 await repo.ensureSalaryPeriodsBatch(Array.from({length:451},(_,i)=>String(i)));
 assert.deepEqual(calls.map(call=>call.args.p_employments.length),[200,200,51]);
});
test('protected routes expose authentication and handler durations on successful and failed requests',async()=>{
 const load=moduleLoader({'@/lib/auth/require-profile':{requireProfile:async()=>({id:'actor'})},'@/lib/db/admin':{requireSameOrigin(){},errorResponse:()=>Response.json({error:'failed'},{status:500})}});
 const {protectedRoute}=load('src/lib/http/protected-route.ts');
 for(const fail of [false,true]){
  const response=await protectedRoute(new Request('https://test/api/dashboard'),'admin',async()=>{if(fail)throw new Error('private database details');return {ok:true};});
  assert.match(response.headers.get('server-timing'),/auth;dur=[\d.]+, work;dur=[\d.]+, total;dur=[\d.]+/);
  assert.equal(response.status,fail?500:200);
 }
});


test('super admin dashboard skips unused general metrics while other roles keep their metrics',async()=>{
 let role='super_admin';const calls=[];
 const {GET}=moduleLoader({'@/lib/http/protected-route':{protectedRoute:(_r,_a,work)=>work({id:'actor',role})},'@/lib/db/admin':{database:()=>({rpc:async(name)=>{calls.push(name);return {data:{candidates:3},error:null};}}),checkDb:error=>{if(error)throw error;}}})('src/app/api/dashboard/route.ts');
 const admin=await GET(new Request('https://test/api/dashboard'));assert.equal(admin.role,'super_admin');assert.equal(admin.metrics,null);assert.deepEqual(calls,[]);
 role='recruiter';const staff=await GET(new Request('https://test/api/dashboard'));assert.equal(staff.metrics.candidates,3);assert.deepEqual(calls,['workspace_metrics']);
});
