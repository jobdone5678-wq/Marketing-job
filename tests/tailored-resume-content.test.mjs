import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
import mammoth from 'mammoth';
const candidate={full_name:'Draft name',confirmed_facts:{full_name:'Alex & Morgan',email:'alex@example.test',current_job_title:'Software Engineer',primary_skills:'Python, SQL',secondary_skills:'Java',total_experience_years:'5',employment_history:[{employer:'Real Company',title:'Engineer',start:'2021-01',end:'2026-01',evidence:'Built Python services at Real Company.'}],education_history:[{degree:'BSc',institution:'Real University',evidence:'BSc at Real University.'}]}};
test('tailoring uses only reviewed facts, preserves history and never accepts invented fact IDs',()=>{
 const {resumeFactCatalog,buildTailoredContent}=moduleLoader()('src/lib/tailored-resumes/content.ts');
 const facts=resumeFactCatalog(candidate);
 const python=facts.find(f=>f.text==='Python');assert.ok(python);
 const output=buildTailoredContent(candidate,{title:'Python Developer',company:'Target'}, {summaryFactIds:[python.id],skillFactIds:[python.id]});
 assert.match(output.content,/Alex & Morgan/);assert.doesNotMatch(output.content,/Draft name/);
 assert.match(output.content,/Built Python services/);assert.match(output.content,/BSc at Real University/);
 assert.match(output.content,/Java/);assert.ok(output.content.indexOf('Python')<output.content.indexOf('Java'));
 assert.throws(()=>buildTailoredContent(candidate,{title:'Role'}, {summaryFactIds:['invented:Kubernetes'],skillFactIds:[]}),/unsupported/);
});
test('download is a real DOCX, round-trips text and handles XML characters and Unicode',async()=>{
 const {resumeDocx}=moduleLoader()('src/lib/tailored-resumes/docx.ts');
 const bytes=resumeDocx('Alex & Morgan\nPROFESSIONAL SUMMARY\nPython < SQL > Java\nEXPERIENCE\n- Built services — 50% faster');
 assert.equal(Buffer.from(bytes).subarray(0,2).toString(),'PK');
 const {value}=await mammoth.extractRawText({buffer:Buffer.from(bytes)});
 for(const text of ['Alex & Morgan','Python < SQL > Java','Built services — 50% faster'])assert.ok(value.includes(text),value);
});
