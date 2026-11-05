-- ==============================================================================
-- 20261105000100_candidate_shares_rls.sql
-- Self-Contained & Idempotent Migration: Table Creation, Indexing, and Row Level Security
-- ==============================================================================

BEGIN;

-- 1. Create table public.candidate_shares if not exists
CREATE TABLE IF NOT EXISTS public.candidate_shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  recipient_id  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  pushed_by     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  label         text,
  share_token   text NOT NULL DEFAULT gen_random_uuid()::text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  UNIQUE (candidate_id, recipient_id)
);

-- 2. High-Performance Composite & Partial Indexes
CREATE INDEX IF NOT EXISTS idx_candidate_shares_recipient
  ON public.candidate_shares (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_shares_active 
  ON public.candidate_shares (recipient_id, candidate_id) 
  WHERE revoked_at IS NULL;

-- 3. Required Helper Functions (Security Definer)
CREATE OR REPLACE FUNCTION public.candidate_actor_can_share(
  p_actor uuid, p_candidate uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; candidate public.candidates;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate;
  IF NOT FOUND OR candidate.provenance_status <> 'confirmed' THEN RETURN false; END IF;
  IF actor.role='super_admin' THEN RETURN true; END IF;
  IF actor.role='client' THEN RETURN candidate.user_id = p_actor; END IF;
  IF actor.role='recruiter' THEN RETURN candidate.assigned_recruiter_id = p_actor; END IF;
  IF actor.role='technical_recruiter' THEN RETURN candidate.assigned_technical_recruiter_id = p_actor; END IF;
  RETURN false;
END;
$$;

-- Restrict helper execution to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.candidate_actor_can_share(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_actor_can_share(uuid, uuid) TO authenticated, service_role;

-- 4. Enable Row Level Security
ALTER TABLE public.candidate_shares ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies to prevent conflicts on re-run
DROP POLICY IF EXISTS candidate_shares_recipient_select ON public.candidate_shares;
DROP POLICY IF EXISTS candidate_shares_pusher_select ON public.candidate_shares;
DROP POLICY IF EXISTS candidate_shares_admin_select ON public.candidate_shares;
DROP POLICY IF EXISTS candidate_shares_insert ON public.candidate_shares;
DROP POLICY IF EXISTS candidate_shares_update ON public.candidate_shares;
DROP POLICY IF EXISTS candidate_shares_delete ON public.candidate_shares;

-- 6. Define Explicit Least-Privilege Policies

-- Policy 1: Recipients can view shares delivered to them that have not been revoked
CREATE POLICY candidate_shares_recipient_select ON public.candidate_shares
  FOR SELECT
  USING (
    recipient_id = auth.uid()
    AND revoked_at IS NULL
  );

-- Policy 2: Actors who pushed the share can view their outgoing shares
CREATE POLICY candidate_shares_pusher_select ON public.candidate_shares
  FOR SELECT
  USING (
    pushed_by = auth.uid()
  );

-- Policy 3: Super admins can view all candidate shares
CREATE POLICY candidate_shares_admin_select ON public.candidate_shares
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin' AND status = 'active'
    )
  );

-- Policy 4: Authorized actors can insert shares if allowed by candidate_actor_can_share
CREATE POLICY candidate_shares_insert ON public.candidate_shares
  FOR INSERT
  WITH CHECK (
    pushed_by = auth.uid()
    AND public.candidate_actor_can_share(auth.uid(), candidate_id)
  );

-- Policy 5: Pushers and Super Admins can update/revoke their shares
CREATE POLICY candidate_shares_update ON public.candidate_shares
  FOR UPDATE
  USING (
    pushed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin' AND status = 'active'
    )
  );

-- Policy 6: Pushers and Super Admins can delete shares
CREATE POLICY candidate_shares_delete ON public.candidate_shares
  FOR DELETE
  USING (
    pushed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin' AND status = 'active'
    )
  );

COMMIT;
