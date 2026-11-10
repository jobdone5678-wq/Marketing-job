import test from 'node:test';import assert from 'node:assert/strict';import {validateMatch} from '../src/lib/ai/match-validation.ts';
const candidate={primary_skills:'Python',visa_status:null};const job='Must know Python. Must know SQL.';
test('zero overlap has no fabricated high baseline and unknowns count',()=>{const r=validateMatch({requirements:[{requirement:'SQL',jobEvidence:'Must know SQL.',status:'met',candidateField:'primary_skills',candidateEvidence:'SQL'}],constraints:[]},candidate,job);assert.equal(r.coverage,0);assert.equal(r.requirements[0].status,'unknown');});
test('unsupported job requirements are removed; no evidence produces null',()=>{assert.equal(validateMatch({requirements:[{requirement:'AWS',jobEvidence:'AWS required',status:'met',candidateField:'primary_skills',candidateEvidence:'Python'}],constraints:[]},candidate,job).coverage,null);});
test('supported facts and explicit conflicts are separate',()=>{const r=validateMatch({requirements:[{requirement:'Python',jobEvidence:'Must know Python.',status:'met',candidateField:'primary_skills',candidateEvidence:'Python'},{requirement:'SQL',jobEvidence:'Must know SQL.',status:'unknown',candidateField:null,candidateEvidence:null}],constraints:[]},candidate,job);assert.equal(r.coverage,50);});

const criterion=(requirement)=>({requirement,jobEvidence:requirement,status:'unknown',candidateField:null,candidateEvidence:null});
test('a literal reviewed skill supports a prose requirement with alternatives',()=>{
 const requirement='Strong background in TypeScript/JavaScript or Python';
 const r=validateMatch({requirements:[criterion(requirement)],constraints:[]},{primary_skills:'Python, SQL'},requirement);
 assert.equal(r.coverage,100);assert.equal(r.requirements[0].status,'met');assert.equal(r.requirements[0].candidateEvidence,'Python');
});
test('AND requirements need every skill and can cite separate reviewed fields',()=>{
 const requirement='Experience with Python and SQL';const input={requirements:[criterion(requirement)],constraints:[]};
 assert.equal(validateMatch(input,{primary_skills:'Python'},requirement).coverage,0);
 const r=validateMatch(input,{primary_skills:'Python',secondary_skills:'SQL'},requirement);
 assert.equal(r.coverage,100);assert.deepEqual(r.requirements[0].candidateCitations,[{field:'primary_skills',evidence:'Python'},{field:'secondary_skills',evidence:'SQL'}]);
});
test('skill aliases work without confusing JavaScript with Java or inventing years of experience',()=>{
 for(const [requirement,skills,coverage] of [['React.js','React',100],['Java','JavaScript',0],['C++','C#',0],['5 years of Python','Python',0]]){
  assert.equal(validateMatch({requirements:[criterion(requirement)],constraints:[]},{primary_skills:skills},requirement).coverage,coverage);
 }
});
test('no reviewed professional facts is insufficient evidence, not a zero qualification score',()=>{
 assert.equal(validateMatch({requirements:[criterion('SQL')],constraints:[]},{full_name:'SQL',email:'sql@example.test'},'SQL').coverage,null);
});
