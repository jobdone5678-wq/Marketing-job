import test from 'node:test';import assert from 'node:assert/strict';import {normalizeSnapshot,employment} from '../src/lib/jobs/normalize.ts';
test('provider metadata wins and permanent W2 is not contract',()=>{assert.equal(employment('FullTime','W2 position. Our clients have contracts.').type,'permanent');assert.equal(employment(null,'This is a contract position.').type,'contract');assert.equal(employment(null,'We manage contract customers.').type,'unknown');assert.equal(employment(null,'This is a contract position. This is a permanent role.').type,'unknown');});
test('all listed Ashby jobs have stable URL identities; missing facts remain null',()=>{const jobs=Array.from({length:60},(_,i)=>({title:'Engineer',jobUrl:'https://jobs.ashbyhq.com/fixture/'+i,applyUrl:'https://jobs.ashbyhq.com/fixture/'+i+'/application',employmentType:'Contract',descriptionPlain:'Python required',isListed:true}));jobs.push({title:'Hidden',isListed:false});const source={provider:'ashby',company:'Fixture'};const a=normalizeSnapshot(source,{jobs}),b=normalizeSnapshot(source,{jobs});assert.equal(a.jobs.length,60);assert.equal(a.completeness,'complete');assert.equal(a.jobs[0].external_id,b.jobs[0].external_id);assert.equal(a.jobs[0].location,null);assert.equal(a.jobs[0].employment_type,'contract');});
test('invalid listed records and missing Greenhouse totals prevent closure',()=>{assert.equal(normalizeSnapshot({provider:'ashby',company:'Fixture'},{jobs:[{title:'Bad'}]}).completeness,'partial');assert.equal(normalizeSnapshot({provider:'greenhouse',company:'Fixture'},{jobs:[]}).completeness,'partial');assert.equal(normalizeSnapshot({provider:'greenhouse',company:'Fixture'},{jobs:[],meta:{total:0}}).completeness,'complete');});

test("negated arrangements are not advertised as supported",()=>{assert.equal(employment("Contract","No C2C applications accepted.").arrangements,null);});

test('provider publication dates survive normalization without using provider update or closure timestamps',()=>{
 const gh=normalizeSnapshot({provider:'greenhouse',company:'Fixture'},{jobs:[{id:1,title:'Engineer',absolute_url:'https://boards.greenhouse.io/fixture/jobs/1',first_published:'2026-09-01T12:00:00-04:00',updated_at:'2026-10-12T10:00:00Z',closed_at:'2026-11-01T00:00:00Z'}],meta:{total:1}}).jobs[0];
 assert.equal(gh.posted_at,'2026-09-01T16:00:00.000Z');assert.equal(gh.closes_at,null);
 const ashby=normalizeSnapshot({provider:'ashby',company:'Fixture'},{jobs:[{title:'Engineer',jobUrl:'https://jobs.ashbyhq.com/fixture/1',publishedAt:'2026-10-01T01:30:00Z'}]}).jobs[0];
 assert.equal(ashby.posted_at,'2026-10-01T01:30:00.000Z');assert.equal(ashby.closes_at,null);
});
test('missing or malformed provider dates remain unknown and do not borrow sync or updated dates',()=>{
 for(const publishedAt of [undefined,'not-a-date','2026-02-30T12:00:00Z','2026-01-01T12:00:00',42]){
  const job=normalizeSnapshot({provider:'ashby',company:'Fixture'},{jobs:[{title:'Engineer',jobUrl:'https://jobs.ashbyhq.com/fixture/1',publishedAt,updated_at:'2026-10-12T00:00:00Z'}]}).jobs[0];
  assert.equal(job.posted_at,null);assert.equal(job.closes_at,null);
 }
});
test('publication changes are part of the versioned job content hash',()=>{
 const snapshot=publishedAt=>normalizeSnapshot({provider:'ashby',company:'Fixture'},{jobs:[{title:'Engineer',jobUrl:'https://jobs.ashbyhq.com/fixture/1',publishedAt}]}).jobs[0];
 assert.notEqual(snapshot('2026-09-01T00:00:00Z').content_hash,snapshot('2026-10-01T00:00:00Z').content_hash);
});
