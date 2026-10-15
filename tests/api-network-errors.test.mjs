import test from 'node:test';import assert from 'node:assert/strict';import {moduleLoader} from './helpers/load-ts-module.mjs';
test('API helper distinguishes browser connectivity failure from HTTP application errors',async t=>{
 const before=globalThis.fetch;t.after(()=>{globalThis.fetch=before;});const {api}=moduleLoader()('src/lib/api-client.ts');
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};await assert.rejects(api('/api/tasks/task'),e=>e.status===null&&/proxy|connection/i.test(e.message));
 globalThis.fetch=async()=>Response.json({error:'Sign in required'},{status:401});await assert.rejects(api('/api/tasks/task'),e=>e.status===401&&e.message==='Sign in required');
});
