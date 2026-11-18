import 'server-only';
import { extractResume } from '@/lib/ai/resume';
import { syncSource } from '@/lib/jobs/sync';
import { analyzeMatch } from '@/lib/ai/match';
import { generatePacket } from '@/lib/ai/packet';
import type { BackgroundTask } from './types';
import { generateTailoredResume } from '@/lib/tailored-resumes/handler';
import { generateScreening } from '@/lib/extension-answers/service';
import { withAIExecutionWindow } from '@/lib/ai/execution-window';
export const handlers = {
  resume_extract: extractResume,
  source_sync: syncSource,
  candidate_match: analyzeMatch,
  packet_generate: generatePacket,
  resume_tailor: generateTailoredResume,
  application_answers: (task: BackgroundTask) =>
    withAIExecutionWindow(45000, () => generateScreening(task)),
};
export async function handleTask(task: BackgroundTask) {
  return handlers[task.kind](task);
}
