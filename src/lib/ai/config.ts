import 'server-only';
import {CaptureError} from '@/lib/db/admin';

export type AIProvider='openai';
export function getAIProvider():AIProvider{return 'openai';}

export function getAIModel(explicitBaseURL?: string, explicitApiKey?: string){
  const raw = process.env.OPENAI_MODEL?.trim();
  const apiKey = explicitApiKey || process.env.OPENAI_API_KEY?.trim() || '';
  const baseURL = explicitBaseURL || (apiKey.startsWith('sk-or-') ? 'https://openrouter.ai/api/v1' : apiKey.startsWith('sk-xt-') ? 'https://api.xkiro.com/v1' : process.env.OPENAI_BASE_URL?.trim() || '');

  // Mistral mappings
  if (raw === 'mistralai/mistral-large-4-0' || raw === 'mistral-large-4-0') {
    return 'mistralai/mistral-large-2512';
  }

  // Muse Spark mappings
  if (raw === 'free/muse-spark-1.3' || raw === 'muse-spark-1.3') {
    if (baseURL.includes('openrouter')) {
      return 'meta/muse-spark-1.3';
    }
    // If on xkiro, muse-spark doesn't exist so route to xkiro's free mistral
    return 'mistralai/mistral-large-2512';
  }

  if (baseURL.includes('xkiro') && (raw === 'auto' || !raw || raw.startsWith('meta/'))) {
    return 'mistralai/mistral-large-2512';
  }
  return raw || 'gpt-4o-mini';
}
export function getAIResponseFormat(){return process.env.OPENAI_RESPONSE_FORMAT?.trim()==='json_schema'?'json_schema' as const:'json_object' as const;}

function configuration(){
 const apiKey=process.env.OPENAI_API_KEY?.trim()||'';
 let baseURL=process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/,'')||undefined;

 // Auto-detect provider if key has a known provider prefix
 if (apiKey.startsWith('sk-or-')) {
   baseURL = 'https://openrouter.ai/api/v1';
 } else if (apiKey.startsWith('sk-xt-')) {
   baseURL = 'https://api.xkiro.com/v1';
 }

 const missing=apiKey?[]:['OPENAI_API_KEY'];
 const issues:string[]=[];
 if(baseURL){
  try{
   const url=new URL(baseURL);
   const isLocal=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
   if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)issues.push('OPENAI_BASE_URL must be an HTTP(S) API base URL without credentials, query parameters or fragments.');
   if(process.env.NODE_ENV==='production'&&(isLocal||url.protocol!=='https:'))issues.push('Production AI requires a public HTTPS API endpoint. A localhost gateway runs only on your computer.');
  }catch{issues.push('OPENAI_BASE_URL must be a valid API base URL.');}
 }
 return {apiKey,baseURL,model:getAIModel(baseURL,apiKey),missing,issues};
}
export function aiConfiguration(){
 const {model,missing,issues}=configuration();
 return {configured:missing.length===0&&issues.length===0,provider:'openai' as const,model,missing,issues};
}
export function requireAIConfiguration(){
 const {apiKey,baseURL,model,missing,issues}=configuration();
 if(missing.length)throw new CaptureError('AI is not configured in this server or worker. Set OPENAI_API_KEY on the processing worker (and on this server if its processing webhook is enabled), then restart the configured service.',503);
 if(issues.length)throw new CaptureError(issues.join(' '),503);
 return {apiKey,baseURL:baseURL?.replace('//localhost:','//127.0.0.1:'),model};
}
