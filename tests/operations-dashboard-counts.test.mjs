import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
test('dashboard queue totals and approval preview remain correct beyond bounded preview lists',async()=>{
 const db={from(table){let approval=false;const query={select(){return query;},eq(key,value){if(key==='status'&&value==='awaiting_approval')approval=true;return query;},in(){return query;},not(){return query;},or(){return query;},order(){return query;},limit(){return query;},then(resolve){return Promise.resolve(resolve({error:null,count:table==='profiles'?150:table==='candidates'?175:approval?350:0,data:table==='profiles'?[{id:'pending'}]:table==='candidates'?[{id:'unassigned'}]:table==='technical_recruiter_commissions'&&approval?[{id:'approval',amount:'750',currency:'USD',status:'awaiting_approval'}]:[]}));}};return query;},rpc:async()=>({error:null,data:{counts:{activePlacements:12,joinsNext30Days:2,endsNext30Days:3,captureIssues:4},money:{salaryOutstanding:[],salaryPaid:[],commissionOutstanding:[],commissionPaid:[]}}})};
 const {GET}=moduleLoader({'@/lib/http/protected-route':{protectedRoute:(_request,_role,handler)=>handler({id:'admin'})},'@/lib/db/admin':{database:()=>db,checkDb:error=>{if(error)throw error;}},'@/lib/payroll/repository':{ensureSalaryPeriodsBatch:async()=>{},earningSummary:()=>({})}})('src/app/api/admin/operations/route.ts');
 const data=await GET(new Request('https://portal.test/api/admin/operations'));
 assert.deepEqual(data.counts,{activePlacements:12,joinsNext30Days:2,endsNext30Days:3,captureIssues:4,pendingStaff:150,assignmentReview:175,commissionApproval:350});
 assert.equal(data.commissions.length,0);assert.equal(data.commissionApprovals[0].id,'approval');assert.equal(data.commissionApprovals[0].balance,750);
});
