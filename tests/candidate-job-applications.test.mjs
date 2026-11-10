import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';
import {applicationUrlKey,withoutAppliedJobs} from '../src/lib/jobs/application-state.ts';

const recruiter='10000000-0000-4000-8000-000000000801',technical='10000000-0000-4000-8000-000000000802',admin='10000000-0000-4000-8000-000000000803',ownerA='10000000-0000-4000-8000-000000000804',ownerB='10000000-0000-4000-8000-000000000805';
const a='10000000-0000-4000-8000-000000000811',b='10000000-0000-4000-8000-000000000812',other='10000000-0000-4000-8000-000000000813';
class CaptureError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function setup(role='recruiter',actor=recruiter){
 const candidate=(id,user_id,name)=>({id,user_id,full_name:name,provenance_status:'confirmed',primary_skills:'Python',target_job_titles:'Software Engineer',assigned_recruiter_id:recruiter,assigned_technical_recruiter_id:technical});
 const job=(id,provider='ashby',state='active')=>({id,external_id:'same-external-id',source_id:provider,title:'Python Software Engineer',company:'Example',location:'Remote',description:'Python software development',employment_type:'permanent',state,posted_at:'2026-10-29T00:00:00Z',closes_at:null,application_url:`https://${provider==='ashby'?'jobs.ashbyhq.com':'boards.greenhouse.io'}/example/${id}/application`,source_url:`https://${provider==='ashby'?'jobs.ashbyhq.com':'boards.greenhouse.io'}/example/${id}`,source:{provider},updated_at:'2026-10-29T00:00:00Z'});
 const jobs=[job('applied'),job('draft','greenhouse'),job('closed','ashby','closed')];
 const record=(id,job,candidate_id,status='Applied')=>({id,candidate_id,job_id:job.id,job_url:job.application_url,company_name:job.company,job_title:job.title,portal_source:job.source.provider,submission_date:'2026-10-29',created_at:id,status,capture_status:status==='Draft'?'submit_attempted':'submitted',job});
 const tables={candidates:[candidate(a,ownerA,'Candidate A'),candidate(b,ownerB,'Candidate B'),{...candidate(other,'other-owner','Private candidate'),assigned_recruiter_id:'other-recruiter',assigned_technical_recruiter_id:'other-tech'}],jobs,job_sources:[{id:'ashby',provider:'ashby',board_slug:'example',company:'Example',enabled:true},{id:'greenhouse',provider:'greenhouse',board_slug:'example',company:'Example',enabled:true}],job_submissions:[record('success',jobs[0],a),record('draft',jobs[1],a,'Draft'),record('closed-success',jobs[2],a),record('private-success',jobs[1],other)]};
 const db=fixtureDatabase(tables);
 const load=moduleLoader({
  '@/lib/http/protected-route':{protectedRoute:async(_req,_access,work)=>{try{return Response.json(await work({id:actor,role,status:'active'}));}catch(error){return Response.json({error:error.message},{status:error.status||500});}}},
  '@/lib/db/admin':{database:()=>db,CaptureError,checkDb:error=>{if(error)throw error;}},
  '@/lib/public-directory':{PUBLIC_JOB_BOARDS:[]},
  '@/lib/jobs/adapters/native':{validateBoard(){},fetchSnapshot:async source=>({jobs:jobs.filter(job=>job.source.provider===source.provider&&job.state!=='closed')})},
  '@/lib/jobs/normalize':{isSoftwareJob:()=>true},
 });
 const get=async(path,query='')=>{const response=await load(`src/app/api/jobs/${path}route.ts`).GET(new Request(`https://portal.test/api/jobs/${path}?postedWithin=all&${query}`));return {status:response.status,...await response.json()};};
 return {tables,jobs,get};
}

for(const live of [false,true])test(`${live?'live':'saved'} jobs move only for the candidate who applied, with Drafts still available`,async()=>{
 const {get}=setup();const path=live?'live/':'';
 assert.deepEqual((await get(path,`candidateId=${a}`)).jobs.map(job=>job.id),['draft']);
 assert.deepEqual((await get(path,`candidateId=${b}`)).jobs.map(job=>job.id).sort(),['applied','draft']);
 assert.deepEqual((await get(path)).jobs.map(job=>job.id).sort(),['applied','draft']);
});

for(const [role,actor] of [['recruiter',recruiter],['technical_recruiter',technical],['super_admin',admin],['client',ownerA]])test(`${role} sees the same candidate-specific applied history, including closed jobs`,async()=>{
 const {get}=setup(role,actor),query=role==='client'?'':`candidateId=${a}`;
 const history=await get('applications/',query);
 assert.equal(history.status,200);assert.equal(history.candidateId,a);assert.equal(history.total,2);
 assert.deepEqual(history.applications.map(row=>row.id).sort(),['closed-success','success']);
 assert.ok(history.applications.every(row=>row.candidateId===a));
 const filtered=await get('applications/',query+'&provider=greenhouse');assert.equal(filtered.total,0);
 if(role!=='client')assert.equal((await get('applications/',`candidateId=${b}`)).total,0);
});

