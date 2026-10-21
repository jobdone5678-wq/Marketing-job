import {config} from 'dotenv';
import {moduleLoader} from '../tests/helpers/load-ts-module.mjs';
import {randomUUID} from 'node:crypto';
config({path:'.env.local',quiet:true});
class CaptureError extends Error{constructor(message,status=400){super(message);this.status=status;}}
let reservations=0;
const db={rpc:async name=>{if(name!=='reserve_ai_call')throw Error('Unexpected database operation');reservations++;return {data:randomUUID(),error:null};},from:table=>{if(table!=='provider_usage')throw Error('Unexpected database write');return {update:()=>({eq:async()=>({error:null})})};}};
const load=moduleLoader({'@/lib/db/admin':{CaptureError,checkDb:e=>{if(e)throw e;},database:()=>db}});
try{
 const {structuredAI}=load('src/lib/ai/client.ts');
 const {screeningSelectionSchema,validateScreening}=load('src/lib/extension-answers/evidence.ts');
 const facts=[{id:'skill:0',text:'TypeScript'},{id:'experience:0',text:'Built accessible React interfaces for internal reporting.'}];
 const questions=[{id:'skills',label:'Describe your relevant skills?',type:'text'},{id:'years',label:'How many years of Kubernetes experience?',type:'text'}];
 const selected=await structuredAI({id:randomUUID(),lease_token:randomUUID()},screeningSelectionSchema,'application_screening','Select relevant fact IDs only. For unknown duration leave factIds empty and option null. Never invent facts. Text questions use option null.',JSON.stringify({job:'React and TypeScript required. Kubernetes preferred.',facts,questions}));
 const output=validateScreening(questions,facts,selected);
 if(!output.answers.skills||output.answers.years)throw Error('Live model failed the grounded screening acceptance check.');
 console.log(JSON.stringify({ok:true,provider:'configured gateway',database:'in-memory accounting fixture; no production writes',reservations,supported:Object.keys(output.answers),unknown:output.decisions.filter(d=>d.status!=='supported').map(d=>d.questionId)}));
}catch(error){console.error(JSON.stringify({ok:false,error:error instanceof CaptureError?error.message:'Live screening acceptance failed.'}));process.exitCode=1;}
