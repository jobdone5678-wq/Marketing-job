-- Apply after 20261006_bench_marketing_schema.sql. No existing records are deleted.
BEGIN;

-- Browser-controlled profile writes must not grant staff privileges.
CREATE OR REPLACE FUNCTION public.guard_profile_privileges() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb->>'role' = 'service_role'
     OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='super_admin' AND status='active') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Role and account status changes require an administrator operation';
  END IF;
  IF TG_OP = 'INSERT' AND NOT ((NEW.role = 'client' AND NEW.status = 'active') OR (NEW.role = 'recruiter' AND NEW.status = 'pending')) THEN
    RAISE EXCEPTION 'Staff privileges cannot be granted by profile insertion';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_profile_privileges ON public.profiles;
CREATE TRIGGER guard_profile_privileges BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

-- Self-selected recruiter metadata is a request for access, not staff authorization.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE requested_staff boolean;
BEGIN
  requested_staff := lower(COALESCE(NEW.raw_user_meta_data->>'role','')) = 'recruiter';
  INSERT INTO public.profiles(id,email,full_name,phone,role,status)
  VALUES(NEW.id,COALESCE(NEW.email,''),COALESCE(NEW.raw_user_meta_data->>'full_name',NEW.raw_user_meta_data->>'name',split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'phone',
    CASE WHEN requested_staff THEN 'recruiter'::public.app_role ELSE 'client'::public.app_role END,
    CASE WHEN requested_staff THEN 'pending'::public.account_status ELSE 'active'::public.account_status END)
  ON CONFLICT(id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Existing candidate/submission policies already use this helper; include approval status.
CREATE OR REPLACE FUNCTION public.get_current_role() RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT role FROM public.profiles WHERE id=auth.uid() AND status='active' LIMIT 1;
$$;

CREATE TABLE public.email_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gmail')),
  mailbox_email text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','reconnect_required','disconnected')),
  sender_domains text[] NOT NULL DEFAULT '{}',
  sync_after timestamptz NOT NULL DEFAULT now() - interval '7 days',
  sync_page_token text,
  sync_window_end timestamptz,
  sync_lease_until timestamptz,
  sync_lease_token uuid,
  last_synced_at timestamptz,
  last_attempted_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, provider, mailbox_email)
);

CREATE TABLE public.email_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.email_connections(id) ON DELETE SET NULL,
  message_key text NOT NULL,
  source text NOT NULL CHECK (source IN ('connected_mailbox','manual_import')),
  sender text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL,
  received_at timestamptz NOT NULL,
  body_text text NOT NULL CHECK (length(body_text) <= 50000),
  disposition text NOT NULL DEFAULT 'needs_review' CHECK (disposition IN ('needs_review','confirmed','dismissed')),
  extracted_company text,
  extracted_job_title text,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES public.job_submissions(id) ON DELETE SET NULL,
  review_reason text NOT NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, message_key)
);
CREATE INDEX email_receipts_owner_created ON public.email_receipts(owner_id, created_at DESC);