test('clients and staff cannot read applications for another inaccessible candidate',async()=>{
 for(const [role,actor,candidate] of [['client',ownerB,a],['recruiter',recruiter,other],['technical_recruiter',technical,other]]){
  const {get}=setup(role,actor);
  for(const path of ['','live/','applications/'])assert.equal((await get(path,`candidateId=${candidate}`)).status,404);
 }
});

test('super admin can inspect a candidate outside recruiter assignments',async()=>{
 const {get}=setup('super_admin',admin),result=await get('applications/',`candidateId=${other}`);
 assert.equal(result.status,200);assert.equal(result.total,1);assert.equal(result.applications[0].id,'private-success');
});

test('legacy extension URLs match the precise posting and do not hide another portal with the same title or external ID',async()=>{
 const {tables,get}=setup(),record=tables.job_submissions[0];record.job_id=null;record.job=null;record.job_url='https://jobs.ashbyhq.com/example/applied/application/confirmation?utm=ignored#tracking';
 const available=await get('',`candidateId=${a}`);assert.deepEqual(available.jobs.map(job=>job.id),['draft']);
 const history=await get('applications/',`candidateId=${a}&provider=ashby`);assert.equal(history.total,2);
});

test('filtering applied records happens before pagination and totals; completing a Draft updates the next read',async()=>{
 const {tables,get,jobs}=setup();
 tables.jobs=Array.from({length:65},(_,i)=>({...jobs[0],id:'job-'+i,application_url:`https://jobs.ashbyhq.com/example/job-${i}/application`,source_url:`https://jobs.ashbyhq.com/example/job-${i}`}));
 tables.job_submissions=tables.jobs.slice(0,52).map((job,i)=>({id:'submission-'+i,candidate_id:a,job_id:job.id,job_url:job.application_url,company_name:'Example',job_title:job.title,status:'Applied',capture_status:'submitted',submission_date:'2026-10-29',job}));
 const result=await get('',`candidateId=${a}`);assert.equal(result.total,13);assert.equal(result.jobs.length,13);assert.equal(result.hasMore,false);
 const target=tables.job_submissions[0];target.status='Draft';target.capture_status='submit_attempted';assert.equal((await get('',`candidateId=${a}`)).total,14);
 target.status='Applied';target.capture_status='submitted';assert.equal((await get('',`candidateId=${a}`)).total,13);
});

test('applied history deduplicates retries and never requires a new feed posting or current resume match',async()=>{
 const {tables,get}=setup();tables.job_submissions.push({...tables.job_submissions[0],id:'retry'});
 tables.candidates[0].primary_skills='Accounting';tables.candidates[0].target_job_titles='Accountant';tables.jobs[0].posted_at='2020-01-01';
 assert.equal((await get('applications/',`candidateId=${a}&postedWithin=7`)).total,2);
 assert.equal((await get('applications/')).requiresCandidate,true);
});

test('query-based posting identities remain distinct while tracking parameters are ignored',()=>{
 const first='https://company.test/careers?gh_jid=123&utm_source=example';
 const second='https://company.test/careers?gh_jid=456';
 assert.equal(applicationUrlKey(first),'https://company.test/careers?gh_jid=123');
 assert.deepEqual(withoutAppliedJobs([{id:'one',application_url:first},{id:'two',application_url:second}],{jobIds:[],urls:[applicationUrlKey(first)]}).map(job=>job.id),['two']);
 assert.notEqual(applicationUrlKey('https://boards.greenhouse.io/embed/job_app?for=one&token=123'),applicationUrlKey('https://boards.greenhouse.io/embed/job_app?for=one&token=456'));
});

test('candidate application history is read completely beyond one database page',async()=>{
 const {tables,jobs,get}=setup();
 tables.job_submissions=Array.from({length:511},(_,i)=>({id:'submission-'+i,candidate_id:a,job_id:'job-'+i,job_url:`https://jobs.ashbyhq.com/example/role-${i}`,company_name:'Example',job_title:'Software Engineer',status:'Applied',capture_status:'submitted',submission_date:'2026-10-29',job:{...jobs[0],id:'job-'+i,application_url:`https://jobs.ashbyhq.com/example/role-${i}`,source_url:`https://jobs.ashbyhq.com/example/role-${i}`}}));
 const result=await get('applications/',`candidateId=${a}`);assert.equal(result.total,511);assert.equal(result.applications.length,50);assert.equal(result.appliedKeys.jobIds.length,511);assert.equal(result.hasMore,true);
 const last=await get('applications/',`candidateId=${a}&page=10`);assert.equal(last.applications.length,11);assert.equal(last.hasMore,false);
});
