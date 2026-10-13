import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
class CaptureError extends Error {constructor(message,status){super(message);this.status=status;}}
function environment(t,values){
 const names=['OPENAI_API_KEY','OPENAI_BASE_URL','OPENAI_MODEL','NODE_ENV','APP_URL','VERCEL_URL','VERCEL_PROJECT_PRODUCTION_URL','GOOGLE_MAIL_CLIENT_ID','GOOGLE_MAIL_CLIENT_SECRET','EMAIL_TOKEN_ENCRYPTION_KEY','SUPABASE_SERVICE_ROLE_KEY'];
 const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 for(const name of names){delete process.env[name];if(values[name]!==undefined)process.env[name]=values[name];}
 t.after(()=>{for(const name of names){if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];}});
}
const load=()=>moduleLoader({'@/lib/db/admin':{CaptureError},'./server':{CaptureError}});
test('AI key alone uses the supported defaults and agrees with configuration status',t=>{
 environment(t,{OPENAI_API_KEY:' synthetic-key '});const config=load()('src/lib/ai/config.ts');
 assert.equal(config.aiConfiguration().configured,true);
 assert.equal(config.requireAIConfiguration().apiKey,'synthetic-key');
 assert.equal(config.requireAIConfiguration().model,'gpt-4o-mini');
});
test('production rejects a localhost AI gateway and exposes safe actionable diagnostics',t=>{
 environment(t,{OPENAI_API_KEY:'secret-test',OPENAI_BASE_URL:'http://localhost:1234/v1',OPENAI_MODEL:'model',NODE_ENV:'production'});
 const config=load()('src/lib/ai/config.ts');
 assert.equal(config.aiConfiguration().configured,false);
 assert.throws(()=>config.requireAIConfiguration(),/public HTTPS/);
 assert.ok(!JSON.stringify(config.aiConfiguration()).includes('secret-test'));
});
test('Gmail configuration diagnostics name missing variables without exposing credentials',t=>{
 environment(t,{APP_URL:'https://nextkinhr.com',GOOGLE_MAIL_CLIENT_ID:'synthetic-id'});
 const config=load()('src/lib/email-confirmations/config.ts');const status=config.gmailConfiguration();
 assert.equal(status.configured,false);assert.ok(status.missing.includes('GOOGLE_MAIL_CLIENT_SECRET'));
 assert.equal(JSON.stringify(status).includes('synthetic-id'),false);
});
test('Gmail canonical production origin and callback URI are consistent',t=>{
 environment(t,{APP_URL:' nextkinhr.com ',GOOGLE_MAIL_CLIENT_ID:' id ',GOOGLE_MAIL_CLIENT_SECRET:' secret ',EMAIL_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),SUPABASE_SERVICE_ROLE_KEY:'service'});
 const config=load()('src/lib/email-confirmations/config.ts');
 assert.equal(config.emailConfig().redirectUri,'https://nextkinhr.com/api/email-connections/gmail/callback');
 assert.equal(config.emailConfig().clientId,'id');
 assert.equal(config.gmailConfiguration().configured,true);
});
