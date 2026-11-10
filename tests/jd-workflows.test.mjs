import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';
const brief='10000000-0000-4000-8000-000000000201';
const requirements={requirements:[{requirement:'Python',jobEvidence:'Python and SQL required',importance:'required'},{requirement:'SQL',jobEvidence:'Python and SQL required',importance:'preferred'}],constraints:[]};
test('JD criteria need source evidence and distinguish supported requirements from unknowns',()=>{
 const {validateBriefRequirements,matchBriefCandidate}=moduleLoader()('src/lib/job-briefs/matching.ts');
 assert.throws(()=>validateBriefRequirements({...requirements,requirements:[{requirement:'Kubernetes',jobEvidence:'Python and SQL required',importance:'required'}]},'Python and SQL required'),/quoted/);
 const result=matchBriefCandidate(requirements,'Python and SQL required',{id:'candidate',full_name:'Reviewed',confirmed_facts:{primary_skills:'Python'}});
 assert.equal(result.coverage,67);assert.equal(result.supported,1);assert.equal(result.unknown,1);assert.equal(result.requiredUnknown,0);
});
test('admin JD matching scans all active reviewed candidates, including beyond first database batch',async()=>{
 const db=fixtureDatabase({job_briefs:[{id:brief,description:'Python and SQL required',requirements,status:'ready',version:2}],candidates:[...Array.from({length:501},(_,i)=>({id:'candidate-'+i,full_name:'Other',confirmed_facts:{primary_skills:'Java'},is_active_bench:true,provenance_status:'confirmed'})),{id:'best',full_name:'Strong match',confirmed_facts:{primary_skills:'Python, SQL'},is_active_bench:true,provenance_status:'confirmed'},{id:'unreviewed',full_name:'Unreviewed',confirmed_facts:{primary_skills:'Python, SQL'},is_active_bench:true,provenance_status:'legacy_unconfirmed'}],jd_shortlists:[]});
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:(_r,access,work)=>{assert.equal(access,'admin');return work({id:'admin',role:'super_admin'});}},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error}});
 const result=await load('src/app/api/admin/job-briefs/[id]/matches/route.ts').GET(new Request('https://portal.test/api/admin/job-briefs/'+brief+'/matches'),{params:Promise.resolve({id:brief})});
 assert.equal(result.totalCandidates,502);assert.equal(result.matches[0].candidateId,'best');assert.equal(result.matches[0].coverage,100);
});
test('tailored download requires authorized reviewed current content and returns DOCX bytes',async()=>{
 let ready=false,stale=false;const resumeId='10000000-0000-4000-8000-000000000202';
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:(_r,_access,work)=>work({id:'owner',role:'client'})},'@/lib/tailored-resumes/repository':{getTailoredResume:async()=>({resume:{id:resumeId,status:ready?'ready':'review',revision:2,reviewed_revision:ready?2:null,stale,content:'Reviewed Candidate\nSKILLS\nPython'},candidate:{full_name:'Reviewed Candidate'}})},'@/lib/db/admin':{CaptureError:Error}});
 const {GET}=load('src/app/api/tailored-resumes/[id]/download/route.ts');
 const run=()=>GET(new Request('https://portal.test/api/tailored-resumes/'+resumeId+'/download'),{params:Promise.resolve({id:resumeId})});
 await assert.rejects(run,/Review/);ready=true;
 const response=await run();assert.equal(response.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 assert.match(response.headers.get('content-disposition'),/\.docx/);assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,2).toString(),'PK');
 stale=true;await assert.rejects(run,/changed|generate/i);
});
