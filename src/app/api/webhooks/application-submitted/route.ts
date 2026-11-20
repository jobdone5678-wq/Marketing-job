export const runtime = 'nodejs';

// Backward compatibility alias for /api/applications/submission-events.
// Uses the paired extension's existing bearer credential and enforces candidate
// ownership verification, atomic dual writes, receipt validation, and idempotency.
export { OPTIONS, POST } from '@/app/api/applications/submission-events/route';
