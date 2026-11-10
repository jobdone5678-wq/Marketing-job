BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS assigned_technical_recruiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.candidate_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assignment_role text NOT NULL CHECK (assignment_role IN ('recruiter','technical_recruiter')),
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS candidate_staff_one_current_role
  ON public.candidate_staff_assignments(candidate_id, assignment_role)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS candidate_staff_profile_current
  ON public.candidate_staff_assignments(profile_id, assignment_role)
  WHERE ended_at IS NULL;
ALTER TABLE public.candidate_staff_assignments ENABLE ROW LEVEL SECURITY;

INSERT INTO public.candidate_staff_assignments(candidate_id,profile_id,assignment_role,assigned_by,started_at)
SELECT c.id,c.assigned_recruiter_id,'recruiter',c.created_by,c.created_at
FROM public.candidates c
JOIN public.profiles p ON p.id=c.assigned_recruiter_id AND p.role='recruiter'
WHERE c.assigned_recruiter_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.candidate_staff_can_access(p_candidate uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.candidates candidate ON candidate.id=p_candidate
    WHERE actor.id=auth.uid() AND actor.status='active'
      AND (
        actor.role='super_admin'
        OR (actor.role='client' AND candidate.user_id=actor.id)
        OR (actor.role='recruiter' AND candidate.assigned_recruiter_id=actor.id)
        OR (actor.role='technical_recruiter' AND candidate.assigned_technical_recruiter_id=actor.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.candidate_resume_object_can_access(p_object_path text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidate_documents document
    JOIN public.profiles actor ON actor.id=auth.uid() AND actor.status='active'
    WHERE document.object_path=p_object_path AND document.status<>'deleted'
      AND (
        actor.role='super_admin'
        OR document.owner_id=actor.id AND document.candidate_id IS NULL AND actor.role IN ('client','recruiter','technical_recruiter')
        OR public.candidate_staff_can_access(document.candidate_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_privileges() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true)='service_role'
     OR COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb->>'role'='service_role'
     OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='super_admin' AND status='active') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Role and account status changes require an administrator operation';
  END IF;
  IF TG_OP='INSERT' AND NOT (
    (NEW.role='client' AND NEW.status='active')
    OR (NEW.role IN ('recruiter','technical_recruiter') AND NEW.status='pending')
  ) THEN RAISE EXCEPTION 'Staff privileges cannot be granted by profile insertion'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE requested_role text; requested_app_role public.app_role; requested_status public.account_status;
BEGIN
  requested_role:=lower(COALESCE(NEW.raw_user_meta_data->>'role',''));
  requested_app_role:=CASE
    WHEN requested_role='recruiter' THEN 'recruiter'::public.app_role
    WHEN requested_role='technical_recruiter' THEN 'technical_recruiter'::public.app_role
    ELSE 'client'::public.app_role END;
  requested_status:=CASE WHEN requested_app_role='client' THEN 'active'::public.account_status ELSE 'pending'::public.account_status END;
  INSERT INTO public.profiles(id,email,full_name,phone,role,status)
  VALUES(NEW.id,COALESCE(NEW.email,''),COALESCE(NEW.raw_user_meta_data->>'full_name',NEW.raw_user_meta_data->>'name',split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'phone',requested_app_role,requested_status)
  ON CONFLICT(id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_candidate_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role',true)='service_role'
    OR COALESCE(current_setting('request.jwt.claims',true),'{}'::jsonb)->>'role'='service_role' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND (NEW.version<>1 OR NEW.provenance_status<>'legacy_unconfirmed' OR NEW.confirmed_facts<>'{}'::jsonb
    OR NEW.created_by IS NOT NULL OR NEW.assigned_technical_recruiter_id IS NOT NULL
    OR (public.get_current_role()='client' AND (NEW.user_id IS DISTINCT FROM auth.uid() OR NEW.assigned_recruiter_id IS NOT NULL))) THEN
    RAISE EXCEPTION 'Candidate protected fields require a trusted review operation';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.assigned_recruiter_id IS DISTINCT FROM OLD.assigned_recruiter_id
    OR NEW.assigned_technical_recruiter_id IS DISTINCT FROM OLD.assigned_technical_recruiter_id
    OR NEW.version IS DISTINCT FROM OLD.version OR NEW.provenance_status IS DISTINCT FROM OLD.provenance_status
    OR NEW.confirmed_facts IS DISTINCT FROM OLD.confirmed_facts OR NEW.employment_history IS DISTINCT FROM OLD.employment_history
    OR NEW.education_history IS DISTINCT FROM OLD.education_history OR NEW.evidence IS DISTINCT FROM OLD.evidence OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'Candidate protected fields require a trusted review operation';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.save_candidate_profile(p_actor uuid,p_id uuid,p_expected integer,p_fields jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; prior public.candidates; incoming public.candidates; result uuid;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active account required'; END IF;
  SELECT * INTO incoming FROM jsonb_populate_record(NULL::public.candidates,p_fields);
  IF incoming.full_name IS NULL OR length(trim(incoming.full_name)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Full name is required'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO prior FROM public.candidates WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR (actor.role='client' AND prior.user_id IS DISTINCT FROM p_actor) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
    IF p_expected IS DISTINCT FROM prior.version THEN RAISE EXCEPTION 'Profile changed; reload before saving'; END IF;
    result:=p_id;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
    IF actor.role='client' AND EXISTS(SELECT 1 FROM public.candidates WHERE user_id=p_actor) THEN RAISE EXCEPTION 'Your profile already exists; edit it instead'; END IF;
    INSERT INTO public.candidates(full_name,user_id,assigned_recruiter_id,assigned_technical_recruiter_id,created_by)
      VALUES(trim(incoming.full_name),CASE WHEN actor.role='client' THEN p_actor ELSE NULL END,
        CASE WHEN actor.role='recruiter' THEN p_actor ELSE NULL END,
        CASE WHEN actor.role='technical_recruiter' THEN p_actor ELSE NULL END,p_actor) RETURNING id INTO result;
    IF actor.role IN ('recruiter','technical_recruiter') THEN
      INSERT INTO public.candidate_staff_assignments(candidate_id,profile_id,assignment_role,assigned_by)
        VALUES(result,p_actor,actor.role::text,p_actor);
    END IF;
  END IF;
  UPDATE public.candidates SET full_name=trim(incoming.full_name),email=incoming.email,phone=incoming.phone,linkedin_url=incoming.linkedin_url,
    current_city=incoming.current_city,current_state=incoming.current_state,full_address=incoming.full_address,visa_status=incoming.visa_status,
    authorized_in_usa=incoming.authorized_in_usa,need_sponsorship_now=incoming.need_sponsorship_now,need_sponsorship_future=incoming.need_sponsorship_future,
    current_employer=incoming.current_employer,current_job_title=incoming.current_job_title,employment_status=incoming.employment_status,
    total_experience_years=incoming.total_experience_years,relevant_experience_years=incoming.relevant_experience_years,
    notice_period=incoming.notice_period,available_to_join=incoming.available_to_join,interview_availability=incoming.interview_availability,
    open_to_relocation=incoming.open_to_relocation,preferred_work_type=incoming.preferred_work_type,preferred_locations=incoming.preferred_locations,
    current_salary=incoming.current_salary,expected_salary=incoming.expected_salary,employment_types=incoming.employment_types,
    highest_qualification=incoming.highest_qualification,university_name=incoming.university_name,graduation_year=incoming.graduation_year,
    target_job_titles=incoming.target_job_titles,primary_skills=incoming.primary_skills,secondary_skills=incoming.secondary_skills,certifications=incoming.certifications,
    is_active_bench=COALESCE(incoming.is_active_bench,false),notes=incoming.notes,provenance_status='confirmed',
    employment_history=COALESCE(incoming.employment_history,'[]'::jsonb),education_history=COALESCE(incoming.education_history,'[]'::jsonb),
    evidence=COALESCE(incoming.evidence,'[]'::jsonb),confirmed_facts=p_fields-'user_id'-'assigned_recruiter_id'-'assigned_technical_recruiter_id'-'created_by'-'version'-'id'-'resume_url',
    version=version+1 WHERE id=result;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.set_candidate_staff_assignment(p_actor uuid,p_candidate uuid,p_profile uuid,p_assignment_role text,p_assigned boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE expected_role text; current_id uuid; result_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN
    RAISE EXCEPTION 'Active administrator required';
  END IF;
  IF p_assignment_role NOT IN ('recruiter','technical_recruiter') THEN RAISE EXCEPTION 'Invalid assignment role'; END IF;
  expected_role:=p_assignment_role;
  IF NOT EXISTS(SELECT 1 FROM public.candidates WHERE id=p_candidate) THEN RAISE EXCEPTION 'Candidate not found'; END IF;
  SELECT id INTO current_id FROM public.candidate_staff_assignments
    WHERE candidate_id=p_candidate AND assignment_role=p_assignment_role AND ended_at IS NULL FOR UPDATE;
  IF p_assigned THEN
    IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_profile AND role::text=expected_role AND status='active') THEN
      RAISE EXCEPTION 'Select an active staff member with the requested role';
    END IF;
    IF current_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.candidate_staff_assignments WHERE id=current_id AND profile_id=p_profile) THEN
      RETURN current_id;
    END IF;
    IF current_id IS NOT NULL THEN UPDATE public.candidate_staff_assignments SET ended_at=now() WHERE id=current_id; END IF;
    INSERT INTO public.candidate_staff_assignments(candidate_id,profile_id,assignment_role,assigned_by)
      VALUES(p_candidate,p_profile,p_assignment_role,p_actor) RETURNING id INTO result_id;
  ELSE
    IF current_id IS NULL THEN RETURN NULL; END IF;
    IF p_profile IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.candidate_staff_assignments WHERE id=current_id AND profile_id=p_profile) THEN
      RAISE EXCEPTION 'Assignment changed; reload before removing it';
    END IF;
    UPDATE public.candidate_staff_assignments SET ended_at=now() WHERE id=current_id RETURNING id INTO result_id;
  END IF;
  IF p_assignment_role='recruiter' THEN
    UPDATE public.candidates SET assigned_recruiter_id=CASE WHEN p_assigned THEN p_profile ELSE NULL END WHERE id=p_candidate;
  ELSE
    UPDATE public.candidates SET assigned_technical_recruiter_id=CASE WHEN p_assigned THEN p_profile ELSE NULL END WHERE id=p_candidate;
  END IF;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata)
    VALUES(p_actor,CASE WHEN p_assigned THEN 'candidate_staff_assigned' ELSE 'candidate_staff_unassigned' END,p_candidate,
      jsonb_build_object('profile_id',p_profile,'assignment_role',p_assignment_role,'assignment_id',result_id));
  RETURN result_id;
END; $$;

DROP POLICY IF EXISTS "Clients can only view their own candidate profile" ON public.candidates;
DROP POLICY IF EXISTS "Admins and Recruiters have full candidate access" ON public.candidates;
DROP POLICY IF EXISTS candidate_assignment_reads ON public.candidates;
CREATE POLICY candidate_assignment_reads ON public.candidates FOR SELECT TO authenticated
  USING(public.candidate_staff_can_access(id));

DROP POLICY IF EXISTS candidate_staff_assignment_reads ON public.candidate_staff_assignments;
CREATE POLICY candidate_staff_assignment_reads ON public.candidate_staff_assignments FOR SELECT TO authenticated
  USING(public.get_current_role()='super_admin' OR profile_id=auth.uid());

DROP POLICY IF EXISTS private_documents ON public.candidate_documents;
CREATE POLICY private_documents ON public.candidate_documents FOR SELECT TO authenticated
  USING(public.candidate_staff_can_access(candidate_id)
    OR owner_id=auth.uid() AND candidate_id IS NULL AND public.get_current_role() IN ('client','recruiter','technical_recruiter'));

DROP POLICY IF EXISTS private_extractions ON public.resume_extractions;
CREATE POLICY private_extractions ON public.resume_extractions FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.candidate_documents document WHERE document.id=document_id
    AND (public.candidate_staff_can_access(document.candidate_id)
      OR document.owner_id=auth.uid() AND document.candidate_id IS NULL AND public.get_current_role() IN ('client','recruiter','technical_recruiter'))));

DROP POLICY IF EXISTS private_resume_reads ON storage.objects;
CREATE POLICY private_resume_reads ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id='candidate-resumes' AND public.candidate_resume_object_can_access(name));

DROP POLICY IF EXISTS match_reads ON public.candidate_matches;
CREATE POLICY match_reads ON public.candidate_matches FOR SELECT TO authenticated
  USING(public.candidate_staff_can_access(candidate_id));

DROP POLICY IF EXISTS packet_reads ON public.submission_packets;
CREATE POLICY packet_reads ON public.submission_packets FOR SELECT TO authenticated
  USING(public.candidate_staff_can_access(candidate_id));

DROP POLICY IF EXISTS intent_reads ON public.application_intents;
CREATE POLICY intent_reads ON public.application_intents FOR SELECT TO authenticated
  USING(public.candidate_staff_can_access(candidate_id));

DROP POLICY IF EXISTS event_reads ON public.browser_capture_events;
CREATE POLICY event_reads ON public.browser_capture_events FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.application_intents i WHERE i.id=intent_id
    AND (i.owner_id=auth.uid() AND public.get_current_role() IN ('recruiter','technical_recruiter','super_admin')
      AND public.candidate_staff_can_access(i.candidate_id)
      OR public.candidate_staff_can_access(i.candidate_id))));

