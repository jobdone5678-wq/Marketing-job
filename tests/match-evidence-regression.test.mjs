import test from 'node:test';import assert from 'node:assert/strict';import {validateMatch} from '../src/lib/ai/match-validation.ts';
test('SQL is not proved by NoSQL or by explicitly negated experience',()=>{for(const skills of ['NoSQL','No experience with SQL']){const r=validateMatch({requirements:[{requirement:'SQL',jobEvidence:'SQL required',status:'met',candidateField:'primary_skills',candidateEvidence:skills}],constraints:[]},{primary_skills:skills},'SQL required');assert.notEqual(r.requirements[0].status,'met');}});

for(const [requirement,skills] of [['Python','No experience with Java, Python or SQL'],['CI/CD','CI'],['Python and CI/CD','Python, CI'],['Python or CI/CD','CI'],['Go','Ready to go above and beyond']])test(`${requirement} is not supported by ambiguous or negated text`,()=>{
 const r=validateMatch({requirements:[{requirement,jobEvidence:requirement+' required',status:'met',candidateField:'primary_skills',candidateEvidence:skills}],constraints:[]},{primary_skills:skills},requirement+' required');
 assert.equal(r.coverage,0);assert.equal(r.requirements[0].status,'unknown');
});
test('literal Go and the complete CI/CD compound remain supported',()=>{
 for(const skill of ['Go','CI/CD']){
  const r=validateMatch({requirements:[{requirement:skill,jobEvidence:skill+' required',status:'unknown',candidateField:null,candidateEvidence:null}],constraints:[]},{primary_skills:skill},skill+' required');assert.equal(r.coverage,100);
 }
});
