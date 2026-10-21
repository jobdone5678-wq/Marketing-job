import {generateScreening} from '@/lib/extension-answers/service';
import 'server-only';import {extractResume} from '@/lib/ai/resume';import {syncSource} from '@/lib/jobs/sync';import {analyzeMatch} from '@/lib/ai/match';import {generatePacket} from '@/lib/ai/packet';import type {BackgroundTask} from './types';
import {extractJobBrief} from '@/lib/job-briefs/handlers';
import {generateTailoredResume} from '@/lib/tailored-resumes/handler';
export const handlers={resume_extract:extractResume,source_sync:syncSource,candidate_match:analyzeMatch,packet_generate:generatePacket,jd_extract:extractJobBrief,resume_tailor:generateTailoredResume,application_answers:generateScreening};
export async function handleTask(task:BackgroundTask){return handlers[task.kind](task);}