DROP POLICY IF EXISTS credential_reads ON public.extension_credentials;
CREATE POLICY credential_reads ON public.extension_credentials FOR SELECT TO authenticated
  USING(owner_id=auth.uid() AND public.get_current_role() IN ('recruiter','technical_recruiter','super_admin'));

DROP POLICY IF EXISTS job_reads ON public.jobs;
CREATE POLICY job_reads ON public.jobs FOR SELECT TO authenticated
  USING(public.get_current_role() IN ('client','recruiter','technical_recruiter','super_admin'));

DROP POLICY IF EXISTS "Clients can view their own submissions" ON public.job_submissions;
CREATE POLICY "Clients can view their own submissions" ON public.job_submissions FOR SELECT TO authenticated
  USING(public.candidate_staff_can_access(candidate_id));
DROP POLICY IF EXISTS "Admins and Recruiters have full submission access" ON public.job_submissions;
CREATE POLICY assigned_staff_submission_access ON public.job_submissions FOR ALL TO authenticated
  USING(public.get_current_role() IN ('recruiter','technical_recruiter','super_admin') AND public.candidate_staff_can_access(candidate_id))
  WITH CHECK(public.get_current_role() IN ('recruiter','technical_recruiter','super_admin') AND public.candidate_staff_can_access(candidate_id));

