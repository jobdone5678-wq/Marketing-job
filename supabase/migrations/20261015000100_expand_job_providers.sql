-- 20261015000100_expand_job_providers.sql
-- Expand public job source providers to include Lever, SmartRecruiters, Breezy HR, and RemoteOK.

ALTER TABLE public.job_sources 
  DROP CONSTRAINT IF EXISTS job_sources_provider_check;

ALTER TABLE public.job_sources 
  ADD CONSTRAINT job_sources_provider_check 
  CHECK (provider IN ('greenhouse', 'ashby', 'lever', 'smartrecruiters', 'breezy', 'remoteok'));
