export const runtime = 'nodejs';

// Modern canonical endpoint for extension application submission events.
// Enforces atomic writes to job_submissions and outside_jobs, candidate ownership
// validation against trusted authenticated identity, and event idempotency.
export { OPTIONS, POST } from '@/app/api/extension/auto-submit/route';
