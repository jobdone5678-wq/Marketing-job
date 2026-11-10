import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';
const id='10000000-0000-4000-8000-000000000301';
test('portal reports ATS outdated after manual content edits and current for assessed content',async()=>{
 const content='Jane\nSKILLS\nPython';const record={id,candidate_id:id,brief_id:null,data:{ats:{score:100},atsContentHash:createHash('sha256').update(content).digest('hex')},content};
 const db=fixtureDatabase({tailored_resumes:[record]});db.rpc=async()=>({data:true,error:null});
 const load=moduleLoader({'@/lib/db/admin':{database:()=>db,CaptureError:Error},'@/lib/job-briefs/repository':{checkWorkflowDb:e=>{if(e)throw e;}},'@/lib/resumes/repository':{candidateAccess:async()=>({id})}});
 const {getTailoredResume}=load('src/lib/tailored-resumes/repository.ts');
 assert.equal((await getTailoredResume({role:'client'},id)).resume.atsStale,false);
 record.content='Jane\nSKILLS\nJava';assert.equal((await getTailoredResume({role:'client'},id)).resume.atsStale,true);
});
