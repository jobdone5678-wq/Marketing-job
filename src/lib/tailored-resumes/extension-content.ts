import {z} from 'zod';
import {analyze,buildResume,normalizeCandidate,categorizeSkills,type JobInput} from '../../../browser-extension/resume-engine.js';

export const EXTENSION_AI_VERSION='contextual-v1';
export const extensionSelectionSchema=z.object({
 summaryFactIds:z.array(z.string().max(100)).max(6),
 skillFactIds:z.array(z.string().max(100)).max(100),
 professionalSummary:z.string().max(2000).optional(),
 targetRoleTitle:z.string().max(150).optional(),
 highlightSkills:z.array(z.string().max(60)).max(8).optional(),
 categorizedSkills:z.record(z.string(),z.array(z.string())).optional(),
 rewrittenBullets:z.record(z.string(),z.string().max(500)).optional(),
 requirements:z.array(z.object({requirement:z.string().min(1).max(500),jobEvidence:z.string().min(1).max(1500),relation:z.enum(['direct','transferable','missing']),factIds:z.array(z.string().max(100)).max(8),reason:z.string().min(1).max(1000)}).strict()).max(24),
}).strict();
export type ExtensionFact={id:string;kind:'summary'|'skill'|'experience'|'education'|'certification'|'project'|'source';text:string;context:string};
const text=(value:unknown)=>typeof value==='string'?value.trim():typeof value==='number'?String(value):'';
const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.filter(row=>row&&typeof row==='object'):[];
export function extensionFactCatalog(candidate:unknown):ExtensionFact[]{
 const facts=normalizeCandidate(candidate);if(!facts)return [];
 const catalog:ExtensionFact[]=[];
 const add=(id:string,kind:ExtensionFact['kind'],value:unknown,context='')=>{const content=text(value);if(content)catalog.push({id,kind,text:content,context});};
 add('title','summary',facts.title);add('summary','summary',facts.summary);
 if(facts.years)add('years','summary',`${text(facts.years)} years of total experience`);
 (facts.skills as string[]).forEach((skill,index)=>add(`skill:${index}`,'skill',skill));
 rows(facts.employment).forEach((row,index)=>{
  const context=[text(row.title)||text(row.job_title),text(row.employer)||text(row.company),[text(row.start)||text(row.start_date),text(row.end)||text(row.end_date)].filter(Boolean).join(' – ')||text(row.dates)].filter(Boolean).join(' | ');
  [row.evidence,row.description,...(Array.isArray(row.bullets)?row.bullets:[])].forEach((value,bullet)=>add(`experience:${index}:${bullet}`,'experience',value,context));
 });
 rows(facts.education).forEach((row,index)=>add(`education:${index}`,'education',[text(row.degree),text(row.institution)||text(row.school),text(row.year)||text(row.end)||text(row.graduation_year),text(row.evidence)].filter(Boolean).join(' | ')));
 add('qualification','education',[text(facts.qualification),text(facts.university),text(facts.graduationYear)].filter(Boolean).join(' | '));
 add('certifications','certification',facts.certifications);
 rows(facts.projects).forEach((row,index)=>{
  [row.description,...(Array.isArray(row.bullets)?row.bullets:[])].forEach((value,bullet)=>add(`project:${index}:${bullet}`,'project',value,text(row.name)));
 });
 const contacts=[facts.name,facts.email,facts.phone,facts.linkedin].map(text).filter(Boolean);
 text(facts.sourceText).split('\n').forEach((line,index)=>{
  if(line.trim().length<20||contacts.some(contact=>line.includes(contact)))return;
  add(`source:${index}`,'source',line);
 });
 // Bound provider input while retaining the full original resume in the document.
 return catalog.filter(row=>row.text.length<=2000).slice(0,250);
}
function replaceSection(content:string,heading:string,body:string){
 const lines=content.split('\n');
 let start=lines.findIndex(l=>l.trim().toUpperCase()===heading.toUpperCase());
 if(start<0&&(heading==='SKILLS'||heading==='TECHNICAL SKILLS')){
  start=lines.findIndex(l=>/^(?:TECHNICAL SKILLS|SKILLS)$/i.test(l.trim()));
 }
 if(start<0){
  const target=lines.findIndex(line=>line.startsWith('Target role:'));
  lines.splice(target>=0?target+1:0,0,'',heading,body);
 }else{
  // Match all headings emitted by the shared source parser, preserving following sections.
  const boundary=/^(?:(?:PROFESSIONAL|WORK) EXPERIENCE|EXPERIENCE|EMPLOYMENT(?: HISTORY)?|PROFESSIONAL BACKGROUND|(?:PROFESSIONAL )?SUMMARY|PROFILE|OBJECTIVE|(?:TECHNICAL|CORE|PROFESSIONAL) SKILLS|SKILLS|EDUCATION(?: & CERTIFICATIONS)?|PROJECTS?|CERTIFICATIONS|LICENSES|AWARDS|VOLUNTEERING|PUBLICATIONS|ADDITIONAL INFORMATION)$/;
  let end=start+1;while(end<lines.length&&!boundary.test(lines[end].trim()))end++;
  lines.splice(start,end-start,heading,body,'');
 }
 return lines.join('\n');
}
export function buildContextualResume(candidate:unknown,job:JobInput,input:unknown){
 const selection=extensionSelectionSchema.parse(input),catalog=extensionFactCatalog(candidate),byId=new Map(catalog.map(row=>[row.id,row]));
 const get=(id:string)=>{const fact=byId.get(id);if(!fact)throw Error('AI selected unsupported candidate evidence. Retry generation.');return fact;};
 selection.summaryFactIds.forEach(get);
 const orderedSkills=selection.skillFactIds.map(get);if(orderedSkills.some(row=>row.kind!=='skill'))throw Error('AI selected unsupported skill evidence.');
 const requirements=selection.requirements.map(row=>{
  if(!job.jobDescription?.includes(row.jobEvidence))throw Error('AI requirement evidence is absent from the JD.');
  const evidence=row.factIds.map(get);
  if(row.relation==='missing'?evidence.length>0:evidence.length===0)throw Error('AI match evidence is inconsistent.');
  return {...row,evidence:evidence.map(fact=>({id:fact.id,text:fact.text,context:fact.context}))};
 });
 const rewrittenBullets=selection.rewrittenBullets||{};
 const baseline=buildResume(candidate,job,rewrittenBullets);
 let markdown=baseline.markdown;
 const summary=[...new Set(selection.summaryFactIds)].map(get).map(fact=>fact.context?`${fact.context}: ${fact.text}`:fact.text);
 if(selection.professionalSummary){
  markdown=replaceSection(markdown,'PROFESSIONAL SUMMARY',selection.professionalSummary);
 }else if(summary.length){
  markdown=replaceSection(markdown,'PROFESSIONAL SUMMARY',summary.join('\n'));
 }
 const skillIds=[...new Set([...selection.skillFactIds,...catalog.filter(row=>row.kind==='skill').map(row=>row.id)])];
 if(skillIds.length){
  const skillTexts=skillIds.map(id=>get(id).text);
  const cats=categorizeSkills(skillTexts);
  const tableRows:string[]=[];
  for(const [catName,catSkills] of cats){
   tableRows.push(`| ${catName} | ${catSkills.join(', ')} |`);
  }
  const lines=markdown.split('\n');
  const heading=lines.some(l=>l.trim()==='TECHNICAL SKILLS')?'TECHNICAL SKILLS':'SKILLS';
  markdown=replaceSection(markdown,heading,tableRows.join('\n'));
 }
 const ats=analyze(candidate,job,markdown);
 return {...baseline,markdown,ats,matchScore:ats.score,matchedSkills:ats.matched,missingSkills:ats.missing,
  ai:{method:EXTENSION_AI_VERSION,selectedFactIds:[...new Set([...selection.summaryFactIds,...selection.skillFactIds])],requirements,note:'AI relevance judgments require review. Transferable experience does not establish a required qualification. Resume wording uses supplied facts; ATS coverage is calculated separately.'}};
}
