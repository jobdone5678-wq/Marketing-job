import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {unzipSync,strFromU8} from 'fflate';

const require=createRequire(import.meta.url);
const path=new URL('../browser-extension/resume-engine.js',import.meta.url);
const engine=existsSync(path)?require(fileURLToPath(path)):{};
const candidate={id:'one',version:1,full_name:'Alex Example',provenance_status:'confirmed',confirmed_facts:{full_name:'Alex Example',email:'alex@example.test',current_job_title:'Developer',primary_skills:'Python, SQL, React',employment_history:[{employer:'Example Co',title:'Developer',start:'2022',end:'2025',evidence:'Built SQL reporting and Python data pipelines.'}],education_history:[{degree:'BA History',institution:'Example University',end:'2020'}]}};
const job={jobTitle:'Data Developer',companyName:'First Co',jobUrl:'https://jobs.example.test/one',jobDescription:'Required skills: Python, SQL, Kubernetes. Build and maintain data pipelines for internal reporting.'};

test('generation refuses missing candidate or JD instead of inventing defaults',()=>{
 assert.equal(typeof engine.buildResume,'function','resume engine must exist');
 assert.throws(()=>engine.buildResume(null,job),/candidate/i);
 assert.throws(()=>engine.buildResume(candidate,{...job,jobDescription:''}),/job description/i);
 assert.throws(()=>engine.buildResume({id:'empty',full_name:'Alex'},job),/candidate.*details|professional.*details/i);
 assert.throws(()=>engine.buildResume(candidate,{...job,jobTitle:''}),/job title/i);
});

test('tailoring preserves supplied claims and never turns target requirements into candidate facts',()=>{
 assert.equal(typeof engine.buildResume,'function');
 const result=engine.buildResume(candidate,job);
 assert.match(result.markdown,/Python/);assert.match(result.markdown,/Example Co/);
 assert.match(result.markdown,/BA History/);assert.match(result.markdown,/2022/);
 assert.doesNotMatch(result.markdown,/Kubernetes|28%|Austin|7\+|Cloud-focused|Technology Solutions/);
 assert.ok(result.missingSkills.includes('Kubernetes'));
 assert.ok(result.matchScore>0&&result.matchScore<100);
 assert.ok(result.ats.requirements.some(row=>row.matched&&row.evidence));
});

test('coverage uses word boundaries, supports nonengineering jobs and unknown requirements',()=>{
 assert.equal(typeof engine.analyze,'function');
 const java=engine.analyze({full_name:'Alex',primary_skills:'JavaScript'}, {jobDescription:'Java and Kubernetes required for backend services.'});
 assert.ok(java.missing.includes('Java'));assert.equal(java.matched.includes('Java'),false);
 const finance=engine.analyze({full_name:'Alex',primary_skills:'Excel, Accounting'}, {jobDescription:'Required: Excel, Accounting, Payroll. Reconcile financial accounts monthly.'});
 assert.ok(finance.matched.includes('Excel'));assert.ok(finance.missing.includes('Payroll'));
 const unknown=engine.analyze({full_name:'Alex',primary_skills:'Python'}, {jobDescription:'Must demonstrate expertise in the proprietary Xylophonic scheduling process.'});
 assert.notEqual(unknown.score,100);assert.ok(unknown.warnings.length);
 assert.equal(engine.analyze(candidate,{jobDescription:''}).score,null);
});

test('real DOCX package contains tailored text and remains parseable with Unicode and XML characters',()=>{
 assert.equal(typeof engine.resumeDocx,'function');
 const bytes=engine.resumeDocx('Alex & Co\nTarget role: Développeur <Principal>\n\nEXPERIENCE\n- Built Python pipelines.');
 const archive=unzipSync(bytes);
 assert.ok(archive['[Content_Types].xml']);assert.ok(archive['_rels/.rels']);
 const xml=strFromU8(archive['word/document.xml']);
 assert.match(xml,/Alex &amp; Co/);assert.match(xml,/Développeur &lt;Principal&gt;/);assert.match(xml,/Python pipelines/);
});

