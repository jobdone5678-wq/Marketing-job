import {z} from 'zod';
import {candidateFields,employmentEntry,educationEntry,textFields,booleanFields} from './ai/schemas';
export const candidateInput=candidateFields.extend({is_active_bench:z.boolean(),notes:z.string().max(5000).nullable(),
  employment_history:z.array(employmentEntry).max(60),education_history:z.array(educationEntry).max(30)}).partial();

const employmentColumns=['employer','title','start','end','location'] as const;
const educationColumns=['degree','institution','start','end'] as const;

function sanitizeHistory(rows:unknown,columns:readonly string[]):Record<string,unknown>[] {
  if(!Array.isArray(rows))return [];
  return rows.map(row=>{
    const source=(row&&typeof row==='object'?row:{}) as Record<string,unknown>;
    const next:Record<string,unknown>={};
    for(const column of columns)next[column]=typeof source[column]==='string'?source[column]:null;
    next.evidence=typeof source.evidence==='string'?source.evidence:'';
    return next;
  });
}

// Builds a payload the database accepts: only known candidate fields, correct
// value types, and history rows trimmed to the columns the schema defines.
export function candidatePayload(source:Record<string,unknown>):Record<string,unknown> {
  const payload:Record<string,unknown>={};
  for(const field of textFields)payload[field]=typeof source[field]==='string'?source[field]:null;
  for(const field of booleanFields)payload[field]=typeof source[field]==='boolean'?source[field]:null;
  payload.employment_types=Array.isArray(source.employment_types)?source.employment_types:null;
  payload.is_active_bench=source.is_active_bench!==false;
  payload.notes=typeof source.notes==='string'?source.notes:null;
  payload.employment_history=sanitizeHistory(source.employment_history,employmentColumns);
  payload.education_history=sanitizeHistory(source.education_history,educationColumns);
  return payload;
}
