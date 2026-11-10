(function(root) {
  'use strict';

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function createFillSession(options) {
    const opts = options || {};
    const candModule = root.NextkinCandidateContext || (typeof require !== 'undefined' ? require('./candidate-context.js') : null);
    const jobModule = root.NextkinJobContext || (typeof require !== 'undefined' ? require('./job-context.js') : null);

    const candidateContext = (opts.candidate && opts.candidate.factsHash)
      ? opts.candidate
      : (candModule ? candModule.create(opts.candidate, opts.source) : { valid: Boolean(opts.candidate?.id), candidateId: opts.candidate?.id, reasons: [] });

    const jobContext = (opts.job && opts.job.jobKey)
      ? opts.job
      : (jobModule ? jobModule.create(opts.job) : { valid: Boolean(opts.job?.title), jobKey: opts.job?.url || 'unknown', reasons: [] });

    const candidateId = candidateContext.candidateId || 'none';
    const factsHash = candidateContext.factsHash || 'unhashed';
    const jobKey = jobContext.jobKey || 'unknown_job';
    const jdHash = jobContext.jdHash || 'unhashed_jd';

    const sessionId = 'fs_' + hashString(`${candidateId}:${factsHash}:${jobKey}:${jdHash}`);

    // Receipt ledger for tracked writes and safe undo
    const writeReceipts = new Map();

    function getReadiness() {
      const reasons = [];
      if (!candidateContext.candidateId) {
        reasons.push('Select or upload a candidate profile.');
      } else if (!candidateContext.valid) {
        reasons.push(...(candidateContext.reasons || ['Candidate facts must be reviewed and confirmed.']));
      }

      if (!jobContext.valid) {
        reasons.push(...(jobContext.reasons || ['Detect or paste the job description.']));
      }

      return {
        ready: reasons.length === 0,
        reasons
      };
    }

    function recordWrite(fieldKey, previousValue, writtenValue) {
      const prior = writeReceipts.get(fieldKey);
      const unchanged = prior && JSON.stringify(previousValue) === JSON.stringify(prior.writtenValue);
      writeReceipts.set(fieldKey, {
        fieldKey,
        previousValue: unchanged ? prior.previousValue : previousValue,
        writtenValue,
        sessionId,
        writtenAt: new Date().toISOString()
      });
    }

    function canUndo(fieldKey, currentValue) {
      const receipt = writeReceipts.get(fieldKey);
      if (!receipt) return false;
      return JSON.stringify(currentValue) === JSON.stringify(receipt.writtenValue);
    }

    function getPreviousValue(fieldKey) {
      const receipt = writeReceipts.get(fieldKey);
      return receipt ? receipt.previousValue : undefined;
    }

    function getReceipts() {
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

  const api = { create: createFillSession };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.NextkinFillSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
