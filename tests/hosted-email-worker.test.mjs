import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('hosted email worker accepts environment-only startup without requiring a local env file',async()=>{
 const cwd=await mkdtemp(path.join(tmpdir(),'nextkinhr-worker-env-'));
 try{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const script=path.resolve('scripts/email-sync-worker.mjs');
  // Deliberately invalid secret stops startup before any mailbox/network operation.
  const args=pkg.scripts['worker:email'].split(' ').slice(1).map(arg=>arg==='scripts/email-sync-worker.mjs'?script:arg);
  const result=spawnSync(process.execPath,args,{cwd,env:{...process.env,APP_URL:'https://portal.test',EMAIL_SYNC_SECRET:'short'},encoding:'utf8',timeout:5000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Set APP_URL and EMAIL_SYNC_SECRET/);
  assert.doesNotMatch(result.stderr,/\.env\.local.*not found/);
 }finally{await rm(cwd,{recursive:true,force:true});}
});


test('hosted email worker never replaces host variables with local defaults',async()=>{
 const cwd=await mkdtemp(path.join(tmpdir(),'nextkinhr-worker-env-'));
 try{
  await writeFile(path.join(cwd,'.env.local'),'APP_URL=https://portal.test\nEMAIL_SYNC_SECRET=short\n');
  const result=spawnSync(process.execPath,[path.resolve('scripts/email-sync-worker.mjs')],{cwd,env:{...process.env,APP_URL:'http://unsafe.example.test',EMAIL_SYNC_SECRET:'x'.repeat(32)},encoding:'utf8',timeout:5000});
  assert.equal(result.status,1);assert.match(result.stderr,/APP_URL must use HTTPS or localhost/);
 }finally{await rm(cwd,{recursive:true,force:true});}
});
