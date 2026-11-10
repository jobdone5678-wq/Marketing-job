import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';

test('database timing stays isolated between concurrent requests and counts failed calls',async()=>{
 const {withDatabaseTiming,databaseTiming,createTimedDatabaseFetch}=moduleLoader()('src/lib/db/timing.ts');
 const fetcher=createTimedDatabaseFetch(async input=>{await new Promise(r=>setTimeout(r,5));if(input==='fail')throw new Error('network');return new Response('{}');});
 const [one,two]=await Promise.all([
  withDatabaseTiming(async()=>{await fetcher('one');return {...databaseTiming()};}),
  withDatabaseTiming(async()=>{await Promise.all([fetcher('two'),fetcher('fail').catch(()=>{})]);return {...databaseTiming()};})
 ]);
 assert.equal(one.calls,1);assert.equal(two.calls,2);assert.ok(one.ms>=0&&two.ms>=0);assert.equal(databaseTiming(),undefined);
});
