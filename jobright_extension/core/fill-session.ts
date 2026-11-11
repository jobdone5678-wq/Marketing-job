import { createCandidateContext, type CandidateRaw, type CandidateContextResult } from './candidate-context';
import { createJobContext, type JobInput, type JobContextResult } from './job-context';

export interface FillSessionOptions {
  candidate?: CandidateRaw | CandidateContextResult;
  source?: string;
  job?: JobInput | JobContextResult;
}

export interface ReadinessResult {
  ready: boolean;
  reasons: string[];
}

export interface WriteReceipt {
  fieldKey: string;
  previousValue: unknown;
  writtenValue: unknown;
  sessionId: string;
  writtenAt: string;
}

export interface FillSessionInstance {
  sessionId: string;
  candidateContext: CandidateContextResult | { valid: boolean; candidateId?: string | null; factsHash?: string; jdHash?: string; reasons: string[] };
  jobContext: JobContextResult | { valid: boolean; jobKey?: string; jdHash?: string; reasons: string[] };
  getReadiness: () => ReadinessResult;
  recordWrite: (fieldKey: string, previousValue: unknown, writtenValue: unknown) => void;
  canUndo: (fieldKey: string, currentValue: unknown) => boolean;
  getPreviousValue: (fieldKey: string) => unknown;
  getReceipts: () => WriteReceipt[];
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function createFillSession(options?: FillSessionOptions): FillSessionInstance {
  const opts = options || {};

  const candidateContext: any = (opts.candidate && 'factsHash' in opts.candidate)
    ? opts.candidate
    : createCandidateContext(opts.candidate as CandidateRaw, opts.source);

  const jobContext: any = (opts.job && 'jobKey' in opts.job)
    ? opts.job
    : createJobContext(opts.job as JobInput);

  const candidateId = candidateContext.candidateId || 'none';
  const factsHash = candidateContext.factsHash || 'unhashed';
  const jobKey = jobContext.jobKey || 'unknown_job';
  const jdHash = jobContext.jdHash || 'unhashed_jd';

  const sessionId = 'fs_' + hashString(`${candidateId}:${factsHash}:${jobKey}:${jdHash}`);

  // Receipt ledger for tracked writes and safe undo
  const writeReceipts = new Map<string, WriteReceipt>();

  function getReadiness(): ReadinessResult {
    const reasons: string[] = [];
    if (!candidateContext.candidateId) {
      reasons.push('Select or upload a candidate profile.');
    } else if (!candidateContext.valid) {
      reasons.push(...(candidateContext.reasons || ['Candidate profile needs confirmation.']));
    }
    if (!jobContext.valid) {
      reasons.push(...(jobContext.reasons || ['Complete job details are required before autofill.']));
    }
    return {
      ready: reasons.length === 0,
      reasons
    };
  }

  function recordWrite(fieldKey: string, previousValue: unknown, writtenValue: unknown): void {
    const prior = writeReceipts.get(fieldKey);
    const unchanged = prior && JSON.stringify(prior.writtenValue) === JSON.stringify(writtenValue);
    writeReceipts.set(fieldKey, {
      fieldKey,
      previousValue: unchanged ? prior.previousValue : previousValue,
      writtenValue,
      sessionId,
      writtenAt: new Date().toISOString()
    });
  }

  function canUndo(fieldKey: string, currentValue: unknown): boolean {
    const receipt = writeReceipts.get(fieldKey);
    if (!receipt) return false;
    return JSON.stringify(currentValue) === JSON.stringify(receipt.writtenValue);
  }

  function getPreviousValue(fieldKey: string): unknown {
    const receipt = writeReceipts.get(fieldKey);
    return receipt ? receipt.previousValue : undefined;
  }

  function getReceipts(): WriteReceipt[] {
    return Array.from(writeReceipts.values());
  }

  return {
    sessionId,
    candidateContext,
    jobContext,
    getReadiness,
    recordWrite,
    canUndo,
    getPreviousValue,
    getReceipts
  };
}

export const NextkinFillSession = { create: createFillSession };
export default NextkinFillSession;

