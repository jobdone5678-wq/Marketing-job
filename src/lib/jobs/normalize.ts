import {createHash} from 'node:crypto';import sanitize from 'sanitize-html';import type {EmploymentType,JobSnapshot,NormalizedJob} from './types';
type Raw=Record<string,unknown>;const object=(x:unknown):Raw=>x&&typeof x==='object'&&!Array.isArray(x)?x as Raw:{};const str=(x:unknown)=>typeof x==='string'&&x.trim()?x.trim():null;
function providerTimestamp(value:unknown):string|null {
 const text=str(value);
 // Require a timezone and a real calendar date; do not let Date.parse roll February 30 forward.
 if(!text||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text))return null;
 const day=new Date(text.slice(0,10)+'T00:00:00Z');
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==text.slice(0,10))return null;
 const timestamp=Date.parse(text);return Number.isFinite(timestamp)?new Date(timestamp).toISOString():null;
}
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
  let rawList: unknown[] = [];
  if (Array.isArray(input)) {
    rawList = input;
  } else {
    const root = object(input);
    if (Array.isArray(root.jobs)) rawList = root.jobs;
    else if (Array.isArray(root.content)) rawList = root.content; // SmartRecruiters
    else if (Array.isArray(root.offers)) rawList = root.offers; // Recruitee / offers
    else throw new Error('The provider returned an invalid snapshot.');
  }

  const jobs:NormalizedJob[]=[];let invalid=false;const seen=new Set<string>();
  const rootObj = Array.isArray(input) ? {} : object(input);
  if (source.provider === 'greenhouse' && rawList.length === 0 && (!rootObj.meta || typeof object(rootObj.meta).total !== 'number')) {
    invalid = true;
  }
  for(const value of rawList){
    const row=object(value);
    if(source.provider==='ashby'&&row.isListed===false)continue;
    if(source.provider==='remoteok'&&(!row.id||!row.position))continue;

    let rawTitle: unknown = row.title;
    let rawUrl: unknown = row.absolute_url || row.jobUrl;
    let rawApply: unknown = row.applyUrl;
    let rawContent: unknown = row.content || row.descriptionHtml;
    const rawPlain: unknown = row.descriptionPlain;
    let rawLocation: unknown = row.location;
    let rawDept: unknown = row.department;
    let rawMetadata: unknown = null;
    let rawPosted: unknown = null;

    if (source.provider === 'lever') {
      rawTitle = row.text;
      rawUrl = row.hostedUrl || row.applyUrl;
      rawApply = row.applyUrl || row.hostedUrl;
      rawContent = row.description;
      const cats = object(row.categories);
      rawLocation = cats.location || cats.team;
      rawDept = cats.department || cats.team;
      rawMetadata = cats.commitment;
      if (typeof row.createdAt === 'number') {
        rawPosted = new Date(row.createdAt).toISOString();
      }
    } else if (source.provider === 'smartrecruiters') {
      rawTitle = row.name;
      rawUrl = row.refNumber ? `https://jobs.smartrecruiters.com/${source.company}/${row.id}` : `https://www.smartrecruiters.com/job/${row.id}`;
      rawApply = rawUrl;
      const loc = object(row.location);
      rawLocation = loc.fullLocation || loc.city || (loc.country ? String(loc.country) : null);
      rawDept = object(row.department).label || null;
      rawMetadata = object(row.typeOfEmployment).label || null;
      rawPosted = row.releasedDate;
    } else if (source.provider === 'breezy') {
      rawTitle = row.name;
      rawUrl = row.url;
      rawApply = row.url;
      const loc = object(row.location);
      rawLocation = loc.name || loc.city || null;
      rawDept = row.department;
      rawMetadata = object(row.type).name || null;
    } else if (source.provider === 'remoteok') {
      rawTitle = row.position;
      rawUrl = row.url ? (String(row.url).startsWith('http') ? row.url : `https://remoteok.com${row.url}`) : null;
      rawApply = row.apply_url || rawUrl;
      rawContent = row.description;
      rawLocation = row.location || 'Remote';
      rawDept = Array.isArray(row.tags) ? row.tags.slice(0, 3).join(', ') : null;
      rawPosted = row.date;
    } else if (source.provider === 'greenhouse') {
      rawLocation = object(row.location).name;
      rawDept = Array.isArray(row.departments) ? object(row.departments[0]).name : null;
      rawMetadata = Array.isArray(row.metadata) ? (row.metadata.map(object).find(m=>/employment type|job type/i.test(String(m.name)))?.value) : null;
      rawPosted = row.first_published;
    } else if (source.provider === 'ashby') {
      rawMetadata = row.employmentType;
      rawPosted = row.publishedAt;
    }

    const title=str(rawTitle);
    const url=publicJobUrl(rawUrl);
    const apply=publicJobUrl(rawApply)||url;
    if(!title||!url||!apply){invalid=true;continue;}
    
    const html=sanitize(str(rawContent)||'',{allowedTags:['p','br','ul','ol','li','strong','em','h2','h3'],allowedAttributes:{}});
    const description=(str(rawPlain)||sanitize(html,{allowedTags:[],allowedAttributes:{}})||title).slice(0,100000);
    const fact=employment(rawMetadata,description);
    
    const external=source.provider==='greenhouse'&&typeof row.id==='number'?String(row.id):typeof row.id==='string'?row.id:createHash('sha256').update(url).digest('hex');
    if(seen.has(external)){invalid=true;continue;}seen.add(external);
    
    const companyName = source.provider === 'remoteok' && row.company ? str(row.company) || source.company : source.company;
    const record={
      external_id:external,
      title,
      company:companyName,
      source_url:url,
      application_url:apply,
      description,
      description_html:html,
      location:str(rawLocation),
      department:str(rawDept),
      employment_type:fact.type,
      employment_evidence:fact.evidence,
      arrangements:fact.arrangements,
      compensation:row.compensation||null
    };
    
    const dated={...record,posted_at:providerTimestamp(rawPosted),closes_at:null};
    jobs.push({...dated,content_hash:createHash('sha256').update(JSON.stringify(dated)).digest('hex')});
  }
  return {jobs,completeness:invalid?'partial':'complete'};
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
