import {spawn} from 'node:child_process';
const origin='http://127.0.0.1:3101';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3101'],{env:{...process.env,APP_URL:origin},stdio:['ignore','pipe','pipe']});
try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Isolated server did not start.')),30000);server.stdout.on('data',chunk=>{if(chunk.toString().includes('Ready in')){clearTimeout(timer);resolve();}});server.stderr.on('data',chunk=>process.stderr.write(chunk));server.once('exit',code=>{clearTimeout(timer);reject(new Error('Isolated server exited: '+code));});});
  for(const script of ['scripts/recruiting-route-smoke.mjs','scripts/email-route-smoke.mjs'])await new Promise((resolve,reject)=>{const check=spawn(process.execPath,[script,origin],{env:{...process.env,APP_URL:origin},stdio:'inherit'});check.once('exit',code=>code===0?resolve():reject(new Error(script+' failed: '+code)));});
} catch(error){console.error(error.message);process.exitCode=1;}
finally {server.kill();}