DROP POLICY IF EXISTS scoped_profiles ON public.profiles;
CREATE POLICY scoped_profiles ON public.profiles FOR SELECT TO authenticated
  USING(id=auth.uid() OR public.get_current_role() IN ('recruiter','technical_recruiter','super_admin'));

DROP POLICY IF EXISTS staff_vendors ON public.vendors;
CREATE POLICY staff_vendors ON public.vendors FOR SELECT TO authenticated
  USING(public.get_current_role() IN ('recruiter','super_admin'));
DROP POLICY IF EXISTS staff_contacts ON public.vendor_contacts;
CREATE POLICY staff_contacts ON public.vendor_contacts FOR SELECT TO authenticated
  USING(public.get_current_role() IN ('recruiter','super_admin'));
DROP POLICY IF EXISTS staff_settings ON public.workspace_settings;
CREATE POLICY staff_settings ON public.workspace_settings FOR SELECT TO authenticated
  USING(public.get_current_role() IN ('recruiter','super_admin'));

CREATE OR REPLACE FUNCTION public.create_application_intent(p_actor uuid,p_candidate uuid,p_job uuid,p_submission uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.jobs; target uuid; submission uuid; matches integer; actor public.profiles; candidate public.candidates;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate;
  IF actor.id IS NULL OR actor.role NOT IN ('recruiter','technical_recruiter','super_admin') THEN RAISE EXCEPTION 'Active staff required'; END IF;
  IF candidate.id IS NULL OR actor.role='recruiter' AND candidate.assigned_recruiter_id IS DISTINCT FROM p_actor
    OR actor.role='technical_recruiter' AND candidate.assigned_technical_recruiter_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
  SELECT * INTO job FROM public.jobs WHERE id=p_job AND state<>'closed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate or job unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_candidate::text||lower(trim(job.company))||lower(trim(job.title)),0));
  SELECT id INTO target FROM public.application_intents WHERE owner_id=p_actor AND candidate_id=p_candidate AND job_id=p_job;
  IF target IS NOT NULL THEN RETURN target; END IF;
  submission:=p_submission;
  IF submission IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.job_submissions WHERE id=submission AND candidate_id=p_candidate
      AND lower(trim(company_name))=lower(trim(job.company)) AND lower(trim(job_title))=lower(trim(job.title))) THEN RAISE EXCEPTION 'Submission does not match intent'; END IF;
  ELSE
    SELECT count(*),(array_agg(id))[1] INTO matches,submission FROM public.job_submissions WHERE candidate_id=p_candidate
      AND lower(trim(company_name))=lower(trim(job.company)) AND lower(trim(job_title))=lower(trim(job.title)) AND submission_date>=current_date-30;
    IF matches>1 THEN RAISE EXCEPTION 'Several submissions match; select the correct submission'; END IF;
  END IF;
  IF submission IS NULL THEN
    INSERT INTO public.job_submissions(candidate_id,recruiter_id,company_name,job_title,job_url,job_id,status,capture_status)
      VALUES(p_candidate,p_actor,job.company,job.title,job.application_url,p_job,'Draft','started') RETURNING id INTO submission;
  ELSE UPDATE public.job_submissions SET capture_status=COALESCE(capture_status,'started'),job_id=COALESCE(job_id,p_job) WHERE id=submission;
  END IF;
  INSERT INTO public.application_intents(owner_id,candidate_id,job_id,submission_id) VALUES(p_actor,p_candidate,p_job,submission) RETURNING id INTO target;
  RETURN target;
