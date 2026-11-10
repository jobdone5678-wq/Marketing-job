import test from 'node:test';import assert from 'node:assert/strict';import {moduleLoader} from './helpers/load-ts-module.mjs';
class CaptureError extends Error{constructor(message,status){super(message);this.status=status;}}
test('web processing bounds provider time while durable worker retains the longer timeout',async()=>{
 const {withAIExecutionWindow,aiRequestTimeout}=moduleLoader({'@/lib/db/admin':{CaptureError}})('src/lib/ai/execution-window.ts');
 assert.equal(aiRequestTimeout(),120000);await withAIExecutionWindow(45000,async()=>assert.ok(aiRequestTimeout()<=20000));
 await withAIExecutionWindow(0,async()=>assert.throws(aiRequestTimeout,e=>e.status===502));assert.equal(aiRequestTimeout(),120000);
});
