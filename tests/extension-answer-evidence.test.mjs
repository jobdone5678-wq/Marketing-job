import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
const load=moduleLoader();
test('screening output rejects invented facts and exact option mismatches',()=>{
 const {validateScreening}=load('src/lib/extension-answers/evidence.ts');
 const facts=[{id:'skill:0',text:'TypeScript'}],questions=[{id:'q',label:'Relevant skills',type:'text'}];
 assert.throws(()=>validateScreening(questions,facts,{decisions:[{questionId:'q',factIds:['invented'],option:null}]}));
 assert.deepEqual(validateScreening(questions,facts,{decisions:[{questionId:'q',factIds:['skill:0'],option:null}]}).answers,{q:'TypeScript'});
 assert.throws(()=>validateScreening([{...questions[0],options:['Expert','Beginner']}],facts,{decisions:[{questionId:'q',factIds:['skill:0'],option:'Expert'}]}));
});
test('sensitive and unsupported legal or numeric questions stay manual',()=>{
 const {validateScreening}=load('src/lib/extension-answers/evidence.ts');
 for(const label of ['Are you authorized to work?','Years of Java experience?','What is your disability?','What salary do you expect?']){
  const result=validateScreening([{id:'q',label,type:'text'}],[{id:'skill:0',text:'Java'}],{decisions:[{questionId:'q',factIds:['skill:0'],option:null}]});
  assert.deepEqual(result.answers,{});
 }
});
test('missing answers remain explicitly unknown and duplicate model decisions fail',()=>{
 const {validateScreening}=load('src/lib/extension-answers/evidence.ts');
 assert.equal(validateScreening([{id:'q',label:'Relevant skills',type:'text'}],[],{decisions:[]}).decisions[0].status,'unknown');
 assert.throws(()=>validateScreening([{id:'q',label:'Skills',type:'text'}],[],{decisions:[{questionId:'q',factIds:[],option:null},{questionId:'q',factIds:[],option:null}]}));
});