END; $$;

CREATE OR REPLACE FUNCTION public.record_browser_event(p_actor uuid,p_intent uuid,p_key uuid,p_status text,p_attempt integer,p_source text,p_evidence text,p_url text,p_observed timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE intent public.application_intents; current_status text; next_status text; current_rank integer; observed_rank integer; actor public.profiles;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF actor.id IS NULL OR actor.role NOT IN ('recruiter','technical_recruiter','super_admin') THEN RAISE EXCEPTION 'Active staff required'; END IF;
  SELECT * INTO intent FROM public.application_intents WHERE id=p_intent AND (owner_id=p_actor OR public.candidate_staff_can_access(candidate_id)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intent access denied'; END IF;
  SELECT capture_status INTO current_status FROM public.job_submissions WHERE id=intent.submission_id FOR UPDATE;
  INSERT INTO public.browser_capture_events(intent_id,event_key,status,attempt,source,evidence,url,observed_at)
    VALUES(p_intent,p_key,p_status,p_attempt,p_source,p_evidence,p_url,p_observed) ON CONFLICT(intent_id,event_key) DO NOTHING;
  IF NOT FOUND THEN RETURN current_status; END IF;
  next_status:=current_status;
  IF current_status NOT IN ('submitted','confirmed') AND p_attempt>=intent.attempt THEN
    current_rank:=CASE current_status WHEN 'in_progress' THEN 1 WHEN 'submit_attempted' THEN 2 ELSE 0 END;
    observed_rank:=CASE p_status WHEN 'in_progress' THEN 1 WHEN 'submit_attempted' THEN 2 WHEN 'submitted' THEN 3 ELSE -1 END;
    IF p_attempt>intent.attempt OR p_status='failed' OR observed_rank>=current_rank THEN next_status:=p_status; END IF;
  END IF;
  UPDATE public.application_intents SET attempt=GREATEST(attempt,p_attempt) WHERE id=p_intent;
  UPDATE public.job_submissions SET capture_status=next_status,
    status=CASE WHEN next_status IN ('submitted','confirmed') AND status='Draft' THEN 'Applied'::public.submission_status ELSE status END
    WHERE id=intent.submission_id;
  RETURN next_status;
END; $$;

CREATE OR REPLACE FUNCTION public.pair_extension(p_code text,p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE code public.extension_pair_codes; target uuid;
BEGIN
  SELECT * INTO code FROM public.extension_pair_codes
    WHERE code_hash=encode(digest(p_code,'sha256'),'hex') AND used_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=code.owner_id AND status='active'
    AND role IN ('recruiter','technical_recruiter','super_admin')) THEN RAISE EXCEPTION 'Pairing code expired or invalid'; END IF;
  UPDATE public.extension_pair_codes SET used_at=now() WHERE id=code.id;
  INSERT INTO public.extension_credentials(owner_id,token_hash) VALUES(code.owner_id,p_token) RETURNING id INTO target;
  RETURN target;
END; $$;

GRANT SELECT ON public.candidate_staff_assignments TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.candidate_staff_assignments FROM anon,authenticated;
GRANT ALL ON public.candidate_staff_assignments TO service_role;
REVOKE ALL ON FUNCTION public.set_candidate_staff_assignment(uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_candidate_staff_assignment(uuid,uuid,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_application_intent(uuid,uuid,uuid,uuid),public.record_browser_event(uuid,uuid,uuid,text,integer,text,text,text,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.pair_extension(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pair_extension(text,text) TO service_role;

COMMIT;
