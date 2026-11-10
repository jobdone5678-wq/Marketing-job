import assert from 'node:assert/strict';
const base=new URL(process.argv[2]||'http://127.0.0.1:3101');
const uuid='10000000-0000-0000-0000-000000000001';
const cases=[['GET','/api/candidates'],['POST','/api/candidates'],['GET','/api/jobs'],['GET','/api/job-sources'],['POST','/api/job-sources'],['POST','/api/job-sources/'+uuid+'/sync'],['POST','/api/resumes'],['POST','/api/resumes/'+uuid+'/confirm'],['GET','/api/tasks/'+uuid],['POST','/api/matches'],['POST','/api/packets'],['GET','/api/application-intents'],['POST','/api/application-intents'],['POST','/api/extension/pair-code'],['GET','/api/extension/credentials'],['POST','/api/extension/events']];
for(const [method,path] of cases){const response=await fetch(new URL(path,base),{method,headers:{Origin:base.origin,'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)});assert.equal(response.status,401,`${method} ${path}`);console.log(`${method} ${path} -> 401`);}
const denied=await fetch(new URL('/api/candidates',base),{method:'POST',headers:{Origin:'https://untrusted.example.test'},body:'{}'});assert.equal(denied.status,403);
console.log('17 unauthenticated route and mutation-origin checks passed.');
