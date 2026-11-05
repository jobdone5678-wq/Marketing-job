-- Enable Row Level Security and explicit least-privilege policies on candidate_shares
BEGIN;

ALTER TABLE public.candidate_shares ENABLE ROW LEVEL SECURITY;

-- 1. Recipients can view shares delivered to them that have not been revoked
CREATE POLICY candidate_shares_recipient_select ON public.candidate_shares
  FOR SELECT
  USING (
    recipient_id = auth.uid()
    AND revoked_at IS NULL
  );

-- 2. Actors who pushed the share can view their outgoing shares
CREATE POLICY candidate_shares_pusher_select ON public.candidate_shares
  FOR SELECT
  USING (
    pushed_by = auth.uid()
  );

-- 3. Super admins can view all candidate shares
CREATE POLICY candidate_shares_admin_select ON public.candidate_shares
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin' AND status = 'active'
    )
  );

-- 4. Authorized actors can insert shares if allowed by candidate_actor_can_share
CREATE POLICY candidate_shares_insert ON public.candidate_shares
  FOR INSERT
  WITH CHECK (
    pushed_by = auth.uid()
    AND public.candidate_actor_can_share(auth.uid(), candidate_id)
  );

-- 5. Pushers and Super Admins can update/revoke their shares
CREATE POLICY candidate_shares_update ON public.candidate_shares
  FOR UPDATE
  USING (
    pushed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin' AND status = 'active'
    )
  );

-- 6. Pushers and Super Admins can delete shares
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
