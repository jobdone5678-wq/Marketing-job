import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';

test('the comparison evaluates canonical job criteria against reviewed facts without a second AI guess',async()=>{
 const phrase='Strong background in TypeScript/JavaScript or Python';
 const candidate={id:'candidate',version:1,provenance_status:'confirmed',user_id:'actor',confirmed_facts:{primary_skills:'Python'}};
 const job={id:'job',version:1,state:'active',title:'Engineer',description:phrase};
 const db=fixtureDatabase({candidates:[candidate],jobs:[job],profiles:[{id:'actor',role:'client',status:'active'}],candidate_matches:[]});
 let saved;
 db.rpc=async(name,args)=>{assert.equal(name,'save_recruiting_artifact');saved=args;return {data:'match',error:null};};
 const load=moduleLoader({
  '@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error},
  './requirements':{jobRequirements:async()=>({requirements:[{requirement:phrase,jobEvidence:phrase}],constraints:[]})},
  './client':{getAIModel:()=> 'synthetic-model',structuredAI:()=>{throw new Error('Redundant provider guess');}},
 });
 const result=await load('src/lib/ai/match.ts').analyzeMatch({id:'task',lease_token:'lease',actor_id:'actor',payload:{candidateId:'candidate',jobId:'job',candidateVersion:1,jobVersion:1}});
 assert.equal(result.matchId,'match');assert.equal(saved.p_data.coverage,100);assert.equal(saved.p_data.requirements[0].candidateEvidence,'Python');
});
