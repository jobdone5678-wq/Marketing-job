BEGIN;
ALTER TABLE public.email_confirmation_events DROP CONSTRAINT IF EXISTS email_confirmation_events_evidence_source_check;
ALTER TABLE public.email_confirmation_events ADD CONSTRAINT email_confirmation_events_evidence_source_check CHECK(evidence_source IN ('mailbox_receipt','recruiter_review','candidate_review'));
-- Requires the existing recruiting roles/assignments and email schema.
CREATE OR REPLACE FUNCTION public.email_candidate_access(p_owner uuid,p_candidate uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.candidates c ON c.id=p_candidate
 WHERE p.id=p_owner AND p.status='active' AND (p.role='super_admin'
 OR (p.role='client' AND c.user_id=p.id) OR (p.role='recruiter' AND c.assigned_recruiter_id=p.id)
 OR (p.role='technical_recruiter' AND c.assigned_technical_recruiter_id=p.id)));
$$;
REVOKE ALL ON FUNCTION public.email_candidate_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.email_candidate_access(uuid,uuid) TO service_role;
DROP POLICY IF EXISTS own_email_connections ON public.email_connections;
CREATE POLICY own_email_connections ON public.email_connections FOR SELECT TO authenticated USING(owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('client','recruiter','technical_recruiter','super_admin')));
DROP POLICY IF EXISTS own_email_receipts ON public.email_receipts;
CREATE POLICY own_email_receipts ON public.email_receipts FOR SELECT TO authenticated USING(owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('client','recruiter','technical_recruiter','super_admin')));
DROP POLICY IF EXISTS own_confirmation_events ON public.email_confirmation_events;
CREATE POLICY own_confirmation_events ON public.email_confirmation_events FOR SELECT TO authenticated USING(actor_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('client','recruiter','technical_recruiter','super_admin')));

CREATE OR REPLACE FUNCTION public.confirm_email_receipt(
  p_owner uuid, p_receipt uuid, p_candidate uuid, p_company text, p_title text,
  p_submission uuid DEFAULT NULL, p_manual boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.email_receipts; target uuid; existing_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner AND status = 'active' AND role IN ('client','recruiter','technical_recruiter','super_admin')) THEN
    RAISE EXCEPTION 'Active mailbox account required';
  END IF;
  SELECT * INTO r FROM public.email_receipts WHERE id = p_receipt AND owner_id = p_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF r.disposition = 'confirmed' THEN RETURN r.submission_id; END IF;
  IF r.disposition = 'dismissed' THEN RAISE EXCEPTION 'Dismissed receipt cannot be confirmed'; END IF;
  IF NOT public.email_candidate_access(p_owner,p_candidate) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
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
    INSERT INTO public.job_submissions(candidate_id,recruiter_id,technical_recruiter_id,company_name,job_title,submission_date,portal_source,status,job_location)
      VALUES(p_candidate,CASE WHEN (SELECT role FROM profiles WHERE id=p_owner) IN ('recruiter','super_admin') THEN p_owner ELSE NULL END,CASE WHEN (SELECT role FROM profiles WHERE id=p_owner)='technical_recruiter' THEN p_owner ELSE NULL END,trim(p_company),trim(p_title),(r.received_at AT TIME ZONE 'UTC')::date,'Email confirmation','Applied',NULL)
      RETURNING id INTO target;
  END IF;
  -- Preserve the recruiting pipeline status (interviews, offers, rejection, etc.).
  UPDATE public.job_submissions SET capture_status='confirmed', email_confirmed_at=COALESCE(email_confirmed_at,r.received_at) WHERE id=target;
  UPDATE public.email_receipts SET disposition='confirmed', candidate_id=p_candidate, submission_id=target,
    extracted_company=trim(p_company),extracted_job_title=trim(p_title),reviewed_at=now() WHERE id=r.id;
  INSERT INTO public.email_confirmation_events(receipt_id,submission_id,actor_id,evidence_source,observed_at)
    VALUES(r.id,target,p_owner,CASE WHEN p_manual AND (SELECT role FROM profiles WHERE id=p_owner)='client' THEN 'candidate_review' WHEN p_manual THEN 'recruiter_review' ELSE 'mailbox_receipt' END,r.received_at);
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
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE profiles.id=p_owner AND status='active' AND role IN ('client','recruiter','technical_recruiter','super_admin')) THEN
    RAISE EXCEPTION 'An active mailbox lease is required';
  END IF;
  SELECT * INTO prior FROM public.email_receipts WHERE owner_id=p_owner AND message_key=p_key;
  IF FOUND THEN RETURN QUERY SELECT prior.id,prior.disposition,true; RETURN; END IF;
  SELECT * INTO r FROM jsonb_populate_record(NULL::public.email_receipts,p_payload);
  IF r.candidate_id IS NOT NULL AND NOT public.email_candidate_access(p_owner,r.candidate_id) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
  IF r.submission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.job_submissions s WHERE s.id=r.submission_id AND s.candidate_id=r.candidate_id AND public.email_candidate_access(p_owner,s.candidate_id)) THEN RAISE EXCEPTION 'Application access denied'; END IF;
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
    AND EXISTS(SELECT 1 FROM public.profiles WHERE id=p_owner AND role IN ('client','recruiter','technical_recruiter','super_admin') AND status='active')
    RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_email_sync(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_sync(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.eligible_email_connections()
RETURNS TABLE(id uuid,owner_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT connection.id,connection.owner_id FROM public.email_connections connection JOIN public.profiles profile ON profile.id=connection.owner_id
    WHERE connection.status='connected' AND profile.status='active' AND profile.role IN ('client','recruiter','technical_recruiter','super_admin')
      AND (connection.sync_lease_until IS NULL OR connection.sync_lease_until<now())
    ORDER BY connection.last_attempted_at ASC NULLS FIRST,connection.id LIMIT 3;
$$;
REVOKE ALL ON FUNCTION public.eligible_email_connections() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_email_connections() TO service_role;


NOTIFY pgrst,'reload schema';
COMMIT;
