import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';

class CaptureError extends Error {constructor(message,status=400){super(message);this.status=status;}}
class ProviderError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const task={id:'task',lease_token:'lease'};
function harness(t,{responses,allowance=10}){
  const previous={key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL};
  process.env.OPENAI_API_KEY='synthetic-test-key';process.env.OPENAI_MODEL='synthetic-model';
  t.after(()=>{for(const [name,value] of [['OPENAI_API_KEY',previous.key],['OPENAI_MODEL',previous.model]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}});
  const requests=[],usage=[];
  class Provider {
    static APIError=ProviderError;
    chat={completions:{create:async request=>{
      requests.push(request);
      const response=responses[requests.length-1];
      if(response instanceof Error)throw response;
      return {choices:[{message:{content:JSON.stringify(response)}}]};
    }}};
  }
  const load=moduleLoader({
    openai:Provider,dotenv:{config(){}},
    '@/lib/db/admin':{CaptureError,checkDb:error=>{if(error)throw error;},database:()=>({
      rpc:async(name,args)=>{
        assert.equal(name,'reserve_ai_call');assert.equal(args.p_task,'task');assert.equal(args.p_lease,'lease');
        if(usage.length>=allowance)return {data:null,error:{message:'AI daily budget exhausted'}};
        const entry={id:'usage-'+(usage.length+1),status:'reserved'};usage.push(entry);return {data:entry.id,error:null};
      },
      from:table=>({update:values=>({eq:async(key,id)=>{assert.equal(table,'provider_usage');assert.equal(key,'id');Object.assign(usage.find(entry=>entry.id===id),values);return {error:null};}})}),
    })},
  });
  return {load,requests,usage,...load('src/lib/ai/client.ts')};
}
const requirements={requirements:[{requirement:'SQL',jobEvidence:'Requires SQL'}],constraints:[]};

test('JSON fallback reserves and records each provider attempt separately',async t=>{
  const adapter=harness(t,{responses:[new ProviderError('response_format is not supported'),requirements]});
  const {requirementsSchema}=adapter.load('src/lib/ai/requirements-validation.ts');
  assert.deepEqual(await adapter.structuredAI(task,requirementsSchema,'job_requirements','Extract requirements.','Requires SQL'),requirements);
  assert.equal(adapter.requests.length,2);
  assert.deepEqual(adapter.usage.map(row=>row.status),['failed_or_unknown','succeeded']);
  assert.equal(adapter.requests[0].response_format.type,'json_object');
  assert.equal(adapter.requests[1].response_format,undefined);
});

test('an exhausted allowance prevents the fallback provider request',async t=>{
  const adapter=harness(t,{allowance:1,responses:[new ProviderError('response_format is not supported'),requirements]});
  const {requirementsSchema}=adapter.load('src/lib/ai/requirements-validation.ts');
  await assert.rejects(adapter.structuredAI(task,requirementsSchema,'job_requirements','Extract requirements.','Requires SQL'),error=>error.status===429);
  assert.equal(adapter.requests.length,1);
  assert.deepEqual(adapter.usage.map(row=>row.status),['failed_or_unknown']);
});

for(const name of ['job_requirements','candidate_match'])test(`${name} sends its complete validated output shape to the provider`,async t=>{
  const result=name==='job_requirements'?requirements:{requirements:[{...requirements.requirements[0],status:'met',candidateField:'primary_skills',candidateEvidence:'SQL'}],constraints:[]};
  const adapter=harness(t,{responses:[result]});
  const schema=name==='job_requirements'?adapter.load('src/lib/ai/requirements-validation.ts').requirementsSchema:adapter.load('src/lib/ai/match-validation.ts').matchSchema;
  assert.deepEqual(await adapter.structuredAI(task,schema,name,'Extract supported facts.','Requires SQL'),result);
  const prompt=adapter.requests[0].messages[0].content;
  const marker='Required JSON Schema:\n';
  assert.ok(prompt.includes(marker),'provider must receive the schema, not an unspecified instruction to match it');
  const sent=JSON.parse(prompt.slice(prompt.indexOf(marker)+marker.length));
  assert.deepEqual(sent.required,['requirements','constraints']);
  assert.equal(sent.additionalProperties,false);
  assert.ok(sent.properties.requirements.items.required.includes('jobEvidence'));
  assert.deepEqual(sent.properties.constraints.items.properties.field.enum,['authorized_in_usa','need_sponsorship_now','need_sponsorship_future','open_to_relocation']);
  if(name==='candidate_match')assert.deepEqual(sent.properties.requirements.items.properties.status.enum,['met','missing','unknown']);
});

test('resume parsing keeps compatible legacy output, unknown fields and supported evidence',async t=>{
  const adapter=harness(t,{responses:[{personal_info:{full_name:'Synthetic Candidate',primary_skills:'SQL'},employment_history:[],education:[]}]});
  const {resumeSchema}=adapter.load('src/lib/ai/schemas.ts');
  const result=await adapter.structuredAI(task,resumeSchema,'resume_profile','Extract explicit facts.','Synthetic Candidate uses SQL');
  assert.equal(result.fields.full_name,'Synthetic Candidate');assert.equal(result.fields.authorized_in_usa,null);
  assert.deepEqual(result.evidence,[{field:'full_name',snippet:'Synthetic Candidate',page:1},{field:'primary_skills',snippet:'SQL',page:1}]);
  assert.deepEqual(adapter.usage.map(row=>row.status),['succeeded']);
});
