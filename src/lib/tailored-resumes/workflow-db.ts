import 'server-only';
import { checkDb, CaptureError } from '@/lib/db/admin';

// Tailored resumes need the JD workflow tables. A missing table means the
// migration has not been applied yet.
export function checkWorkflowDb(error: Parameters<typeof checkDb>[0]) {
  if (error && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code || '')) {
    throw new CaptureError('Tailored resumes need the database update: apply 20261016000100_jd_tailored_resumes.sql.', 503);
  }
  checkDb(error);
}
