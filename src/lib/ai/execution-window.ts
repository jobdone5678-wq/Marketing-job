import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {CaptureError} from '@/lib/db/admin';
const deadlines=new AsyncLocalStorage<number>();
export function withAIExecutionWindow<T>(milliseconds:number,work:()=>Promise<T>){return deadlines.run(performance.now()+milliseconds,work);}
export function aiRequestTimeout(){
 const deadline=deadlines.getStore();if(deadline===undefined)return 120000;
 const remaining=Math.floor(deadline-performance.now());
 if(remaining<=0)throw new CaptureError('AI processing exceeded the request time limit. Retry or ask your administrator to use the separate worker.',502);
 return Math.max(1000, remaining - 2000);
}
