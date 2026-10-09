import {createHash} from 'node:crypto';import sanitize from 'sanitize-html';import type {EmploymentType,JobSnapshot,NormalizedJob} from './types';
type Raw=Record<string,unknown>;const object=(x:unknown):Raw=>x&&typeof x==='object'&&!Array.isArray(x)?x as Raw:{};const str=(x:unknown)=>typeof x==='string'&&x.trim()?x.trim():null;
export function publicJobUrl(value:unknown){const text=str(value);if(!text)return null;try{const u=new URL(text);if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)||u.hostname.includes(':'))return null;u.hash='';return u.toString();}catch{return null;}}
export function employment(metadata:unknown,text:string):{type:EmploymentType;evidence:string|null;arrangements:string[]|null}{
 const map:Record<string,EmploymentType>={contract:'contract',fulltime:'permanent','full-time':'permanent',permanent:'permanent',temporary:'temporary',parttime:'part_time','part-time':'part_time',intern:'internship',internship:'internship'};
 const key=str(metadata)?.toLowerCase().replaceAll(' ','');const structured=key&&map[key];
 const sentences=text.split(/[.!?\n]/).map(s=>s.trim());const contract=sentences.find(s=>/\b(?:this|the) (?:is (?:a |an )?)?(?:role|position|job) (?:is |will be )?(?:a |an )?contract\b|\b(?:this is |employment type: ?|job type: ?)(?:a )?contract(?: position| role)?\b|\bcontract (?:role|position)(?: for| with|\b)/i.test(s));
 const permanent=sentences.find(s=>/\b(?:this|the) (?:is (?:a )?)?(?:role|position|job) (?:is )?(?:a )?(?:permanent|full.time)\b|\b(?:this is |employment type: ?|job type: ?)(?:a )?(?:permanent|full.time)/i.test(s));
 const temporary=sentences.find(s=>/\b(?:job type:|employment type:)\s*temporary\b/i.test(s));
 const type=structured||(contract&&permanent?'unknown':contract?'contract':permanent?'permanent':temporary?'temporary':'unknown');
 const arrangements=['C2C','W2','1099'].filter(a=>new RegExp('\\b'+(a==='W2'?'W-?2':a)+'\\b','i').test(text)&&!sentences.some(s=>new RegExp('\\b'+(a==='W2'?'W-?2':a)+'\\b','i').test(s)&&/\b(?:no|not|without|cannot|unavailable)\b/i.test(s)));
 return {type,evidence:structured?String(metadata):type==='contract'?contract||null:type==='permanent'?permanent||null:type==='temporary'?temporary||null:null,arrangements:arrangements.length?arrangements:null};
}
export function normalizeSnapshot(source:{provider:string;company:string},input:unknown):JobSnapshot {
 const root=object(input);if(!Array.isArray(root.jobs))throw new Error('The provider returned an invalid snapshot.');
 const jobs:NormalizedJob[]=[];let invalid=false;const seen=new Set<string>();
 for(const value of root.jobs){const row=object(value);if(source.provider==='ashby'&&row.isListed===false)continue;
 const title=str(row.title),url=publicJobUrl(source.provider==='greenhouse'?row.absolute_url:row.jobUrl),apply=publicJobUrl(row.applyUrl)||url;
 if(!title||!url||!apply){invalid=true;continue;}const html=sanitize(str(row.content)||str(row.descriptionHtml)||'',{allowedTags:['p','br','ul','ol','li','strong','em','h2','h3'],allowedAttributes:{}});
 const description=(str(row.descriptionPlain)||sanitize(html,{allowedTags:[],allowedAttributes:{}})).slice(0,100000);
 const metadata=source.provider==='ashby'?row.employmentType:Array.isArray(row.metadata)?(row.metadata.map(object).find(m=>/employment type|job type/i.test(String(m.name)))?.value):null;
 const fact=employment(metadata,description);const external=source.provider==='greenhouse'&&typeof row.id==='number'?String(row.id):createHash('sha256').update(url).digest('hex');
 if(seen.has(external)){invalid=true;continue;}seen.add(external);
 const record={external_id:external,title,company:source.company,source_url:url,application_url:apply,description,description_html:html,location:str(source.provider==='greenhouse'?object(row.location).name:row.location),department:str(source.provider==='greenhouse'?(Array.isArray(row.departments)?object(row.departments[0]).name:null):row.department),employment_type:fact.type,employment_evidence:fact.evidence,arrangements:fact.arrangements,compensation:row.compensation||null};
 jobs.push({...record,content_hash:createHash('sha256').update(JSON.stringify(record)).digest('hex')});
 }
 const complete=!invalid&&(source.provider==='ashby'||object(root.meta).total===root.jobs.length);return {jobs,completeness:complete?'complete':'partial'};
}

export function isSoftwareJob(job: { title: string; department?: string | null }): boolean {
 const t = (job.title || '').toLowerCase();
 const d = (job.department || '').toLowerCase();
 const nonTech = [
   'recruiter', 'recruiting', 'talent acquisition', 'account executive',
   'sales development', 'sales rep', 'customer success', 'customer support',
   'office manager', 'executive assistant', 'workplace', 'copywriter', 'content writer',
   'social media', 'legal counsel', 'paralegal', 'accountant', 'payroll', 'controller',
   'marketing manager', 'product marketing', 'sales manager', 'partner sales', 'enablement'
 ];
 if (nonTech.some(kw => t.includes(kw))) return false;
 const tech = [
   'software', 'engineer', 'developer', 'frontend', 'front-end', 'front end',
   'backend', 'back-end', 'back end', 'fullstack', 'full-stack', 'full stack',
   'web', 'mobile', 'ios', 'android', 'react', 'node', 'python', 'java', 'golang',
   'cloud', 'devops', 'sre', 'site reliability', 'infrastructure', 'platform',
   'data engineer', 'data science', 'machine learning', 'ml', 'ai', 'architect',
   'qa', 'sdet', 'test engineer', 'security', 'systems', 'tech lead', 'technical lead',
   'engineering manager', 'director of engineering', 'cto'
 ];
 return tech.some(kw => t.includes(kw)) || 
   ['engineering', 'software', 'technology', 'product & engineering', 'r&d', 'data', 'platform'].some(kw => d.includes(kw));
}