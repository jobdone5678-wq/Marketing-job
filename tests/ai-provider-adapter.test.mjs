import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
import OpenAI from 'openai';

class CaptureError extends Error {constructor(message,status=400){super(message);this.status=status;}}
class ProviderError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const task={id:'task',lease_token:'lease'};
function harness(t,{responses,allowance=10,responseFormat='json_object'}){
  const previous={key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL,format:process.env.OPENAI_RESPONSE_FORMAT};
  process.env.OPENAI_API_KEY='synthetic-test-key';process.env.OPENAI_MODEL='synthetic-model';
  process.env.OPENAI_RESPONSE_FORMAT=responseFormat;
  t.after(()=>{for(const [name,value] of [['OPENAI_API_KEY',previous.key],['OPENAI_MODEL',previous.model],['OPENAI_RESPONSE_FORMAT',previous.format]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}});
  const requests=[],usage=[];
  class Provider {
    static APIError=ProviderError;
    static APIConnectionError=OpenAI.APIConnectionError;
    static APIConnectionTimeoutError=OpenAI.APIConnectionTimeoutError;
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

test('strict output sends the contract as a response schema rather than input to extract',async t=>{
 const adapter=harness(t,{responseFormat:'json_schema',responses:[requirements]});
 const {requirementsSchema}=adapter.load('src/lib/ai/requirements-validation.ts');
 assert.deepEqual(await adapter.structuredAI(task,requirementsSchema,'job_requirements','Extract facts.','Requires SQL'),requirements);
 const request=adapter.requests[0];
 assert.equal(request.response_format.type,'json_schema');
 assert.equal(request.response_format.json_schema.strict,true);
 assert.deepEqual(request.response_format.json_schema.schema.required,['requirements','constraints']);
 assert.ok(!request.messages[0].content.includes('Required JSON Schema:'));
});

test('strict format rejection keeps the complete schema in the prompt-only fallback',async t=>{
 const adapter=harness(t,{responseFormat:'json_schema',responses:[new ProviderError('json_schema not supported'),requirements]});
 const {requirementsSchema}=adapter.load('src/lib/ai/requirements-validation.ts');
 assert.deepEqual(await adapter.structuredAI(task,requirementsSchema,'job_requirements','Extract facts.','Requires SQL'),requirements);
 assert.equal(adapter.requests[1].response_format,undefined);
 assert.ok(adapter.requests[1].messages[0].content.includes('Required JSON Schema:'));
 assert.deepEqual(adapter.usage.map(row=>row.status),['failed_or_unknown','succeeded']);
});

test('provider payment rejection explains billing rather than blaming the API key or connection',async t=>{
 const adapter=harness(t,{responses:[new ProviderError('private provider billing response',402)]});
 const {requirementsSchema}=adapter.load('src/lib/ai/requirements-validation.ts');
 await assert.rejects(adapter.structuredAI(task,requirementsSchema,'job_requirements','Extract facts.','Requires SQL'),e=>e.status===402&&/payment required/i.test(e.message)&&!e.message.includes('private'));
 assert.equal(adapter.requests.length,1);
 assert.deepEqual(adapter.usage.map(row=>row.status),['failed_or_unknown']);
});

test('provider model-plan rejection explains access without exposing the provider response',async t=>{
 const adapter=harness(t,{responses:[new ProviderError('private account plan and provider body',403)]});
 const {requirementsSchema}=adapter.load('src/lib/ai/requirements-validation.ts');
 await assert.rejects(adapter.structuredAI(task,requirementsSchema,'job_requirements','Extract facts.','Requires SQL'),e=>e.status===403&&/account plan/i.test(e.message)&&!e.message.includes('private'));
 assert.equal(adapter.requests.length,1);
 assert.deepEqual(adapter.usage.map(row=>row.status),['failed_or_unknown']);
});

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

test('unrelated provider validation errors do not consume a second billed attempt',async t=>{
 const adapter=harness(t,{responses:[new ProviderError('unknown model',400),requirements]});
 const {requirementsSchema}=adapter.load('src/lib/ai/requirements-validation.ts');
 await assert.rejects(adapter.structuredAI(task,requirementsSchema,'job_requirements','Extract requirements.','Requires SQL'),error=>error.status===422&&!error.message.includes('unknown model'));
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


for(const name of ['job_requirements','candidate_match'])test(`${name} ignores extra provider metadata without trusting supplied scores`,async t=>{
 const core=name==='job_requirements'?requirements:{requirements:[{...requirements.requirements[0],status:'met',candidateField:'primary_skills',candidateEvidence:'SQL'}],constraints:[]};
 const response={...core,coverage:999,summary:'Provider metadata',requirements:core.requirements.map(r=>({...r,confidence:1}))};
 const adapter=harness(t,{responses:[response]});const schema=name==='job_requirements'?adapter.load('src/lib/ai/requirements-validation.ts').requirementsSchema:adapter.load('src/lib/ai/match-validation.ts').matchSchema;
 assert.deepEqual(await adapter.structuredAI(task,schema,name,'Extract exact facts.','Requires SQL'),core);
 assert.equal(adapter.requests.length,1);
});

test('malformed required AI fields remain rejected with a safe schema error',async t=>{
 const adapter=harness(t,{responses:[{requirements:[{requirement:'SQL',jobEvidence:123}],constraints:[],summary:'private provider content'}]});
 const {requirementsSchema}=adapter.load('src/lib/ai/requirements-validation.ts');
 await assert.rejects(adapter.structuredAI(task,requirementsSchema,'job_requirements','Extract facts.','Requires SQL'),e=>e.status===422&&/required response format/i.test(e.message)&&!e.message.includes('private provider content'));
});


test('unexpected gateway failures are distinguished from invalid model output without leaking details',async t=>{
 const adapter=harness(t,{responses:[new Error('private upstream credentials and response body')]});const {requirementsSchema}=adapter.load('src/lib/ai/requirements-validation.ts');
 await assert.rejects(adapter.structuredAI(task,requirementsSchema,'job_requirements','Extract facts.','Requires SQL'),e=>e.status===422&&/gateway failed before/i.test(e.message)&&!e.message.includes('private'));
});

for(const timeout of [false,true])test(`SDK ${timeout?'timeout':'connection'} errors are classified by type rather than inherited Error name`,async t=>{
 const failure=timeout?new OpenAI.APIConnectionTimeoutError():new OpenAI.APIConnectionError({cause:new Error('private upstream detail')});
 assert.equal(failure.name,'Error');
 const adapter=harness(t,{responses:[failure]});const {requirementsSchema}=adapter.load('src/lib/ai/requirements-validation.ts');
 await assert.rejects(adapter.structuredAI(task,requirementsSchema,'job_requirements','Extract facts.','Requires SQL'),e=>e.status===502&&(timeout?/timed out/i:/could not be reached/i).test(e.message)&&!e.message.includes('private'));
 assert.equal(adapter.requests.length,1);
 assert.deepEqual(adapter.usage.map(row=>row.status),['failed_or_unknown']);
});
