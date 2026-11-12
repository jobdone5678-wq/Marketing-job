-- Migration: 20261112000100_add_source_type_to_submissions.sql
-- Adds source_type column to job_submissions to distinguish portal vs extension applications

ALTER TABLE public.job_submissions
ADD COLUMN IF NOT EXISTS source_type text
CHECK (source_type IN ('portal', 'extension'))
DEFAULT 'portal';

-- Create index for filtering by source_type
CREATE INDEX IF NOT EXISTS idx_job_submissions_source_type ON public.job_submissions(source_type);

-- Backfill existing records: set source_type based on portal_source or outside_jobs link
UPDATE public.job_submissions
SET source_type = CASE
  WHEN lower(portal_source) LIKE '%outside%' OR lower(portal_source) LIKE '%extension%' THEN 'extension'
  WHEN EXISTS(SELECT 1 FROM public.outside_jobs oj WHERE oj.submission_id = public.job_submissions.id) THEN 'extension'
  ELSE 'portal'
END
WHERE source_type IS NULL;