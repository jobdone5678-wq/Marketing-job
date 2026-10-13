import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';
class CaptureError extends Error {constructor(message,status){super(message);this.status=status;}}
function setup(t, extra={}) {
 const values={APP_URL:'https://nextkinhr.com',GOOGLE_MAIL_CLIENT_ID:'test-id',GOOGLE_MAIL_CLIENT_SECRET:'private-secret',EMAIL_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),SUPABASE_SERVICE_ROLE_KEY:'private-service',VERCEL_URL:'',VERCEL_PROJECT_PRODUCTION_URL:'',...extra};
 const before=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
 Object.assign(process.env,values);
 t.after(()=>{for(const key of Object.keys(values)){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}});
}
function loader(role='super_admin',cookieWrites=[]) {
 const server={CaptureError,requireSameOrigin(){},requireCaptureStaff:async()=>({profile:{id:'staff',role},client:fixtureDatabase({email_connections:[]})}),checkDb(){},captureErrorResponse:error=>Response.json({error:error.message},{status:error.status||500})};
 return moduleLoader({'./server':server,'@/lib/email-confirmations/server':server,'next/headers':{cookies:async()=>({set:(...args)=>cookieWrites.push(args)})},'next/server':{NextResponse:{redirect:url=>Response.redirect(url)}}});
}
test('invalid Gmail setup reports only variable names and safe reasons',t=>{
 setup(t,{APP_URL:'https://user:private-secret@nextkinhr.com',EMAIL_TOKEN_ENCRYPTION_KEY:'private-secret'});
 const status=loader()('src/lib/email-confirmations/config.ts').gmailConfiguration();
 assert.equal(status.configured,false);assert.ok(status.invalid.some(item=>item.startsWith('APP_URL')));
 assert.ok(status.invalid.some(item=>item.startsWith('EMAIL_TOKEN_ENCRYPTION_KEY')));
 assert.ok(!JSON.stringify(status).includes('private-secret'));
});
test('only administrators receive Gmail setup diagnostics',async t=>{
 setup(t,{GOOGLE_MAIL_CLIENT_SECRET:''});
 const admin=await (await loader()('src/app/api/email-connections/route.ts').GET()).json();
 assert.ok(admin.gmailSetup.missing.includes('GOOGLE_MAIL_CLIENT_SECRET'));
 const recruiter=await (await loader('recruiter')('src/app/api/email-connections/route.ts').GET()).json();
 assert.equal(recruiter.gmailConfigured,false);assert.equal(recruiter.gmailSetup,undefined);
 assert.ok(!JSON.stringify(admin).includes('private-service'));
});
test('Gmail connect moves alias visitors to canonical host before writing OAuth cookies',async t=>{
 setup(t);const writes=[];
 const response=await loader('recruiter',writes)('src/app/api/email-connections/gmail/connect/route.ts').POST(new Request('https://www.nextkinhr.com/api/email-connections/gmail/connect',{method:'POST'}));
 assert.equal(response.status,200);assert.equal((await response.json()).url,'https://nextkinhr.com/dashboard/email-confirmations?mail=reconnect');
 assert.equal(writes.length,0);
});
test('canonical Gmail connect uses a secure host-only cookie and matching callback',async t=>{
 setup(t);const writes=[];
 const response=await loader('recruiter',writes)('src/app/api/email-connections/gmail/connect/route.ts').POST(new Request('https://nextkinhr.com/api/email-connections/gmail/connect',{method:'POST'}));
 const authUrl=new URL((await response.json()).url);
 assert.equal(authUrl.searchParams.get('redirect_uri'),'https://nextkinhr.com/api/email-connections/gmail/callback');
 assert.equal(writes.length,1);assert.equal(writes[0][2].secure,true);assert.equal(writes[0][2].domain,undefined);
});
test('Gmail callback rejects a different host before touching the consent cookie',async t=>{
 setup(t);const writes=[];
 const response=await loader('recruiter',writes)('src/app/api/email-connections/gmail/callback/route.ts').GET(new Request('https://www.nextkinhr.com/api/email-connections/gmail/callback?code=private-code'));
 assert.equal(response.headers.get('location'),'https://nextkinhr.com/dashboard/email-confirmations?mail=connection_failed');
 assert.equal(writes.length,0);
});
test('Gmail deployment URL fallback is normalized without exposing credentials',t=>{
 setup(t,{APP_URL:'  ',VERCEL_PROJECT_PRODUCTION_URL:' nextkinhr.com '});
 const config=loader()('src/lib/email-confirmations/config.ts');
 assert.equal(config.emailConfig().redirectUri,'https://nextkinhr.com/api/email-connections/gmail/callback');
 assert.ok(!JSON.stringify(config.gmailConfiguration()).includes('private-secret'));
});
