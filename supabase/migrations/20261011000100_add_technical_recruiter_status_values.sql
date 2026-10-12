BEGIN;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'technical_recruiter';
ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'rejected';

COMMIT;
