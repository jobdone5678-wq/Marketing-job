-- ==============================================================================
-- 20261124000100_candidate_answer_bank.sql
-- Candidate Answer Bank Schema & Partial Unique Indexing
-- ==============================================================================

BEGIN;

-- 1. Create table public.candidate_answer_bank
CREATE TABLE IF NOT EXISTS public.candidate_answer_bank (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  question            text NOT NULL,
  question_normalized text NOT NULL,
  answer              text NOT NULL,
  company_scope       text DEFAULT NULL,
  use_count           integer NOT NULL DEFAULT 1 CHECK (use_count >= 0),
  last_used_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 2. Partial unique indexes to safely handle NULL company_scope without duplicate entries
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_answer_universal
  ON public.candidate_answer_bank (candidate_id, question_normalized)
  WHERE company_scope IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_answer_company
  ON public.candidate_answer_bank (candidate_id, question_normalized, company_scope)
  WHERE company_scope IS NOT NULL;

-- 3. Composite & lookup indexes for fast candidate queries and company-scope filtering
CREATE INDEX IF NOT EXISTS idx_candidate_answer_bank_candidate
  ON public.candidate_answer_bank (candidate_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_answer_bank_scope
  ON public.candidate_answer_bank (candidate_id, company_scope);

-- 4. Enable Row Level Security
ALTER TABLE public.candidate_answer_bank ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies to prevent conflicts on re-run
DROP POLICY IF EXISTS candidate_answer_bank_select ON public.candidate_answer_bank;
CREATE POLICY candidate_answer_bank_select ON public.candidate_answer_bank
  FOR SELECT TO authenticated
  USING (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS candidate_answer_bank_insert ON public.candidate_answer_bank;
CREATE POLICY candidate_answer_bank_insert ON public.candidate_answer_bank
  FOR INSERT TO authenticated
  WITH CHECK (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS candidate_answer_bank_update ON public.candidate_answer_bank;
CREATE POLICY candidate_answer_bank_update ON public.candidate_answer_bank
  FOR UPDATE TO authenticated
  USING (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()))
  WITH CHECK (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS candidate_answer_bank_delete ON public.candidate_answer_bank;
CREATE POLICY candidate_answer_bank_delete ON public.candidate_answer_bank
  FOR DELETE TO authenticated
  USING (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()));

-- 6. Permissions
REVOKE ALL ON public.candidate_answer_bank FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_answer_bank TO authenticated;
GRANT ALL ON public.candidate_answer_bank TO service_role;

-- 7. Trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trg_candidate_answer_bank_updated_at ON public.candidate_answer_bank;
CREATE TRIGGER trg_candidate_answer_bank_updated_at
  BEFORE UPDATE ON public.candidate_answer_bank
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMIT;
