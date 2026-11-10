import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateResumeMarkdown} from '../src/lib/candidate-resume-export.ts';

test('candidate exports contain only reviewed facts and never invented default experience',()=>{
 const candidate={id:'a',full_name:'Alex Morgan',provenance_status:'confirmed',primary_skills:'Java',employment_history:[{title:'Engineer',employer:'Example Systems',start:'2022',end:'2024'}]};
 const text=candidateResumeMarkdown(candidate);
 assert.match(text,/Example Systems/);assert.match(text,/Java/);
 assert.doesNotMatch(text,/5\+|USA|verified professional|Present|University/);
 assert.throws(()=>candidateResumeMarkdown({...candidate,provenance_status:'legacy_unconfirmed'}),/Review and confirm/);
});
