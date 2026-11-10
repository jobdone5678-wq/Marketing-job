import test from 'node:test';
import assert from 'node:assert/strict';
const load=()=>import('../src/lib/email-confirmations/gmail.ts');
const raw={id:'message-1',internalDate:'1791453600000',payload:{mimeType:'text/plain',headers:[
  {name:'From',value:'Acme Careers <careers@acme.test>'},{name:'To',value:'Alex <alex@example.test>'},
  {name:'Subject',value:'Application received'},{name:'Authentication-Results',value:'mx.google.com; dkim=pass header.i=@acme.test; spf=pass'},
],body:{data:Buffer.from('We have received your application.').toString('base64url')}}};

test('Gmail decoded receipt has authenticated sender and exact recipient',async()=>{
  const {gmailMessageToEmail}=await load();
  const email=gmailMessageToEmail(raw,['acme.test']);
  assert.equal(email.senderAuthenticated,true);assert.equal(email.senderAllowed,true);
  assert.deepEqual(email.to,['alex@example.test']);assert.equal(email.text,'We have received your application.');
});
test('a sender-supplied authentication result is not trusted',async()=>{
  const {gmailMessageToEmail}=await load();
  const forged=structuredClone(raw);forged.payload.headers[3].value='attacker.test; dkim=pass header.i=@acme.test';
  assert.equal(gmailMessageToEmail(forged,['acme.test']).senderAuthenticated,false);
});
test('an unrelated DKIM signing domain does not authenticate the sender',async()=>{
  const {gmailMessageToEmail}=await load();
  const forged=structuredClone(raw);forged.payload.headers[3].value='mx.google.com; dkim=pass header.i=@unrelated.test';
  assert.equal(gmailMessageToEmail(forged,['acme.test']).senderAuthenticated,false);
});

test('a longer DKIM domain cannot impersonate an approved sender domain',async()=>{
  const {gmailMessageToEmail}=await load();
  const forged=structuredClone(raw);forged.payload.headers[3].value='mx.google.com; dkim=pass header.i=@acme.test.attacker.test';
  assert.equal(gmailMessageToEmail(forged,['acme.test']).senderAuthenticated,false);
});
test('attached resumes and quoted HTML do not become application evidence',async()=>{
  const {gmailMessageToEmail}=await load();
  const message=structuredClone(raw);message.payload.mimeType='multipart/mixed';message.payload.body={};
  message.payload.parts=[{mimeType:'text/html',body:{data:Buffer.from('<p>Thanks for the introduction.</p><blockquote>Thank you for applying.</blockquote>').toString('base64url')}},
    {mimeType:'text/plain',filename:'resume.txt',body:{data:Buffer.from('Application received').toString('base64url')}}];
  const email=gmailMessageToEmail(message,['acme.test']);
  assert.ok(!email.text.includes('Thank you for applying'));
  assert.ok(!email.text.includes('Application received'));
});
test('provider access failures are surfaced without provider body or tokens',async()=>{
  const {gmailJson}=await load();const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('sensitive-provider-body',{status:401});
  try {await assert.rejects(gmailJson('profile','synthetic-token'),error=>error.status===401&&!error.message.includes('sensitive'));}
  finally{globalThis.fetch=original;}
});
