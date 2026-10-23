import 'server-only';
import {CaptureError} from '@/lib/db/admin';

export type AIProvider='openai';
export function getAIProvider():AIProvider{return 'openai';}

export function getAIModel(){return process.env.OPENAI_MODEL?.trim()||'gpt-4o-mini';}

function configuration(){
 const apiKey=process.env.OPENAI_API_KEY?.trim()||'';
 const baseURL=process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/,'')||undefined;
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
 return {apiKey,baseURL,model:getAIModel(),missing,issues};
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
