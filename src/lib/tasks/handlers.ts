import 'server-only';
import { extractResume } from '@/lib/ai/resume';
import { syncSource } from '@/lib/jobs/sync';
import { analyzeMatch } from '@/lib/ai/match';
import { generatePacket } from '@/lib/ai/packet';
import type { BackgroundTask } from './types';
import { generateScreening } from '@/lib/extension-answers/service';
import { withAIExecutionWindow } from '@/lib/ai/execution-window';

export const handlers: Record<string, (task: BackgroundTask) => Promise<unknown>> = {
  resume_extract: extractResume,
  source_sync: syncSource,
  candidate_match: analyzeMatch,
  packet_generate: generatePacket,
  application_answers: (task: BackgroundTask) =>
    withAIExecutionWindow(45000, () => generateScreening(task)),
};

export async function handleTask(task: BackgroundTask) {
  const handler = handlers[task.kind];
  if (!handler) {
    throw new Error(`No task handler registered for kind: ${task.kind}`);
  }
  return handler(task);
}