test('uploaded resume parsing keeps raw facts without guessing employer, location, dates or eligibility',()=>{
 assert.equal(typeof engine.candidateFromText,'function');
 const result=engine.candidateFromText('Alex Example\nalex@example.test\nSKILLS\nExcel, Accounting\nEXPERIENCE\nBookkeeper at Honest Co, 2018–2022\nReconciled accounts.','resume.txt');
 assert.equal(result.full_name,'Alex Example');assert.equal(result.current_city,'');
 assert.equal(result.authorized_in_usa,undefined);assert.equal(result.need_sponsorship_now,undefined);
 assert.equal(result.total_experience_years,null);
 const output=engine.buildResume(result,{...job,jobTitle:'Bookkeeper',jobDescription:'Required skills: Excel, Accounting. Reconcile accounts and maintain financial records.'});
 assert.match(output.markdown,/Honest Co/);assert.match(output.markdown,/2018–2022/);
 assert.doesNotMatch(output.markdown,/2021|Austin|Technology Solutions|Bachelor of Science/);
});

test('fingerprint preserves arbitrary job counts and invalidates changed JD, candidate, company and URL',async()=>{
 assert.equal(typeof engine.fingerprint,'function');
 const results=await Promise.all(Array.from({length:25},async(_,i)=>{
  const output=engine.buildResume(candidate,{...job,companyName:'Company '+i,jobUrl:'https://jobs.example.test/'+i,jobDescription:job.jobDescription+' Team '+i});
  return engine.fingerprint(output.scopeKey);
 }));
 assert.equal(new Set(results).size,25);
 const first=engine.buildResume(candidate,job);
 const repeat=engine.buildResume(candidate,{...job});
 assert.equal(await engine.fingerprint(first.scopeKey),await engine.fingerprint(repeat.scopeKey));
 for(const changed of [{...job,jobDescription:job.jobDescription+' Azure required.'},{...job,companyName:'Other Co'},{...job,jobUrl:'https://jobs.example.test/two'}])assert.notEqual(engine.buildResume(candidate,changed).scopeKey,first.scopeKey);
 assert.notEqual(engine.buildResume({...candidate,version:2},job).scopeKey,first.scopeKey);
 assert.notEqual(engine.buildResume({...candidate,confirmed_facts:{...candidate.confirmed_facts,primary_skills:'Java'}},job).scopeKey,first.scopeKey);
});

test('negative skill mentions never become candidate skills or supported requirements',()=>{
 const profile=engine.candidateFromText('Alex Example\nalex@example.test\nI have no experience with Kubernetes.\nEXPERIENCE\nCustomer service at Example Co.','resume.txt');
 assert.equal(profile.all_skills.includes('Kubernetes'),false);
 const result=engine.buildResume(profile,{...job,jobDescription:'Required: Kubernetes experience for maintaining the internal container infrastructure.'});
 assert.equal(result.matchedSkills.includes('Kubernetes'),false);
 assert.doesNotMatch(result.markdown,/Relevant skills: Kubernetes/);
});

test('mixed JD clauses retain unknown qualifications and ATS evidence comes from the actual output',()=>{
 const mixed=engine.analyze({full_name:'Alex',primary_skills:'SQL'},{jobDescription:'Required SQL and an active CPA certification for this role.'});
 assert.ok(mixed.missing.some(label=>label.includes('CPA')));assert.ok(mixed.score<100);
 const profile={full_name:'Alex',primary_skills:'Kubernetes'};
 const assessed=engine.analyze(profile,{jobDescription:'Required: Kubernetes for maintaining container infrastructure.'},'Alex\nEXPERIENCE\nProvided customer support.');
 assert.equal(assessed.matched.includes('Kubernetes'),false);
 assert.equal(assessed.score,0);
});

test('explicit unfamiliar skills and labeled JSON-import names remain grounded in their source',()=>{
 const profile=engine.candidateFromText('full_name: Alex Example\nemail: alex@example.test\nSKILLS\nMIG welding, TIG welding, Blueprint Reading\nEXPERIENCE\nWelder at Example Co, 2020–2024.','resume.json');
 assert.equal(profile.full_name,'Alex Example');assert.ok(profile.all_skills.includes('MIG welding'));
 const result=engine.buildResume(profile,{...job,jobTitle:'Welder',jobDescription:'Required: MIG welding, TIG welding and Blueprint Reading. Fabricate components for industrial customers.'});
 assert.match(result.markdown,/MIG welding/);assert.match(result.markdown,/Welder at Example Co/);
});

test('unstructured work history before the first recognized section is never dropped',()=>{
 const profile=engine.candidateFromText('Alex Example\nalex@example.test\nBuilt financial reporting tools at Historic Company in 2019–2022.\nEDUCATION\nBA History, Example University.','resume.txt');
 const result=engine.buildResume(profile,{...job,jobDescription:'Required skills: SQL and Python. Build financial reporting tools for the business.'});
 assert.match(result.markdown,/Historic Company/);assert.match(result.markdown,/2019–2022/);
});
