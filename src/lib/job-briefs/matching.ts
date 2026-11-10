import {z} from 'zod';
import {requirementsSchema,validateRequirements} from '@/lib/ai/requirements-validation';
import {validateMatch} from '@/lib/ai/match-validation';
export const briefRequirementsSchema=requirementsSchema.extend({requirements:z.array(z.object({requirement:z.string().min(1).max(200),jobEvidence:z.string().min(1).max(2000),importance:z.enum(['required','preferred'])}).strict()).max(60)});
export function validateBriefRequirements(input:unknown,description:string){
 const parsed=briefRequirementsSchema.parse(input);
 const checked=validateRequirements({requirements:parsed.requirements.map(({requirement,jobEvidence})=>({requirement,jobEvidence})),constraints:parsed.constraints},description);
 if(checked.requirements.length!==parsed.requirements.length)throw new Error('Each requirement must be quoted in the JD. Remove duplicates or correct its evidence.');
 return {...checked,requirements:parsed.requirements};
}
export function matchBriefCandidate(requirements:z.infer<typeof briefRequirementsSchema>,description:string,candidate:{id:string;full_name:string;version?:number;confirmed_facts?:Record<string,unknown>;assigned_recruiter_id?:string|null}){
 const result=validateMatch({requirements:requirements.requirements.map(({requirement,jobEvidence})=>({requirement,jobEvidence,status:'unknown',candidateField:null,candidateEvidence:null})),constraints:requirements.constraints},candidate.confirmed_facts||{},description);
 const rows=result.requirements.map(row=>({...row,importance:requirements.requirements.find(r=>r.requirement===row.requirement)?.importance||'required'}));
 const denominator=rows.reduce((sum,row)=>sum+(row.importance==='required'?2:1),0);
 const supported=rows.reduce((sum,row)=>sum+(row.status==='met'?(row.importance==='required'?2:1):0),0);
 return {candidateId:candidate.id,name:candidate.full_name,candidateVersion:candidate.version,assignedRecruiterId:candidate.assigned_recruiter_id||null,
  coverage:result.coverage===null||!denominator?null:Math.round(100*supported/denominator),requirements:rows,constraints:result.constraints,
  supported:rows.filter(r=>r.status==='met').length,unknown:rows.filter(r=>r.status==='unknown').length,
  requiredUnknown:rows.filter(r=>r.importance==='required'&&r.status==='unknown').length};
}
