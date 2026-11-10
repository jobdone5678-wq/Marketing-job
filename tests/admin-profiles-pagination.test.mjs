import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
test('management selectors load older staff and clients after the first profile page',async()=>{
 const calls=[];
 const {getAdminProfiles}=moduleLoader({'./api-client':{api:async url=>{calls.push(url);return url.endsWith('=0')?{profiles:[{id:'recent-client',role:'client'}],hasMore:true,nextOffset:500}:{profiles:[{id:'older-technical',role:'technical_recruiter'}],hasMore:false};}}})('src/lib/admin-profiles.ts');
 assert.deepEqual((await getAdminProfiles()).map(row=>row.id),['recent-client','older-technical']);assert.deepEqual(calls,['/api/admin/profiles?offset=0','/api/admin/profiles?offset=500']);
});
test('a broken page cursor fails visibly instead of looping or claiming the team is complete',async()=>{
 const {getAdminProfiles}=moduleLoader({'./api-client':{api:async()=>({profiles:[],hasMore:true,nextOffset:0})}})('src/lib/admin-profiles.ts');
 await assert.rejects(getAdminProfiles(),/complete team/);
});
