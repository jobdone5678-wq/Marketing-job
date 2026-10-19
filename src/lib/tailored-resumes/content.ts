import {z} from 'zod';
type Profile={full_name:string;confirmed_facts?:Record<string,unknown>};
export type ResumeFact={id:string;kind:'summary'|'skill';text:string;field:string};
export const tailorSelectionSchema=z.object({summaryFactIds:z.array(z.string().max(120)).max(6),skillFactIds:z.array(z.string().max(120)).max(100)}).strict();
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
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
 const lines=[text(facts.full_name)||candidate.full_name,[text(facts.email),text(facts.phone),[text(facts.current_city),text(facts.current_state)].filter(Boolean).join(', '),text(facts.linkedin_url)].filter(Boolean).join(' | '),'',`Target role: ${job.title}`,'','PROFESSIONAL SUMMARY'];
 const summary=[...new Set(selected.summaryFactIds)].map(id=>byId.get(id)!);
 if(summary.length)lines.push(...summary.map(f=>f.field==='total_experience_years'?`${f.text} years of total experience`:f.text));
 else if(text(facts.current_job_title))lines.push(text(facts.current_job_title));
 const skills=[...new Set([...selected.skillFactIds,...catalog.filter(f=>f.kind==='skill').map(f=>f.id)])].map(id=>byId.get(id)!.text);
 if(skills.length)lines.push('','SKILLS',skills.join(' · '));
 const employment=rows(facts.employment_history);
 if(employment.length){lines.push('','EXPERIENCE');for(const row of employment){lines.push([text(row.title),text(row.employer)].filter(Boolean).join(' | '));const dateRange=[text(row.start),text(row.end)].filter(Boolean).join(' – ');if(dateRange)lines.push(dateRange);if(text(row.evidence))lines.push('- '+text(row.evidence));lines.push('');}}
 const education=rows(facts.education_history);
 if(education.length){lines.push('','EDUCATION');const seen=new Set<string>();for(const row of education){const key=[text(row.degree),text(row.institution)].filter(Boolean).join('|').toLowerCase();if(seen.has(key))continue;seen.add(key);const degreeInst=[text(row.degree),text(row.institution)].filter(Boolean).join(' | ');const year=text(row.year)||text(row.graduation_year)||text(row.end);lines.push(year?`${degreeInst} | ${year}`:degreeInst);if(text(row.evidence)&&text(row.evidence).toLowerCase()!==text(row.degree).toLowerCase())lines.push(text(row.evidence));}}
 else if(text(facts.highest_qualification))lines.push('','EDUCATION',[text(facts.highest_qualification),text(facts.university_name),text(facts.graduation_year)].filter(Boolean).join(' | '));
 if(text(facts.certifications))lines.push('','CERTIFICATIONS',text(facts.certifications));
 return {content:lines.join('\n').trim(),selectedFactIds:[...new Set([...selected.summaryFactIds,...selected.skillFactIds])],facts:catalog};
}
