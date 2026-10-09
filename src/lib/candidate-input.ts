import {z} from 'zod';
import {candidateFields,employmentEntry,educationEntry} from './ai/schemas';
export const candidateInput=candidateFields.extend({is_active_bench:z.boolean(),notes:z.string().max(5000).nullable(),
  employment_history:z.array(employmentEntry).max(60),education_history:z.array(educationEntry).max(30)}).partial();
