import 'server-only';
import OpenAI from 'openai';

type Configuration={apiKey:string;baseURL?:string;model:string};
const networkCodes=new Set(['ECONNREFUSED','ECONNRESET','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','EACCES','EPERM','UND_ERR_CONNECT_TIMEOUT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT']);

// Explicit operator check only: no database, task claiming, or real document input.
export async function checkAITransport(config:Configuration,local:Record<string,string>={}){
 const effective={OPENAI_BASE_URL:config.baseURL||'https://api.openai.com/v1',OPENAI_API_KEY:config.apiKey,OPENAI_MODEL:config.model};
 const localDifferences=Object.entries(effective).filter(([name,value])=>{
  if(!local[name]?.trim())return false;
  const expected=local[name].trim();
  if(name==='OPENAI_BASE_URL')return expected.replace('//localhost:','//127.0.0.1:').replace(/\/+$/,'')!==value.replace(/\/+$/,'');
  return expected!==value;
 }).map(([name])=>name);
 const endpoint=new URL(effective.OPENAI_BASE_URL).origin;
 const client=new OpenAI({...config,maxRetries:0,timeout:20000});
 try{
  const response=await client.chat.completions.create({model:config.model,messages:[{role:'user',content:'Invented connection test only. Return JSON with test equal to true.'}],response_format:{type:'json_object'}});
  return {ok:!!response.choices[0]?.message.content,endpoint,localDifferences};
 }catch(error:unknown){
  let code:string|null=null;let cause:unknown=error;
  for(let i=0;i<6&&cause&&typeof cause==='object';i++){
   const entry=cause as {code?:unknown;cause?:unknown};
   if(typeof entry.code==='string'&&networkCodes.has(entry.code))code=entry.code;
   cause=entry.cause;
  }
  const status=error instanceof OpenAI.APIError?error.status??null:null;
  const failure=error instanceof OpenAI.APIConnectionTimeoutError?'timeout':error instanceof OpenAI.APIConnectionError?'connection':status===401?'authentication':status===402?'payment_required':status===403?'access_denied':status===400||status===404||status===422?'request_rejected':status===429?'rate_limited':status!==null&&status>=500?'provider_unavailable':'provider';
  return {ok:false,endpoint,localDifferences,failure,status,code};
 }
}
