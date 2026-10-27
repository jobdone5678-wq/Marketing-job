import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {moduleLoader} from './helpers/load-ts-module.mjs';
const require=createRequire(import.meta.url),engine=require('../browser-extension/resume-engine.js');
const job={jobTitle:'Senior Software Engineer',companyName:'Example Employer',jobUrl:'https://jobs.example.test/engineer',jobDescription:'Required: Java, React and SQL. Build reliable services, improve performance, and collaborate on customer-facing applications.'};
const source=`Alex Example
alex@example.test
TECHNICAL SKILLS
Languages: Java, JavaScript, SQL
Frameworks: React, Spring Boot
PROFESSIONAL EXPERIENCE
Senior Software Engineer — BluePeak Digital Solutions, Austin, TX
Mar 2022 – Present
• Built Java APIs for customer account management.
• Improved SQL query performance by 30%.
Software Engineer — VertexWave Technologies, Dallas, TX
Jul 2019 – Feb 2022
• Developed React dashboards for support teams.
EDUCATION
BSc Computer Science, Example University, 2019
LICENSES
License ABC123`;

test('complete source exposes responsibilities to AI and keeps role/date evidence out of bullets',()=>{
 const candidate=engine.candidateFromText(source);
 assert.equal(candidate.employment_history.length,2);
 const {extensionFactCatalog,buildContextualResume}=moduleLoader()('src/lib/tailored-resumes/extension-content.ts');
 const catalog=extensionFactCatalog(candidate);
 const api=catalog.find(row=>row.kind==='experience'&&row.text.includes('customer account'));
 const sql=catalog.find(row=>row.kind==='experience'&&row.text.includes('30%'));
 const react=catalog.find(row=>row.kind==='experience'&&row.text.includes('support teams'));
 assert.ok(api&&sql&&react);
 const output=buildContextualResume(candidate,job,{summaryFactIds:[api.id],skillFactIds:[],professionalSummary:'Software engineer delivering Java services and React interfaces.',rewrittenBullets:{[api.id]:'Delivered Java APIs supporting customer account management.',[sql.id]:'Optimized SQL queries, improving performance by 30%.',[react.id]:'Built React dashboards for support teams.'},requirements:[]});
 assert.equal(output.contentQuality.experienceBulletCount,3);
 assert.equal(output.contentQuality.rewrittenBulletCount,3);
 const first=output.markdown.indexOf('Delivered Java APIs'),second=output.markdown.indexOf('VertexWave');
 assert.ok(first>output.markdown.indexOf('BluePeak')&&first<second);
 assert.ok(output.markdown.indexOf('Built React dashboards')>second);
 assert.doesNotMatch(output.markdown,/• Senior Software Engineer|• Software Engineer/);
 for(const value of ['JavaScript','Spring Boot','Example University','License ABC123','Mar 2022','Feb 2022'])assert.ok(output.markdown.includes(value),value);
});

test('AI fact IDs stay bound to original bullets when relevance reorders them or evidence is absent',()=>{
 const candidate={id:'example',full_name:'Alex Example',primary_skills:'Java',employment_history:[{title:'Developer',employer:'Real Co',start:'2020',end:'2024',evidence:'Developer Real Co 2020–2024',bullets:['Maintained internal reports.','Built Java billing services.']}]};
 const {extensionFactCatalog}=moduleLoader()('src/lib/tailored-resumes/extension-content.ts');
 const fact=extensionFactCatalog(candidate).find(row=>row.text==='Maintained internal reports.');
 const result=engine.buildResume(candidate,job,{[fact.id]:'Maintained reporting tools for internal users.'});
 assert.match(result.markdown,/• Maintained reporting tools for internal users\./);
 assert.match(result.markdown,/• Built Java billing services\./);
 assert.doesNotMatch(result.markdown,/• Developer Real Co/);
 assert.equal(result.contentQuality.experienceBulletCount,2);
 assert.equal(result.contentQuality.rewrittenBulletCount,1);
});

test('sparse reviewed job entries recover responsibilities from the original without changing employers',()=>{
 const profile={full_name:'Alex Example',source_text:source,employment_history:[{title:'Senior Software Engineer',employer:'BluePeak Digital Solutions',location:'Austin, TX',start:'Mar 2022',end:'Present',evidence:'Senior Software Engineer — BluePeak Digital Solutions, Austin, TX Mar 2022 – Present'}]};
 const result=engine.buildResume(profile,job);
 assert.match(result.markdown,/Built Java APIs/);
 assert.match(result.markdown,/30%/);
 assert.doesNotMatch(result.markdown,/• Senior Software Engineer/);
 assert.match(result.markdown,/Example University/);
});

test('DOCX contains substantive bullets and complete source sections, not just role headings',async()=>{
 const {default:mammoth}=await import('mammoth');
 const output=engine.buildResume(engine.candidateFromText(source),job);
 const document=await mammoth.extractRawText({buffer:Buffer.from(engine.resumeDocx(output.markdown))});
 assert.match(document.value,/Built Java APIs for customer account management/);
 assert.match(document.value,/Improved SQL query performance by 30%/);
 assert.match(document.value,/Developed React dashboards for support teams/);
 assert.match(document.value,/License ABC123/);
});

test('combined education heading ends work bullets and compact year ranges stay intact',()=>{
 const candidate=engine.candidateFromText(source.replace('Mar 2022 – Present','2022-Present').replace('EDUCATION','EDUCATION & CERTIFICATIONS'));
 assert.equal(candidate.employment_history[0].start,'2022');
 assert.equal(candidate.employment_history[0].end,'Present');
 assert.equal(candidate.employment_history.flatMap(row=>row.bullets).some(line=>line.includes('University')),false);
 assert.match(engine.buildResume(candidate,job).markdown,/EDUCATION & CERTIFICATIONS\nBSc Computer Science/);
});

test('target-role banner is absent from new resumes and both DOCX renderers suppress legacy banners',async()=>{
 const output=engine.buildResume(engine.candidateFromText(source),job);
 assert.doesNotMatch(output.markdown,/Target role:/);
 const {resumeDocx}=moduleLoader()('src/lib/tailored-resumes/docx.ts');
 const {default:mammoth}=await import('mammoth');
 const legacy=output.markdown.replace('PROFESSIONAL EXPERIENCE','Target role: Senior Engineer at G2i Inc.\n\nPROFESSIONAL EXPERIENCE');
 for(const render of [engine.resumeDocx,resumeDocx]){
  const document=await mammoth.extractRawText({buffer:Buffer.from(render(legacy))});
  assert.doesNotMatch(document.value,/Target role:|at G2i Inc\./);
  assert.match(document.value,/Built Java APIs/);
 }
});
