import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

test('extension keeps candidate intents separate per tab and retries offline events with the same key',async()=>{
  const local={origin:'https://portal.example.test',token:'synthetic',outbox:[]},session={},delivered=[];
  let listener,alarm,offline=true;
  const storage=data=>({async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]]));},async set(values){Object.assign(data,values);},async remove(key){delete data[key];}});
  const chrome={storage:{local:storage(local),session:storage(session)},alarms:{create(){},onAlarm:{addListener(fn){alarm=fn;}}},runtime:{onMessage:{addListener(fn){listener=fn;}}},tabs:{onRemoved:{addListener(){}}}};
  const intents={first:{id:'first',attempt:0,job:{application_url:'https://jobs.ashbyhq.com/fixture/first/application'}},second:{id:'second',attempt:0,job:{application_url:'https://jobs.ashbyhq.com/fixture/second/application'}}};
  const fetch=async(url,options)=>{if(url.includes('/intents/'))return {ok:true,json:async()=>({intent:intents[url.split('/').pop()]})};if(offline)throw new Error('Offline');delivered.push(JSON.parse(options.body));return {ok:true,status:200};};
  const context=vm.createContext({chrome,fetch,URL,AbortSignal,crypto:{randomUUID},Date,Promise});
  vm.runInContext(await readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8'),context);
  const send=(tab,path,message)=>new Promise(resolve=>listener(message,{tab:{id:tab},url:'https://jobs.ashbyhq.com/fixture/'+path+'/application'},resolve));
  assert.equal((await send(1,'first',{intentId:'first',status:'submit_attempted',evidence:'Submit attempted'})).linked,true);
  assert.equal((await send(2,'second',{intentId:'second',status:'in_progress',evidence:'Form opened'})).linked,true);
  assert.equal(local.outbox.length,2);
  assert.deepEqual(Array.from(local.outbox,event=>event.intentId),['first','second']);
  const keys=Array.from(local.outbox,event=>event.eventKey);
  assert.equal((await send(1,'second',{status:'submitted'})).error,'Open this application from the portal to link it');
  assert.equal(local.outbox.length,2);
  offline=false;alarm();await vm.runInContext('serial',context);
  assert.deepEqual(delivered.map(event=>event.eventKey),keys);
  assert.equal(local.outbox.length,0);
  assert.equal((await send(1,'first',{status:'submit_attempted',evidence:'Retry submit attempted'})).linked,true);
  assert.equal(delivered.at(-1).intentId,'first');assert.equal(delivered.at(-1).attempt,2);
  assert.equal((await send(1,'first',{status:'confirmed'})).error,'Invalid event');
});

test('unlinked answer submissions retry offline with their original submission key',async()=>{
 const local={origin:'https://portal.example.test',token:'synthetic',outbox:[]},session={},delivered=[];
 let listener,alarm,offline=true;
 const storage=data=>({async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]]));},async set(values){Object.assign(data,values);},async remove(key){delete data[key];}});
 const chrome={storage:{local:storage(local),session:storage(session)},alarms:{create(){},onAlarm:{addListener(fn){alarm=fn;}}},runtime:{onMessage:{addListener(fn){listener=fn;}}},tabs:{onRemoved:{addListener(){}}}};
 const fetch=async(url,options)=>{if(offline)throw new Error('Offline');delivered.push({url,body:JSON.parse(options.body)});return {ok:true,status:200,json:async()=>({success:true})};};
 const context=vm.createContext({chrome,fetch,URL,AbortSignal,crypto:{randomUUID},Date,Promise});
 vm.runInContext(await readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8'),context);
 const key=randomUUID();
 const result=await new Promise(resolve=>listener({type:'auto_submit',payload:{candidateId:'candidate',eventKey:key,jobUrl:'https://jobs.ashbyhq.com/fixture/role/application',answers:[{key:'email',label:'Email',value:'edited@example.test'}]}},{tab:{id:3},url:'https://jobs.ashbyhq.com/fixture/role/application'},resolve));
 assert.equal(result.queued,true);assert.equal(local.outbox.length,1);
 offline=false;alarm();await vm.runInContext('serial',context);
 assert.equal(local.outbox.length,0);assert.equal(delivered[0].body.eventKey,key);assert.equal(delivered[0].body.answers[0].value,'edited@example.test');assert.ok(delivered[0].url.endsWith('/api/extension/auto-submit'));
});

test('answer drafts retain application identity through confirmation navigation and stay job-scoped',async()=>{
 const session={};let listener;
 const storage=data=>({async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]]));},async set(values){Object.assign(data,values);}});
 const chrome={storage:{local:storage({}),session:storage(session)},runtime:{onMessage:{addListener(fn){listener=fn;}}},tabs:{onRemoved:{addListener(){}}}};
 vm.runInNewContext(await readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8'),{chrome,URL,AbortSignal,crypto:{randomUUID},Date,Promise});
 const send=(path,message)=>new Promise(resolve=>listener(message,{tab:{id:1},url:'https://jobs.ashbyhq.com/fixture/'+path},resolve));
 const key=randomUUID();
 await send('role/application',{type:'save_answer_draft',candidateId:'candidate',eventKey:key,attempt:1,answers:[{key:'email',label:'Email',value:'edited@example.test'}]});
 const redirected=await send('role/confirmation',{type:'get_answer_draft'});
 assert.equal(redirected.eventKey,key);assert.equal(redirected.attempt,1);assert.equal(redirected.answers[0].value,'edited@example.test');
 assert.equal((await send('another-role/application',{type:'get_answer_draft'})).candidateId,undefined);
});
