import {z} from 'zod';
import {categorizeSkills} from '../../../browser-extension/resume-engine.js';

type Profile={full_name:string;confirmed_facts?:Record<string,unknown>};
export type ResumeFact={id:string;kind:'summary'|'skill';text:string;field:string};

export const tailorSelectionSchema=z.object({
 summaryFactIds:z.array(z.string().max(120)).max(6),
 skillFactIds:z.array(z.string().max(120)).max(100),
 professionalSummary:z.string().max(2000).optional(),
 targetRoleTitle:z.string().max(150).optional(),
 highlightSkills:z.array(z.string().max(60)).max(8).optional(),
 categorizedSkills:z.record(z.string(),z.array(z.string())).optional()
}).strict();

const text=(value:unknown)=>typeof value==='string'?value.trim():typeof value==='number'?String(value):'';
const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.filter((row):row is Record<string,unknown>=>!!row&&typeof row==='object'&&!Array.isArray(row)):[];

export function resumeFactCatalog(candidate:Profile):ResumeFact[]{
 const facts=candidate.confirmed_facts||{};const result:ResumeFact[]=[];
 for(const field of ['current_job_title','total_experience_years','certifications','highest_qualification']){
  const value=text(facts[field]);if(value)result.push({id:field,kind:'summary',text:value,field});
 }
 for(const field of ['primary_skills','secondary_skills'])text(facts[field]).split(/[,;\n|]+/).map(value=>value.trim()).filter(Boolean).slice(0,100).forEach((value,index)=>result.push({id:`${field}:${index}`,kind:'skill',text:value,field}));
 return result;
}

export function buildTailoredContent(candidate:Profile,job:{title:string;company?:string},input:unknown){
 const selected=tailorSelectionSchema.parse(input),catalog=resumeFactCatalog(candidate),byId=new Map(catalog.map(f=>[f.id,f]));
 for(const id of [...selected.summaryFactIds,...selected.skillFactIds])if(!byId.has(id))throw new Error('AI selected an unsupported resume fact. Retry generation.');
 for(const id of selected.skillFactIds)if(byId.get(id)?.kind!=='skill')throw new Error('AI selected an unsupported skill fact. Retry generation.');
 const facts=candidate.confirmed_facts||{};

 const candidateName=text(facts.full_name)||candidate.full_name;
 const skills=[...new Set([...selected.skillFactIds,...catalog.filter(f=>f.kind==='skill').map(f=>f.id)])].map(id=>byId.get(id)!.text);
 const topSkills=(selected.highlightSkills&&selected.highlightSkills.length?selected.highlightSkills:skills.slice(0,5)).map(s=>s.toUpperCase());
 const roleTitle=(selected.targetRoleTitle||text(facts.current_job_title)||job.title).toUpperCase();
 const subTitle=topSkills.length?`${roleTitle}  |  ${topSkills.join(' • ')}`:roleTitle;
 const contactParts=[[text(facts.current_city),text(facts.current_state)].filter(Boolean).join(', '),text(facts.phone),text(facts.email),text(facts.linkedin_url)].filter(Boolean);

 const lines=[
  candidateName,
  subTitle,
  contactParts.join('  |  '),
  '',
  `Target role: ${job.title}${job.company?' | '+job.company:''}`,
  '',
  'PROFESSIONAL SUMMARY'
 ];

 const summary=[...new Set(selected.summaryFactIds)].map(id=>byId.get(id)!);
 if(selected.professionalSummary){
  lines.push(selected.professionalSummary);
 }else if(summary.length){
  lines.push(...summary.map(f=>f.field==='total_experience_years'?`${f.text} years of total experience`:f.text));
 }else if(text(facts.current_job_title)){
  lines.push(text(facts.current_job_title));
 }

 if(skills.length){
  lines.push('','TECHNICAL SKILLS');
  if(selected.categorizedSkills&&Object.keys(selected.categorizedSkills).length){
   for(const [catName,catSkills] of Object.entries(selected.categorizedSkills)){
    if(catSkills&&catSkills.length)lines.push(`| ${catName} | ${catSkills.join(', ')} |`);
   }
  }else{
   const cats=categorizeSkills(skills);
   for(const [catName,catSkills] of cats){
    lines.push(`| ${catName} | ${catSkills.join(', ')} |`);
   }
  }
 }

 const employment=rows(facts.employment_history);
 if(employment.length){
  lines.push('','PROFESSIONAL EXPERIENCE');
  for(const row of employment){
   const title=text(row.title);
   const employer=text(row.employer);
   const loc=text(row.location)||text(row.city);
   const compLoc=[employer,loc].filter(Boolean).join(', ');
   const roleComp=[title,compLoc].filter(Boolean).join('  —  ');
   const dateRange=[text(row.start),text(row.end)].filter(Boolean).join(' – ');
   lines.push(`| ${roleComp} | ${dateRange} |`);
   if(text(row.evidence))lines.push('• '+text(row.evidence));
   lines.push('');
  }
 }

 const eduLines:string[]=[];
 const education=rows(facts.education_history);
 if(education.length){
  const seen=new Set<string>();
  for(const row of education){
   const key=[text(row.degree),text(row.institution)].filter(Boolean).join('|').toLowerCase();
   if(seen.has(key))continue;
   seen.add(key);
   const degInst=[text(row.degree),text(row.institution)].filter(Boolean).join(' — ');
   const year=text(row.year)||text(row.graduation_year)||text(row.end);
   eduLines.push(year?`${degInst} | ${year}`:degInst);
   if(text(row.evidence)&&text(row.evidence).toLowerCase()!==text(row.degree).toLowerCase()){
    eduLines.push(text(row.evidence));
   }
  }
 }else if(text(facts.highest_qualification)){
  const degInst=[text(facts.highest_qualification),text(facts.university_name)].filter(Boolean).join(' — ');
  eduLines.push(text(facts.graduation_year)?`${degInst} | ${text(facts.graduation_year)}`:degInst);
 }
 if(text(facts.certifications)){
  eduLines.push(`Certifications: ${text(facts.certifications)}`);
 }
 if(eduLines.length){
  lines.push('','EDUCATION & CERTIFICATIONS',...eduLines);
 }

 return {content:lines.join('\n').trim(),selectedFactIds:[...new Set([...selected.summaryFactIds,...selected.skillFactIds])],facts:catalog};
}
