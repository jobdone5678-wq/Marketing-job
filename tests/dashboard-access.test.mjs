import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
function session(profile){return moduleLoader({
 '@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:profile,error:null})})})},
 'next/server':{NextResponse:{next:()=>new Response(null),redirect:url=>new Response(null,{status:307,headers:{location:String(url)}})}}
})('src/lib/middleware.ts').updateSession;}
function request(path){return {nextUrl:Object.assign(new URL('https://portal.test'+path),{clone:()=>new URL('https://portal.test'+path)}),cookies:{getAll:()=>[],set(){}}};}
test('pending staff cannot open dashboard pages and the public page does not redirect them back',async()=>{
 const update=session({role:'technical_recruiter',status:'pending'});
 assert.equal((await update(request('/dashboard/payroll'))).status,307);
 assert.equal((await update(request('/'))).status,200);
});
test('candidate accounts cannot open staff compensation or team administration pages',async()=>{
 const update=session({role:'client',status:'active'});
 assert.equal((await update(request('/dashboard/payroll'))).status,307);
 assert.equal((await update(request('/dashboard/team'))).status,307);
 assert.equal((await update(request('/dashboard/placements'))).status,200);
});

test('active users can read authoritative-role mismatch and callback errors on sign-in page',async()=>{
 const update=session({role:'client',status:'active'});
 assert.equal((await update(request('/?role_notice=existing_role'))).status,200);
 assert.equal((await update(request('/?error=oauth_failed'))).status,200);
 assert.equal((await update(request('/'))).status,307);
});