CREATE TABLE public.email_confirmation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL UNIQUE REFERENCES public.email_receipts(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.job_submissions(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  evidence_source text NOT NULL CHECK (evidence_source IN ('mailbox_receipt','recruiter_review')),
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_submissions
  ADD COLUMN IF NOT EXISTS capture_status text CHECK (capture_status IN ('started','in_progress','submit_attempted','submitted','confirmed','failed')),
  ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_confirmation_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('request.jwt.claim.role',true)='service_role'
    OR COALESCE(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'='service_role'
    OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (TG_OP='INSERT' AND (NEW.capture_status IS NOT NULL OR NEW.email_confirmed_at IS NOT NULL))
    OR (TG_OP='UPDATE' AND (NEW.capture_status IS DISTINCT FROM OLD.capture_status OR NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at)) THEN
    RAISE EXCEPTION 'Application confirmation evidence requires a trusted receipt operation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_confirmation_fields BEFORE INSERT OR UPDATE ON public.job_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_confirmation_fields();

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_confirmation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_email_connections ON public.email_connections FOR SELECT TO authenticated
  USING (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active' AND role IN ('recruiter','super_admin')));
CREATE POLICY own_email_receipts ON public.email_receipts FOR SELECT TO authenticated
  USING (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active' AND role IN ('recruiter','super_admin')));
CREATE POLICY own_confirmation_events ON public.email_confirmation_events FOR SELECT TO authenticated
  USING (actor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active' AND role IN ('recruiter','super_admin')));
REVOKE ALL ON public.email_connections, public.email_receipts, public.email_confirmation_events FROM anon, authenticated;
GRANT SELECT (id,owner_id,provider,mailbox_email,status,sender_domains,last_synced_at,last_error,created_at)
  ON public.email_connections TO authenticated;
GRANT SELECT ON public.email_receipts, public.email_confirmation_events TO authenticated;
GRANT ALL ON public.email_connections, public.email_receipts, public.email_confirmation_events TO service_role;

-- Confirmation and submission creation commit together, with an idempotent locked receipt.
CREATE OR REPLACE FUNCTION public.confirm_email_receipt(
  p_owner uuid, p_receipt uuid, p_candidate uuid, p_company text, p_title text,
  p_submission uuid DEFAULT NULL, p_manual boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.email_receipts; target uuid; existing_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner AND status = 'active' AND role IN ('recruiter','super_admin')) THEN
    RAISE EXCEPTION 'Active staff account required';
  END IF;
  SELECT * INTO r FROM public.email_receipts WHERE id = p_receipt AND owner_id = p_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF r.disposition = 'confirmed' THEN RETURN r.submission_id; END IF;
  IF r.disposition = 'dismissed' THEN RAISE EXCEPTION 'Dismissed receipt cannot be confirmed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidates WHERE id = p_candidate) THEN RAISE EXCEPTION 'Candidate not found'; END IF;
  IF length(trim(p_company)) NOT BETWEEN 1 AND 160 OR length(trim(p_title)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Company and job title are required'; END IF;
  -- Serialize matching application writes for receipts from multiple mailboxes.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_candidate::text || lower(trim(p_company)) || lower(trim(p_title)), 0));
  target := p_submission;
  IF target IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.job_submissions WHERE id = target AND candidate_id = p_candidate
        AND lower(trim(company_name)) = lower(trim(p_company)) AND lower(trim(job_title)) = lower(trim(p_title))) THEN
      RAISE EXCEPTION 'Selected submission does not match candidate, company and role';
    END IF;
  ELSE
    SELECT count(*), (array_agg(id))[1] INTO existing_count, target FROM public.job_submissions
      WHERE candidate_id = p_candidate AND lower(trim(company_name)) = lower(trim(p_company))
        AND lower(trim(job_title)) = lower(trim(p_title));
    IF existing_count > 1 THEN RAISE EXCEPTION 'Multiple applications match; select one for review'; END IF;
  END IF;
  IF target IS NULL THEN
    INSERT INTO public.job_submissions(candidate_id,recruiter_id,company_name,job_title,submission_date,portal_source,status,job_location)
      VALUES(p_candidate,p_owner,trim(p_company),trim(p_title),(r.received_at AT TIME ZONE 'UTC')::date,'Email confirmation','Applied',NULL)
      RETURNING id INTO target;
  END IF;
  -- Preserve the recruiting pipeline status (interviews, offers, rejection, etc.).
  UPDATE public.job_submissions SET capture_status='confirmed', email_confirmed_at=COALESCE(email_confirmed_at,r.received_at) WHERE id=target;
  UPDATE public.email_receipts SET disposition='confirmed', candidate_id=p_candidate, submission_id=target,
    extracted_company=trim(p_company),extracted_job_title=trim(p_title),reviewed_at=now() WHERE id=r.id;
  INSERT INTO public.email_confirmation_events(receipt_id,submission_id,actor_id,evidence_source,observed_at)
    VALUES(r.id,target,p_owner,CASE WHEN p_manual THEN 'recruiter_review' ELSE 'mailbox_receipt' END,r.received_at);
  RETURN target;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_email_receipt(uuid,uuid,uuid,text,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_email_receipt(uuid,uuid,uuid,text,text,uuid,boolean) TO service_role;

-- Lock the connection while storing evidence so disconnect cannot finish before a later ingest.
CREATE OR REPLACE FUNCTION public.ingest_mailbox_receipt(
  p_owner uuid,p_connection uuid,p_lease uuid,p_key text,p_payload jsonb,p_confirm boolean
) RETURNS TABLE(id uuid,disposition text,duplicate boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.email_receipts; saved_id uuid; prior public.email_receipts;
BEGIN
  PERFORM 1 FROM public.email_connections WHERE email_connections.id=p_connection AND owner_id=p_owner
    AND status='connected' AND sync_lease_token=p_lease AND sync_lease_until>now() FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE profiles.id=p_owner AND status='active' AND role IN ('recruiter','super_admin')) THEN
    RAISE EXCEPTION 'An active mailbox lease is required';
  END IF;
  SELECT * INTO prior FROM public.email_receipts WHERE owner_id=p_owner AND message_key=p_key;
  IF FOUND THEN RETURN QUERY SELECT prior.id,prior.disposition,true; RETURN; END IF;
  SELECT * INTO r FROM jsonb_populate_record(NULL::public.email_receipts,p_payload);
  INSERT INTO public.email_receipts(owner_id,connection_id,message_key,source,sender,recipients,subject,received_at,body_text,
    review_reason,extracted_company,extracted_job_title,candidate_id,submission_id)
  VALUES(p_owner,p_connection,p_key,'connected_mailbox',r.sender,r.recipients,r.subject,r.received_at,r.body_text,
    r.review_reason,r.extracted_company,r.extracted_job_title,r.candidate_id,r.submission_id)
  ON CONFLICT(owner_id,message_key) DO NOTHING RETURNING email_receipts.id INTO saved_id;
  IF saved_id IS NULL THEN
    SELECT * INTO prior FROM public.email_receipts WHERE owner_id=p_owner AND message_key=p_key;
    RETURN QUERY SELECT prior.id,prior.disposition,true; RETURN;
  END IF;
  IF p_confirm THEN
    BEGIN
      PERFORM public.confirm_email_receipt(p_owner,saved_id,r.candidate_id,r.extracted_company,r.extracted_job_title,r.submission_id,false);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.email_receipts SET review_reason='Automatic linking could not complete. Review and select the application.' WHERE email_receipts.id=saved_id;
    END;
  END IF;
  RETURN QUERY SELECT receipt.id,receipt.disposition,false FROM public.email_receipts receipt WHERE receipt.id=saved_id;
END; $$;
REVOKE ALL ON FUNCTION public.ingest_mailbox_receipt(uuid,uuid,uuid,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_mailbox_receipt(uuid,uuid,uuid,text,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_email_sync(p_connection uuid,p_owner uuid,p_lease uuid)
RETURNS SETOF public.email_connections LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.email_connections SET sync_lease_until=now()+interval '5 minutes',sync_lease_token=p_lease,last_attempted_at=now()
    WHERE id=p_connection AND owner_id=p_owner AND status='connected'
    AND (sync_lease_until IS NULL OR sync_lease_until < now())
    AND EXISTS(SELECT 1 FROM public.profiles WHERE id=p_owner AND role IN ('recruiter','super_admin') AND status='active')
    RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_email_sync(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_sync(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.eligible_email_connections()
RETURNS TABLE(id uuid,owner_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT connection.id,connection.owner_id FROM public.email_connections connection JOIN public.profiles profile ON profile.id=connection.owner_id
    WHERE connection.status='connected' AND profile.status='active' AND profile.role IN ('recruiter','super_admin')
      AND (connection.sync_lease_until IS NULL OR connection.sync_lease_until<now())
    ORDER BY connection.last_attempted_at ASC NULLS FIRST,connection.id LIMIT 3;
$$;
REVOKE ALL ON FUNCTION public.eligible_email_connections() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_email_connections() TO service_role;

COMMIT;
