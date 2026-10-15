import {z} from 'zod';
export const matchSchema=z.object({requirements:z.array(z.object({requirement:z.string().min(1).max(200),jobEvidence:z.string().min(1).max(2000),status:z.enum(['met','missing','unknown']),candidateField:z.string().nullable(),candidateEvidence:z.string().nullable()}).strict()).max(60),constraints:z.array(z.object({field:z.enum(['authorized_in_usa','need_sponsorship_now','need_sponsorship_future','open_to_relocation']),requiredValue:z.boolean(),jobEvidence:z.string().max(2000)}).strict()).max(10)}).strict();
const norm=(s:string)=>s.toLowerCase().replace(/\s+/g,' ').trim();
const professionalFields=['primary_skills','secondary_skills','current_job_title','certifications','highest_qualification','total_experience_years','relevant_experience_years'] as const;
const skillAliases=[['javascript','js'],['typescript','ts'],['node.js','nodejs'],['react.js','reactjs','react'],['postgresql','postgres'],['golang','go'],['amazon web services','aws'],['google cloud platform','gcp'],['apache airflow','airflow']];
const escape=(v:string)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
type Citation={field:string;evidence:string};
function literalCitation(term:string,facts:Record<string,unknown>):Citation|null{
 const variants=skillAliases.find(group=>group.includes(norm(term)))||[term];
 for(const field of professionalFields){
  const value=facts[field];if(typeof value!=='string')continue;
  for(const variant of variants){
   if(norm(variant)==='go'&&!((field==='primary_skills'||field==='secondary_skills')&&value.split(/[,;\n|]+/).some(part=>norm(part)==='go'))&&!/\bgo (?:developer|engineer|programming)\b/i.test(value))continue;
   const expression=new RegExp('(^|[^a-z0-9+#.])('+escape(variant)+')(?=$|[^a-z0-9+#])','gi');
   for(const match of value.matchAll(expression)){
    const start=match.index!+match[1].length;
    const prefix=value.slice(0,start).split(/[;.\n]|\bbut\b/i).at(-1)||'';
    if(/\b(?:no|not|without|never)\b/i.test(prefix))continue;
    return {field,evidence:value.slice(start,start+match[2].length)};
   }
  }
 }
 return null;
}
function requirementCitations(requirement:string,facts:Record<string,unknown>):Citation[]{
 // Strip presentation wording, not quantitative or substantive requirements.
 const term=requirement.replace(/^(?:(?:strong|solid|good|proven|demonstrated)\s+)?(?:background|experience|proficiency|expertise|knowledge|skills?)\s+(?:in|with|of)\s+/i,'').trim();
 const exact=literalCitation(term,facts);if(exact)return [exact];
 // Parenthetical conditions and numeric criteria need exact support or manual review.
 if(/[()\d]/.test(term))return [];
 const hasAnd=/\band\b/i.test(term);const hasOr=/\bor\b/i.test(term);
 const groups=term.split(hasAnd?/\s+and\s+|[,;]+/i:hasOr?/;/:/[,;]+/);
 const units=groups.flatMap(group=>/\bor\b/i.test(group)?[group.split(/\s+or\s+|,/i).flatMap(branch=>/\b(?:ci\/cd|tcp\/ip|pub\/sub|i\/o)\b/i.test(branch)?[branch]:branch.split('/'))]:group.split('/').map(part=>[part]));
 const citations:Citation[]=[];
 for(const unit of units){
  const alternatives=unit.map(part=>part.trim()).filter(Boolean);
  if(!alternatives.length)return [];
  const supported=alternatives.map(part=>literalCitation(part,facts)).find(Boolean);
  if(!supported)return [];
  if(!citations.some(c=>c.field===supported.field&&c.evidence===supported.evidence))citations.push(supported);
 }
 return citations;
}
export function validateMatch(input:unknown,facts:Record<string,unknown>,description:string){const parsed=matchSchema.parse(input);const requirements=parsed.requirements.filter(r=>norm(description).includes(norm(r.jobEvidence))&&norm(r.jobEvidence).includes(norm(r.requirement))).map(r=>{
 const candidateCitations=requirementCitations(r.requirement,facts);const met=candidateCitations.length>0;
 // Support is derived from reviewed facts, never a provider's status or score.
 return {...r,status:met?'met':'unknown',candidateField:met&&new Set(candidateCitations.map(c=>c.field)).size===1?candidateCitations[0].field:null,candidateEvidence:met?candidateCitations.map(c=>c.evidence).join('; '):null,candidateCitations};
 });const constraints=parsed.constraints.filter(c=>norm(description).includes(norm(c.jobEvidence))).map(c=>{const fact=facts[c.field];const relevant=c.field==='open_to_relocation'?/relocat/i.test(c.jobEvidence):c.field==='authorized_in_usa'?/authoriz|eligible/i.test(c.jobEvidence):/sponsor/i.test(c.jobEvidence);const negative=/\b(?:no|not|without|do not)\b/i.test(c.jobEvidence);const expected=c.field.startsWith('need_sponsorship')?!negative:!negative;
 const known=relevant&&c.requiredValue===expected&&typeof fact==='boolean';return {...c,status:known?(fact===c.requiredValue?'met':'conflict'):'unknown'};});
 const hasFacts=professionalFields.some(field=>typeof facts[field]==='string'&&String(facts[field]).trim());
 return {requirements,constraints,coverage:requirements.length&&hasFacts?Math.round(100*requirements.filter(r=>r.status==='met').length/requirements.length):null};}

export function refreshStoredMatch(input:unknown,facts:Record<string,unknown>,description:string){
 if(!input||typeof input!=='object')return null;
 const data=input as Record<string,unknown>;
 if(!Array.isArray(data.requirements)||!Array.isArray(data.constraints))return null;
 const pick=(row:unknown,keys:string[])=>row&&typeof row==='object'?Object.fromEntries(keys.map(key=>[key,(row as Record<string,unknown>)[key]])):row;
 const parsed=matchSchema.safeParse({requirements:data.requirements.map(row=>pick(row,['requirement','jobEvidence','status','candidateField','candidateEvidence'])),constraints:data.constraints.map(row=>pick(row,['field','requiredValue','jobEvidence']))});
 return parsed.success?validateMatch(parsed.data,facts,description):null;
}
