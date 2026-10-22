-- Extension candidate shares: reviewed candidates pushed from the portal into
-- the extension of the person applying.
--
-- A recruiter / technical recruiter / super admin (and a client pushing their own
-- candidate) publishes a confirmed candidate profile to a recipient client
-- account. The recipient's paired extension polls the share and renders the
-- reviewed profile in the popup alongside locally uploaded sources, with its
-- ATS score and missing requirements. Shares are actor-scoped, never overwrite
-- an existing reviewed candidate record, and are revocable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.candidate_shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  recipient_id  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  pushed_by     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  label         text,
  share_token   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  UNIQUE (candidate_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_shares_recipient
  ON public.candidate_shares (recipient_id, created_at DESC);

-- Who may push this candidate, and to whom. Super admin anywhere; a client may
-- only push their own candidate; staff may only push candidates assigned to them.
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

-- The recipient must be an active client account (or, for a client pushing their
-- own candidate, the candidate's own user_id).
CREATE OR REPLACE FUNCTION public.candidate_recipient_is_client(
  p_recipient uuid, p_candidate uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE recipient public.profiles; candidate public.candidates;
BEGIN
  SELECT * INTO recipient FROM public.profiles WHERE id=p_recipient AND status='active' AND role='client';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT user_id INTO candidate FROM public.candidates WHERE id=p_candidate;
  RETURN candidate IS NULL OR candidate.user_id = p_recipient;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_candidate_share(
  p_actor uuid, p_candidate uuid, p_recipient uuid, p_label text)
RETURNS public.candidate_shares LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing public.candidate_shares;
BEGIN
  IF NOT public.candidate_actor_can_share(p_actor, p_candidate) THEN
    RAISE EXCEPTION 'Candidate not found or not assigned to this account.' USING ERRORESTATE = '404';
  END IF;
  IF NOT public.candidate_recipient_is_client(p_recipient, p_candidate) THEN
    RAISE EXCEPTION 'Recipient account is not a valid client for this candidate.' USING ERRORESTATE = '400';
  END IF;
  SELECT * INTO existing FROM public.candidate_shares
    WHERE candidate_id = p_candidate AND recipient_id = p_recipient;
  IF FOUND AND existing.revoked_at IS NOT NULL THEN
    UPDATE public.candidate_shares
      SET share_token = encode(gen_random_bytes(24), 'base64'), pushed_by = p_actor,
          label = p_label, revoked_at = NULL
      WHERE id = existing.id
      RETURNING * INTO existing;
    RETURN existing;
  END IF;
  INSERT INTO public.candidate_shares (candidate_id, recipient_id, pushed_by, label, share_token)
  VALUES (p_candidate, p_recipient, p_actor, p_label, encode(gen_random_bytes(24), 'base64'))
  ON CONFLICT (candidate_id, recipient_id) DO UPDATE SET pushed_by = EXCLUDED.pushed_by, label = EXCLUDED.label
  RETURNING * INTO existing;
  RETURN existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_candidate_share(
  p_actor uuid, p_share uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE share public.candidate_shares; actor_role text;
BEGIN
  SELECT * INTO share FROM public.candidate_shares WHERE id = p_share;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT role INTO actor_role FROM public.profiles WHERE id=p_actor;
  IF share.pushed_by <> p_actor AND actor_role <> 'super_admin' THEN
    RETURN false;
  END IF;
  UPDATE public.candidate_shares SET revoked_at = now() WHERE id = p_share;
  RETURN true;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;