import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';

type DatabaseTiming={calls:number;ms:number};
const requests=new AsyncLocalStorage<DatabaseTiming>();
export function withDatabaseTiming<T>(work:()=>Promise<T>):Promise<T>{return requests.run({calls:0,ms:0},work);}
export function databaseTiming(){return requests.getStore();}
/** Measure REST/RPC I/O without retaining URLs, credentials or query contents. */
export function createTimedDatabaseFetch(fetcher:typeof fetch):typeof fetch{
 return async(input,init)=>{
  const timing=requests.getStore();
  if(!timing)return fetcher(input,init);
  const started=performance.now();timing.calls++;
  try{return await fetcher(input,init);}finally{timing.ms+=performance.now()-started;}
 };
}
export const timedDatabaseFetch:typeof fetch=(input,init)=>createTimedDatabaseFetch(globalThis.fetch)(input,init);
