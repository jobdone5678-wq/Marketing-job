import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import {moduleLoader} from './helpers/load-ts-module.mjs';

function harness(response){
 const requests=[];
 class Provider{
  static APIError=OpenAI.APIError;
  static APIConnectionError=OpenAI.APIConnectionError;
  static APIConnectionTimeoutError=OpenAI.APIConnectionTimeoutError;
  chat={completions:{create:async input=>{requests.push(input);if(response instanceof Error)throw response;return response;}}};
 }
 return {...moduleLoader({openai:Provider})('src/lib/ai/transport-diagnostics.ts'),requests};
}
const config={apiKey:'private-key',baseURL:'https://example.test/v1',model:'test-model'};
test('transport check detects inherited settings differing from local defaults without disclosing values',async()=>{
 const h=harness({choices:[{message:{content:'{"test":true}'}}]});
 const result=await h.checkAITransport(config,{OPENAI_BASE_URL:'http://localhost:20128/v1',OPENAI_API_KEY:'other-private-key',OPENAI_MODEL:'other-model'});
 assert.equal(result.ok,true);
 assert.deepEqual(result.localDifferences,['OPENAI_BASE_URL','OPENAI_API_KEY','OPENAI_MODEL']);
 assert.equal(result.endpoint,'https://example.test');
 assert.equal(h.requests.length,1);
 assert.match(h.requests[0].messages[0].content,/invented/i);
 assert.ok(!JSON.stringify(result).includes('private-key'));
 assert.ok(!JSON.stringify(result).includes('other-model'));
});
for(const [status,failure] of [[401,'authentication'],[402,'payment_required'],[403,'access_denied'],[400,'request_rejected'],[404,'request_rejected'],[429,'rate_limited'],[502,'provider_unavailable']])test(`HTTP ${status} has a safe status and category`,async()=>{
 const error=OpenAI.APIError.generate(status,{error:{message:'private provider response with credentials'}},undefined,new Headers());
 const result=await harness(error).checkAITransport(config,{});
 assert.equal(result.ok,false);assert.equal(result.status,status);assert.equal(result.failure,failure);
 assert.ok(!JSON.stringify(result).includes('private'));
});
test('transport check returns safe nested refusal code without raw upstream details',async()=>{
 const cause=new TypeError('private headers',{cause:Object.assign(new Error('private URL'),{code:'ECONNREFUSED'})});
 const h=harness(new OpenAI.APIConnectionError({cause}));
 const result=await h.checkAITransport(config,{});
 assert.equal(result.ok,false);assert.equal(result.failure,'connection');assert.equal(result.code,'ECONNREFUSED');
 assert.ok(!JSON.stringify(result).includes('private'));
});
