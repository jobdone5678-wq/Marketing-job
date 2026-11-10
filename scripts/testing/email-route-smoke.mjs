import assert from 'node:assert/strict';

const base=new URL(process.argv[2] || 'http://localhost:3000');
const origin=process.env.APP_URL ? new URL(process.env.APP_URL).origin : base.origin;
const cases=[
  ['GET','/api/email-confirmations',401,{}],
  ['GET','/api/email-connections',401,{}],
  ['POST','/api/email-confirmations/sync',401,{}],
  ['POST','/api/email-connections/gmail/connect',403,{Origin:'https://other.example.test'}],
  ['POST','/api/email-connections/gmail/connect',401,{Origin:origin}],
  ['POST','/api/email-confirmations/import',401,{Origin:origin}],
  ['POST','/api/email-confirmations/10000000-0000-0000-0000-000000000001/review',401,{Origin:origin}],
  ['GET','/dashboard/email-confirmations',307,{}],
];
for(const [method,path,status,headers] of cases) {
  const response=await fetch(new URL(path,base),{method,headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,status,`${method} ${path}`);
  console.log(`${method} ${path} -> ${response.status}`);
}
console.log('8 unauthenticated route and origin checks passed.');
