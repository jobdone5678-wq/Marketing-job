import {z} from 'zod';
export const textFields=['full_name','email','phone','linkedin_url','current_city','current_state','full_address','visa_status',
  'current_employer','current_job_title','employment_status','total_experience_years','relevant_experience_years','notice_period','available_to_join',
  'interview_availability','preferred_work_type','preferred_locations','current_salary','expected_salary','highest_qualification','university_name',
  'graduation_year','target_job_titles','primary_skills','secondary_skills','certifications'] as const;
export const booleanFields=['authorized_in_usa','need_sponsorship_now','need_sponsorship_future','open_to_relocation'] as const;
const fieldShape={...Object.fromEntries(textFields.map(field=>[field,z.string().max(2000).nullable()])) as Record<typeof textFields[number],z.ZodNullable<z.ZodString>>,
  ...Object.fromEntries(booleanFields.map(field=>[field,z.boolean().nullable()])) as Record<typeof booleanFields[number],z.ZodNullable<z.ZodBoolean>>,employment_types:z.array(z.string().max(100)).max(10).nullable()};
export const candidateFields=z.object(fieldShape).strict();
export const evidenceSchema=z.object({field:z.string().max(100),snippet:z.string().min(1).max(3000),page:z.number().int().min(1).max(20).nullable()}).strict();
export const employmentEntry=z.object({employer:z.string().nullable(),title:z.string().nullable(),start:z.string().nullable(),end:z.string().nullable(),location:z.string().nullable(),evidence:z.string()}).strict();
export const educationEntry=z.object({degree:z.string().nullable(),institution:z.string().nullable(),start:z.string().nullable(),end:z.string().nullable(),evidence:z.string()}).strict();
export const resumeSchema=z.object({fields:candidateFields,employmentHistory:z.array(employmentEntry).max(60),educationHistory:z.array(educationEntry).max(30),
  evidence:z.array(evidenceSchema).max(150),warnings:z.array(z.string().max(500)).max(30)}).strict();
export type ResumeExtraction=z.infer<typeof resumeSchema>;
export const emptyCandidateFields=()=>Object.fromEntries([...textFields,...booleanFields,'employment_types'].map(field=>[field,null]));
const norm=(value:string)=>value.toLowerCase().replace(/\s+/g,' ').trim();
const isSupported=(value:unknown,snippet:string)=>typeof value==='string' ? value.split(/[,;\n]/).filter(Boolean).every(part=>norm(snippet).includes(norm(part)))
  : Array.isArray(value)?value.every(part=>typeof part==='string'&&norm(snippet).includes(norm(part))):false;
function supportedBoolean(field:string,value:boolean,snippet:string) {
  const negative=/\b(?:not|no|without|do not|does not|don't)\b/i.test(snippet);
  if(field==='open_to_relocation')return /relocat/i.test(snippet)&&/open|willing|not|no/i.test(snippet)&&value!==negative;
  if(field==='authorized_in_usa')return /authoriz|eligible/i.test(snippet)&&/work|employment/i.test(snippet)&&/usa|united states|u\.s\./i.test(snippet)&&value!==negative;
  return /sponsor/i.test(snippet)&&/require|need|not|no/i.test(snippet)&&value!==negative;
}
export function validateResumeExtraction(input:unknown,source:string):ResumeExtraction {
  const object=z.object({fields:z.record(z.string(),z.unknown()),employmentHistory:z.array(z.unknown()),educationHistory:z.array(z.unknown()),evidence:z.array(evidenceSchema),warnings:z.array(z.string())}).parse(input);
  const parsed=resumeSchema.parse({...object,fields:{...emptyCandidateFields(),...object.fields}});
  const supported=parsed.evidence.filter(evidence=>norm(source).includes(norm(evidence.snippet)));
  const fields=parsed.fields as Record<string,unknown>;
  for(const [field,value] of Object.entries(fields)) {
    if(value===null)continue;
    const proof=supported.filter(evidence=>evidence.field===field);
    if(!proof.some(evidence=>typeof value==='boolean'?supportedBoolean(field,value,evidence.snippet):isSupported(value,evidence.snippet))) {
      fields[field]=null;parsed.warnings.push(`Review ${field}: extracted value lacked supporting text.`);
    }
  }
  parsed.evidence=supported;
  parsed.employmentHistory=parsed.employmentHistory.filter(entry=>entry.evidence&&norm(source).includes(norm(entry.evidence))&&[entry.employer,entry.title,entry.start,entry.end].every(value=>value===null||norm(entry.evidence).includes(norm(value))));
  parsed.educationHistory=parsed.educationHistory.filter(entry=>entry.evidence&&norm(source).includes(norm(entry.evidence))&&[entry.degree,entry.institution,entry.start,entry.end].every(value=>value===null||norm(entry.evidence).includes(norm(value))));
  // Experience is calculated from complete month dates, never from the model's guessed total.
  fields.total_experience_years=null;
  const experience=estimateExperience(parsed.employmentHistory);
  if(experience!==null){fields.total_experience_years=String(experience);parsed.warnings.push('Total experience is estimated from non-overlapping dated employment.');}
  return parsed;
}
export function estimateExperience(entries:{start:string|null;end:string|null}[]):number|null {
  if(!entries.length||entries.some(entry=>!entry.start||!entry.end||!/^\d{4}-(?:0[1-9]|1[0-2])(?:-\d{2})?$/.test(entry.start)||!/^\d{4}-(?:0[1-9]|1[0-2])(?:-\d{2})?$/.test(entry.end)))return null;
  const intervals=entries.map(entry=>[Date.parse(entry.start!.slice(0,7)+'-01'),Date.parse(entry.end!.slice(0,7)+'-01')]).sort((a,b)=>a[0]-b[0]);
  if(intervals.some(([start,end])=>!Number.isFinite(start)||!Number.isFinite(end)||end<start||end>Date.now()))return null;
  let total=0;let [start,end]=intervals[0];
  for(const [nextStart,nextEnd] of intervals.slice(1)) {if(nextStart<=end)end=Math.max(end,nextEnd);else{total+=end-start;start=nextStart;end=nextEnd;}}
  return Math.round((total+end-start)/31557600000*10)/10;
}
