-- Recruiting operations update, generated from ordered source migrations.
-- Requires the existing 2026-10-06 / 2026-10-08 / 2026-10-09 schema.
-- Use ONLY when none of migrations 20261011000100 through 20261011001100
-- or 202610120001_submission_actor_integrity have been applied.
-- Preserve individual BEGIN/COMMIT blocks; the enum migration must commit first.
-- Do not wrap in an outer transaction or run the same migrations twice.

-- Source: 20261011000100_add_technical_recruiter_status_values.sql
BEGIN;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'technical_recruiter';
ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'rejected';

COMMIT;

-- Source: 20261011000200_staff_roles_and_assignments.sql
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

-- Source: 20261011000300_application_answer_snapshots.sql
BEGIN;

ALTER TABLE public.job_submissions ADD COLUMN IF NOT EXISTS technical_recruiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.candidate_actor_can_access(p_actor uuid,p_candidate uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles actor JOIN public.candidates candidate ON candidate.id=p_candidate
    WHERE actor.id=p_actor AND actor.status='active' AND (
      actor.role='super_admin' OR actor.role='client' AND candidate.user_id=actor.id
      OR actor.role='recruiter' AND candidate.assigned_recruiter_id=actor.id
      OR actor.role='technical_recruiter' AND candidate.assigned_technical_recruiter_id=actor.id))
$$;
REVOKE ALL ON FUNCTION public.candidate_actor_can_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_actor_can_access(uuid,uuid) TO service_role;

DROP POLICY IF EXISTS intent_reads ON public.application_intents;
CREATE POLICY intent_reads ON public.application_intents FOR SELECT TO authenticated
  USING(public.candidate_staff_can_access(candidate_id));
DROP POLICY IF EXISTS event_reads ON public.browser_capture_events;
CREATE POLICY event_reads ON public.browser_capture_events FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.application_intents i WHERE i.id=intent_id AND public.candidate_staff_can_access(i.candidate_id)));

CREATE OR REPLACE FUNCTION public.record_browser_event(p_actor uuid,p_intent uuid,p_key uuid,p_status text,p_attempt integer,p_source text,p_evidence text,p_url text,p_observed timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE intent public.application_intents; current_status text; next_status text; current_rank integer; observed_rank integer; actor public.profiles;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF actor.id IS NULL OR actor.role NOT IN ('recruiter','technical_recruiter','super_admin','client') THEN RAISE EXCEPTION 'Active account required'; END IF;
  SELECT * INTO intent FROM public.application_intents WHERE id=p_intent AND public.candidate_actor_can_access(p_actor,candidate_id) FOR UPDATE;
  IF NOT FOUND OR intent.owner_id<>p_actor THEN RAISE EXCEPTION 'Intent access denied'; END IF;
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
    status=CASE WHEN next_status IN ('submitted','confirmed') AND status='Draft' THEN 'Applied'::public.submission_status ELSE status END WHERE id=intent.submission_id;
  RETURN next_status;
END; $$;

CREATE TABLE IF NOT EXISTS public.application_answer_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid REFERENCES public.application_intents(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.job_submissions(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  attempt integer NOT NULL CHECK(attempt >= 1),
  event_key uuid NOT NULL,
  revision integer NOT NULL CHECK(revision >= 1),
  portal text NOT NULL CHECK(length(portal) <= 100),
  portal_url text NOT NULL CHECK(length(portal_url) <= 2000),
  profile_version integer,
  answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='array' AND jsonb_array_length(answers)<=100),
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id,attempt,event_key),
  CHECK(intent_id IS NOT NULL OR submission_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS answer_snapshots_candidate_submission ON public.application_answer_snapshots(candidate_id,submission_id,created_at DESC);
ALTER TABLE public.application_answer_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS answer_snapshot_reads ON public.application_answer_snapshots;
CREATE POLICY answer_snapshot_reads ON public.application_answer_snapshots FOR SELECT TO authenticated
  USING(public.candidate_staff_can_access(candidate_id));
REVOKE ALL ON public.application_answer_snapshots FROM anon,authenticated;
GRANT SELECT ON public.application_answer_snapshots TO authenticated;
GRANT ALL ON public.application_answer_snapshots TO service_role;

CREATE TABLE IF NOT EXISTS public.extension_submission_events (
  event_key uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id),
  submission_id uuid NOT NULL REFERENCES public.job_submissions(id),
  attempt integer NOT NULL CHECK(attempt>=1),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.extension_submission_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.extension_submission_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.extension_submission_events TO service_role;

CREATE OR REPLACE FUNCTION public.save_application_answer_snapshot(
  p_actor uuid,p_intent uuid,p_submission uuid,p_candidate uuid,p_attempt integer,p_event_key uuid,
  p_portal text,p_url text,p_profile_version integer,p_answers jsonb,p_observed_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.application_answer_snapshots; next_revision integer; saved public.application_answer_snapshots; actor public.profiles;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF actor.id IS NULL OR p_attempt<1 OR jsonb_typeof(p_answers)<>'array' OR jsonb_array_length(p_answers)>100 THEN RAISE EXCEPTION 'Invalid answer snapshot'; END IF;
  IF NOT public.candidate_actor_can_access(p_actor,p_candidate) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
  IF p_intent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.application_intents i WHERE i.id=p_intent AND i.candidate_id=p_candidate AND i.submission_id=p_submission) THEN RAISE EXCEPTION 'Application intent mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.job_submissions s WHERE s.id=p_submission AND s.candidate_id=p_candidate) THEN RAISE EXCEPTION 'Submission mismatch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_submission::text||':'||p_attempt::text,0));
  SELECT * INTO prior FROM public.application_answer_snapshots WHERE submission_id=p_submission AND attempt=p_attempt AND event_key=p_event_key;
  IF FOUND THEN RETURN jsonb_build_object('id',prior.id,'revision',prior.revision,'answers',prior.answers); END IF;
  SELECT COALESCE(max(revision),0)+1 INTO next_revision FROM public.application_answer_snapshots WHERE submission_id=p_submission AND attempt=p_attempt;
  INSERT INTO public.application_answer_snapshots(intent_id,submission_id,candidate_id,actor_id,attempt,event_key,revision,portal,portal_url,profile_version,answers,observed_at)
  VALUES(p_intent,p_submission,p_candidate,p_actor,p_attempt,p_event_key,left(p_portal,100),left(p_url,2000),p_profile_version,p_answers,p_observed_at)
  RETURNING * INTO saved;
  RETURN jsonb_build_object('id',saved.id,'revision',saved.revision,'answers',saved.answers);
END; $$;

CREATE OR REPLACE FUNCTION public.record_extension_submission(p_actor uuid,p_candidate uuid,p_event_key uuid,p_attempt integer,p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; candidate public.candidates; existing public.extension_submission_events; submission public.job_submissions; company text; title text; today date; duplicate boolean;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate;
  IF actor.id IS NULL OR candidate.id IS NULL OR p_attempt<1 THEN RAISE EXCEPTION 'Active account and candidate required'; END IF;
  IF NOT public.candidate_actor_can_access(p_actor,p_candidate) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
  company:=left(trim(COALESCE(p_fields->>'companyName','')),200); title:=left(trim(COALESCE(p_fields->>'jobTitle','')),200);
  IF company='' OR title='' THEN RAISE EXCEPTION 'Company and job title are required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_key::text,0));
  SELECT * INTO existing FROM public.extension_submission_events WHERE event_key=p_event_key;
  IF FOUND THEN
    IF existing.actor_id<>p_actor OR existing.candidate_id<>p_candidate THEN RAISE EXCEPTION 'Submission event key conflict'; END IF;
    SELECT * INTO submission FROM public.job_submissions WHERE id=existing.submission_id;
    RETURN jsonb_build_object('submission',to_jsonb(submission),'duplicate',submission.duplicate_flag,'replayed',true);
  END IF;
  today:=current_date;
  SELECT EXISTS(SELECT 1 FROM public.job_submissions WHERE candidate_id=p_candidate AND lower(trim(company_name))=lower(company) AND submission_date>=today-30) INTO duplicate;
  INSERT INTO public.job_submissions(candidate_id,recruiter_id,technical_recruiter_id,company_name,job_title,job_url,portal_source,job_location,status,capture_status,duplicate_flag,submission_date,notes)
  VALUES(p_candidate,CASE WHEN actor.role IN('recruiter','super_admin') THEN p_actor END,CASE WHEN actor.role='technical_recruiter' THEN p_actor END,
    company,title,NULLIF(left(COALESCE(p_fields->>'jobUrl',''),2000),''),NULLIF(left(COALESCE(p_fields->>'portalSource','Browser Extension'),100),''),
    NULLIF(left(COALESCE(p_fields->>'jobLocation',''),200),''),'Applied','submitted',duplicate,today,
    NULLIF(left(COALESCE(p_fields->>'notes',p_fields->>'evidence','Auto-captured via browser extension'),1000),'')) RETURNING * INTO submission;
  INSERT INTO public.extension_submission_events(event_key,actor_id,candidate_id,submission_id,attempt) VALUES(p_event_key,p_actor,p_candidate,submission.id,p_attempt);
  RETURN jsonb_build_object('submission',to_jsonb(submission),'duplicate',duplicate,'replayed',false);
END; $$;

REVOKE ALL ON FUNCTION public.save_application_answer_snapshot(uuid,uuid,uuid,uuid,integer,uuid,text,text,integer,jsonb,timestamptz),public.record_extension_submission(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_browser_event(uuid,uuid,uuid,text,integer,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_application_answer_snapshot(uuid,uuid,uuid,uuid,integer,uuid,text,text,integer,jsonb,timestamptz),public.record_extension_submission(uuid,uuid,uuid,integer,jsonb),public.record_browser_event(uuid,uuid,uuid,text,integer,text,text,text,timestamptz) TO service_role;

COMMIT;

-- Source: 20261011000400_placement_payroll.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_employments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  hire_date date NOT NULL,
  end_date date,
  partial_period_rule text NOT NULL CHECK(partial_period_rule IN ('manual','fixed_monthly')),
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(end_date IS NULL OR end_date>=hire_date)
);
CREATE TABLE IF NOT EXISTS public.staff_compensation_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employment_id uuid NOT NULL REFERENCES public.staff_employments(id) ON DELETE CASCADE,
  monthly_amount numeric(14,2) NOT NULL CHECK(monthly_amount>=0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  effective_from date NOT NULL,
  effective_to date,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(effective_to IS NULL OR effective_to>=effective_from),
  UNIQUE(employment_id,effective_from)
);
CREATE TABLE IF NOT EXISTS public.staff_salary_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employment_id uuid NOT NULL REFERENCES public.staff_employments(id) ON DELETE CASCADE,
  period_index integer NOT NULL CHECK(period_index>=0),
  start_date date NOT NULL,
  end_date_exclusive date NOT NULL,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK(amount>=0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'accruing' CHECK(status IN ('awaiting_adjustment','accruing','due','partially_paid','paid','overdue')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employment_id,period_index),
  CHECK(end_date_exclusive>start_date),
  CHECK(due_date>=start_date)
);

CREATE TABLE IF NOT EXISTS public.placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE RESTRICT,
  submission_id uuid REFERENCES public.job_submissions(id) ON DELETE SET NULL,
  company text NOT NULL CHECK(length(trim(company)) BETWEEN 1 AND 200),
  role_title text NOT NULL CHECK(length(trim(role_title)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'offer_accepted' CHECK(status IN ('offer_accepted','joining_scheduled','active','completed','ended_early','cancelled')),
  recruiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  technical_recruiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  planned_start_date date,
  actual_join_date date,
  expected_end_date date,
  actual_end_date date,
  candidate_monthly_amount numeric(14,2) CHECK(candidate_monthly_amount IS NULL OR candidate_monthly_amount>=0),
  candidate_currency char(3) CHECK(candidate_currency IS NULL OR candidate_currency ~ '^[A-Z]{3}$'),
  candidate_compensation_visible boolean NOT NULL DEFAULT false,
  commission_amount numeric(14,2) CHECK(commission_amount IS NULL OR commission_amount>=0),
  commission_currency char(3) CHECK(commission_currency IS NULL OR commission_currency ~ '^[A-Z]{3}$'),
  commission_milestone text NOT NULL DEFAULT 'candidate_joining' CHECK(commission_milestone IN ('candidate_joining','placement_active')),
  commission_due_days integer NOT NULL DEFAULT 0 CHECK(commission_due_days BETWEEN 0 AND 365),
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expected_end_date IS NULL OR actual_join_date IS NULL OR expected_end_date>=actual_join_date),
  CHECK(actual_end_date IS NULL OR actual_join_date IS NULL OR actual_end_date>=actual_join_date)
);
CREATE INDEX IF NOT EXISTS placements_candidate_dates ON public.placements(candidate_id,actual_join_date DESC);

CREATE TABLE IF NOT EXISTS public.placement_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES public.placements(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  covered_start date NOT NULL,
  covered_end date NOT NULL,
  agreed_amount numeric(14,2) CHECK(agreed_amount IS NULL OR agreed_amount>=0),
  currency char(3) CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','active','completed','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(placement_id,month_start),
  CHECK(covered_end>=covered_start),
  CHECK(extract(day FROM month_start)=1)
);

CREATE TABLE IF NOT EXISTS public.technical_recruiter_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES public.placements(id) ON DELETE RESTRICT,
  technical_recruiter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  milestone text NOT NULL CHECK(milestone IN ('candidate_joining','placement_active')),
  amount numeric(14,2) NOT NULL CHECK(amount>=0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  due_date date,
  status text NOT NULL DEFAULT 'awaiting_eligibility' CHECK(status IN ('awaiting_eligibility','awaiting_approval','approved','rejected','partially_paid','paid')),
  eligible_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(placement_id,technical_recruiter_id,milestone)
);

CREATE TABLE IF NOT EXISTS public.external_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  salary_period_id uuid REFERENCES public.staff_salary_periods(id) ON DELETE RESTRICT,
  commission_id uuid REFERENCES public.technical_recruiter_commissions(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK(amount<>0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  paid_on date NOT NULL,
  method text NOT NULL CHECK(length(trim(method)) BETWEEN 1 AND 100),
  external_reference text,
  notes text,
  correction_of uuid REFERENCES public.external_payments(id) ON DELETE RESTRICT,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((salary_period_id IS NOT NULL)::integer+(commission_id IS NOT NULL)::integer=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS external_payment_reference_unique ON public.external_payments(lower(external_reference)) WHERE external_reference IS NOT NULL AND correction_of IS NULL;
CREATE INDEX IF NOT EXISTS external_payment_salary_period ON public.external_payments(salary_period_id);
CREATE INDEX IF NOT EXISTS external_payment_commission ON public.external_payments(commission_id);

ALTER TABLE public.staff_employments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_compensation_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_salary_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_recruiter_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_payments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.placement_profile_can_read(p_candidate uuid,p_recruiter uuid,p_technical uuid,p_visible boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.candidates c ON c.id=p_candidate WHERE p.id=auth.uid() AND p.status='active' AND (
   p.role='super_admin' OR p.role='client' AND c.user_id=p.id AND p_visible
   OR p.role='recruiter' AND c.assigned_recruiter_id=p.id AND c.id=p_candidate
   OR p.role='technical_recruiter' AND c.assigned_technical_recruiter_id=p.id AND c.id=p_candidate))
$$;
CREATE POLICY staff_employment_reads ON public.staff_employments FOR SELECT TO authenticated
 USING(profile_id=auth.uid() AND public.get_current_role() IN ('recruiter','technical_recruiter') OR public.get_current_role()='super_admin');
CREATE POLICY staff_terms_reads ON public.staff_compensation_terms FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.staff_employments e WHERE e.id=employment_id AND (e.profile_id=auth.uid() AND public.get_current_role() IN ('recruiter','technical_recruiter') OR public.get_current_role()='super_admin')));
CREATE POLICY staff_salary_period_reads ON public.staff_salary_periods FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.staff_employments e WHERE e.id=employment_id AND (e.profile_id=auth.uid() AND public.get_current_role() IN ('recruiter','technical_recruiter') OR public.get_current_role()='super_admin')));
CREATE POLICY placement_reads ON public.placements FOR SELECT TO authenticated
 USING(public.placement_profile_can_read(candidate_id,recruiter_id,technical_recruiter_id,candidate_compensation_visible));
CREATE POLICY placement_month_reads ON public.placement_months FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.placements p WHERE p.id=placement_id AND public.placement_profile_can_read(p.candidate_id,p.recruiter_id,p.technical_recruiter_id,p.candidate_compensation_visible)));
CREATE POLICY commission_reads ON public.technical_recruiter_commissions FOR SELECT TO authenticated
 USING(technical_recruiter_id=auth.uid() AND public.get_current_role()='technical_recruiter' OR public.get_current_role()='super_admin');
CREATE POLICY external_payment_reads ON public.external_payments FOR SELECT TO authenticated
 USING(payee_profile_id=auth.uid() AND public.get_current_role() IN ('recruiter','technical_recruiter') OR public.get_current_role()='super_admin');
REVOKE INSERT,UPDATE,DELETE ON public.staff_employments,public.staff_compensation_terms,public.staff_salary_periods,public.placements,public.placement_months,public.technical_recruiter_commissions,public.external_payments FROM anon,authenticated;
GRANT SELECT ON public.staff_employments,public.staff_compensation_terms,public.staff_salary_periods,public.placements,public.placement_months,public.technical_recruiter_commissions,public.external_payments TO authenticated;
GRANT ALL ON public.staff_employments,public.staff_compensation_terms,public.staff_salary_periods,public.placements,public.placement_months,public.technical_recruiter_commissions,public.external_payments TO service_role;
-- Placement financial columns have candidate-specific visibility, which row-level policies cannot enforce column by column.
-- Route these reads through the role-checked API, which removes hidden compensation and other recruiters' commission data.
REVOKE SELECT ON public.placements,public.placement_months FROM authenticated;

CREATE OR REPLACE FUNCTION public.record_external_payment(
  p_actor uuid,p_salary_period uuid,p_commission uuid,p_amount numeric,p_currency text,p_paid_on date,
  p_method text,p_reference text,p_notes text,p_correction uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; period public.staff_salary_periods; commission public.technical_recruiter_commissions;
  original public.external_payments; payee uuid; expected_currency text; due numeric; paid numeric; payment public.external_payments; today date;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  IF (p_salary_period IS NULL)=(p_commission IS NULL) OR p_amount=0 OR length(trim(p_method))=0 THEN RAISE EXCEPTION 'Invalid payment record'; END IF;
  IF p_salary_period IS NOT NULL THEN
    SELECT * INTO period FROM public.staff_salary_periods WHERE id=p_salary_period FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Salary period not found'; END IF;
    SELECT profile_id INTO payee FROM public.staff_employments WHERE id=period.employment_id;
    expected_currency:=trim(period.currency);due:=period.amount;
    IF period.status='awaiting_adjustment' THEN RAISE EXCEPTION 'Set the manual salary period amount before recording payment'; END IF;
  ELSE
    SELECT * INTO commission FROM public.technical_recruiter_commissions WHERE id=p_commission FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found'; END IF;
    IF commission.status NOT IN ('approved','partially_paid') AND p_correction IS NULL THEN RAISE EXCEPTION 'Commission approval is required before payment'; END IF;
    payee:=commission.technical_recruiter_id;expected_currency:=trim(commission.currency);due:=commission.amount;
  END IF;
  IF p_currency<>expected_currency THEN RAISE EXCEPTION 'Payment currency mismatch'; END IF;
  IF p_correction IS NULL THEN
    IF p_amount<0 THEN RAISE EXCEPTION 'Negative payments must reference the payment being corrected'; END IF;
    IF p_salary_period IS NOT NULL THEN SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE salary_period_id=p_salary_period;
    ELSE SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE commission_id=p_commission; END IF;
    IF p_amount>due-paid THEN RAISE EXCEPTION 'Payment exceeds the outstanding balance'; END IF;
  ELSE
    IF p_amount>=0 OR p_reason IS NULL OR length(trim(p_reason))=0 THEN RAISE EXCEPTION 'A payment correction needs a negative amount and a reason'; END IF;
    SELECT * INTO original FROM public.external_payments WHERE id=p_correction FOR UPDATE;
    IF NOT FOUND OR original.payee_profile_id<>payee OR original.salary_period_id IS DISTINCT FROM p_salary_period OR original.commission_id IS DISTINCT FROM p_commission OR original.correction_of IS NOT NULL THEN
      RAISE EXCEPTION 'Correction must reference a payment on the same earning record';
    END IF;
    SELECT original.amount+COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE correction_of=p_correction;
    IF abs(p_amount)>paid THEN RAISE EXCEPTION 'Correction exceeds the remaining original payment'; END IF;
  END IF;
  INSERT INTO public.external_payments(payee_profile_id,salary_period_id,commission_id,amount,currency,paid_on,method,external_reference,notes,correction_of,recorded_by)
    VALUES(payee,p_salary_period,p_commission,p_amount,p_currency,p_paid_on,trim(p_method),NULLIF(trim(p_reference),''),p_notes,p_correction,p_actor) RETURNING * INTO payment;
  IF p_salary_period IS NOT NULL THEN
    SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE salary_period_id=p_salary_period;
    today:=current_date;
    UPDATE public.staff_salary_periods SET status=CASE WHEN due-paid<=0 THEN 'paid' WHEN paid>0 THEN 'partially_paid' WHEN due_date<today THEN 'overdue' WHEN due_date<=today THEN 'due' ELSE 'accruing' END WHERE id=p_salary_period;
  ELSE
    SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE commission_id=p_commission;
    UPDATE public.technical_recruiter_commissions SET status=CASE WHEN due-paid<=0 THEN 'paid' WHEN paid>0 THEN 'partially_paid' ELSE 'approved' END WHERE id=p_commission;
  END IF;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata)
    VALUES(p_actor,CASE WHEN p_correction IS NULL THEN 'external_payment_recorded' ELSE 'external_payment_corrected' END,payment.id,
      jsonb_build_object('payee_profile_id',payee,'salary_period_id',p_salary_period,'commission_id',p_commission,'amount',p_amount,'currency',p_currency,'paid_on',p_paid_on,'reason',p_reason));
  RETURN jsonb_build_object('id',payment.id,'payee_profile_id',payee,'balance',due-paid,'currency',expected_currency);
END; $$;
REVOKE ALL ON FUNCTION public.record_external_payment(uuid,uuid,uuid,numeric,text,date,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_external_payment(uuid,uuid,uuid,numeric,text,date,text,text,text,uuid,text) TO service_role;

COMMIT;

-- Source: 20261011000500_payroll_dashboard_metrics.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.save_recruiting_artifact(p_task uuid,p_lease uuid,p_candidate uuid,p_job uuid,p_cv integer,p_jv integer,p_data jsonb,p_model text,p_packet boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate public.candidates; job public.jobs; task public.background_tasks; target uuid; submission uuid; actor public.profiles;
BEGIN
  PERFORM public.check_task_lease(p_task,p_lease);
  SELECT * INTO task FROM public.background_tasks WHERE id=p_task;
  SELECT * INTO actor FROM public.profiles WHERE id=task.actor_id AND status='active';
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate FOR UPDATE;
  SELECT * INTO job FROM public.jobs WHERE id=p_job FOR UPDATE;
  IF actor.id IS NULL OR candidate.version IS DISTINCT FROM p_cv OR job.version IS DISTINCT FROM p_jv OR candidate.provenance_status<>'confirmed' OR job.state='closed' THEN
    RAISE EXCEPTION 'Candidate or job changed; review and retry';
  END IF;
  IF task.payload->>'candidateId'<>p_candidate::text OR task.payload->>'jobId'<>p_job::text OR NOT public.candidate_actor_can_access(task.actor_id,p_candidate) THEN
    RAISE EXCEPTION 'Artifact access denied';
  END IF;
  IF p_packet THEN
    IF task.kind<>'packet_generate' OR actor.role NOT IN ('recruiter','technical_recruiter','super_admin') THEN RAISE EXCEPTION 'Packet access denied'; END IF;
    SELECT id INTO target FROM public.submission_packets WHERE task_id=p_task;
    IF target IS NOT NULL THEN RETURN target; END IF;
    INSERT INTO public.job_submissions(candidate_id,recruiter_id,technical_recruiter_id,company_name,job_title,job_url,job_id,status,notes)
      VALUES(p_candidate,CASE WHEN actor.role IN('recruiter','super_admin') THEN task.actor_id END,
        CASE WHEN actor.role='technical_recruiter' THEN task.actor_id END,job.company,job.title,job.application_url,p_job,'Draft','Draft prepared; no external application submitted.') RETURNING id INTO submission;
    INSERT INTO public.submission_packets(candidate_id,job_id,candidate_version,job_version,data,submission_id,task_id)
      VALUES(p_candidate,p_job,p_cv,p_jv,p_data,submission,p_task) RETURNING id INTO target;
  ELSE
    IF task.kind<>'candidate_match' THEN RAISE EXCEPTION 'Invalid match task'; END IF;
    INSERT INTO public.candidate_matches(candidate_id,job_id,candidate_version,job_version,data,model)
      VALUES(p_candidate,p_job,p_cv,p_jv,p_data,p_model)
      ON CONFLICT(candidate_id,job_id,candidate_version,job_version,prompt_version) DO UPDATE SET data=candidate_matches.data RETURNING id INTO target;
  END IF;
  RETURN target;
END; $$;

CREATE OR REPLACE FUNCTION public.workspace_metrics(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Account access denied'; END IF;
  SELECT jsonb_build_object(
    'candidates',(SELECT count(*) FROM public.candidates c WHERE public.candidate_actor_can_access(p_actor,c.id)),
    'submissions',(SELECT count(*) FROM public.job_submissions s WHERE public.candidate_actor_can_access(p_actor,s.candidate_id)),
    'confirmed',(SELECT count(*) FROM public.job_submissions s WHERE s.capture_status='confirmed' AND public.candidate_actor_can_access(p_actor,s.candidate_id)),
    'contractJobs',(SELECT count(*) FROM public.jobs WHERE state<>'closed' AND employment_type='contract'),
    'vendors',CASE WHEN actor.role IN('recruiter','super_admin') THEN (SELECT count(*) FROM public.vendors) ELSE NULL END,
    'activity',COALESCE((SELECT jsonb_agg(row_to_json(activity)) FROM (
      SELECT s.submission_date::text AS date,count(*) AS submissions FROM public.job_submissions s
      WHERE s.submission_date>=current_date-30 AND public.candidate_actor_can_access(p_actor,s.candidate_id)
      GROUP BY s.submission_date ORDER BY s.submission_date) activity),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END; $$;

COMMIT;

-- Source: 20261011000600_payroll_history_and_adjustments.sql
BEGIN;

ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Keep trusted candidate writes valid for both individual JWT claims and JSON claims.
CREATE OR REPLACE FUNCTION public.guard_candidate_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role',true)='service_role'
    OR COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' THEN RETURN NEW; END IF;
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

ALTER TABLE public.staff_salary_periods DROP CONSTRAINT staff_salary_periods_status_check;
ALTER TABLE public.staff_salary_periods ADD CONSTRAINT staff_salary_periods_status_check
  CHECK(status IN ('awaiting_adjustment','accruing','due','partially_paid','paid','overdue','cancelled'));
ALTER TABLE public.staff_salary_periods ADD COLUMN compensation_term_id uuid REFERENCES public.staff_compensation_terms(id);
ALTER TABLE public.staff_salary_periods ADD COLUMN monthly_amount numeric(14,2) CHECK(monthly_amount>=0);
ALTER TABLE public.staff_salary_periods ADD COLUMN adjusted_at timestamptz;
ALTER TABLE public.staff_salary_periods ADD COLUMN adjusted_by uuid REFERENCES public.profiles(id);
UPDATE public.staff_salary_periods p SET compensation_term_id=t.id,monthly_amount=t.monthly_amount
FROM public.staff_compensation_terms t WHERE t.employment_id=p.employment_id AND t.effective_from<=p.start_date
  AND (t.effective_to IS NULL OR t.effective_to>=p.start_date);

CREATE OR REPLACE FUNCTION public.sync_staff_salary_periods(p_employment uuid,p_through date DEFAULT (current_date+interval '2 months')::date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE employment public.staff_employments; term public.staff_compensation_terms; existing public.staff_salary_periods;
  month_date date; start_day date; next_month date; finish_day date; full_finish date; i integer;
  anchor integer; partial boolean; paid numeric;
BEGIN
  SELECT * INTO employment FROM public.staff_employments WHERE id=p_employment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employment not found'; END IF;
  anchor:=extract(day FROM employment.hire_date)::integer;
  IF employment.end_date IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.staff_salary_periods p JOIN public.external_payments x ON x.salary_period_id=p.id
      WHERE p.employment_id=p_employment AND p.start_date>employment.end_date GROUP BY p.id HAVING sum(x.amount)>0) THEN
      RAISE EXCEPTION 'Correct payments on periods after the employment end date first';
    END IF;
    UPDATE public.staff_salary_periods SET status='cancelled' WHERE employment_id=p_employment AND start_date>employment.end_date;
  END IF;
  FOR i IN 0..359 LOOP
    month_date:=(date_trunc('month',employment.hire_date)+make_interval(months=>i))::date;
    start_day:=month_date+least(anchor,extract(day FROM month_date+interval '1 month - 1 day')::integer)-1;
    EXIT WHEN start_day>p_through OR (employment.end_date IS NOT NULL AND start_day>employment.end_date);
    next_month:=(month_date+interval '1 month')::date;
    full_finish:=next_month+least(anchor,extract(day FROM next_month+interval '1 month - 1 day')::integer)-1;
    finish_day:=least(full_finish,COALESCE(employment.end_date+1,full_finish));
    partial:=finish_day<full_finish;
    SELECT * INTO existing FROM public.staff_salary_periods WHERE employment_id=p_employment AND period_index=i FOR UPDATE;
    IF FOUND THEN
      -- Never resnapshot salary terms or erase an explicit final-period adjustment on a read/refresh.
      IF existing.start_date IS DISTINCT FROM start_day THEN RAISE EXCEPTION 'Joining date cannot change after salary periods exist'; END IF;
      IF existing.end_date_exclusive IS DISTINCT FROM finish_day OR existing.status='cancelled' THEN
        SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE salary_period_id=existing.id;
        IF paid>0 THEN RAISE EXCEPTION 'Correct payments before changing the covered salary dates'; END IF;
        UPDATE public.staff_salary_periods SET end_date_exclusive=finish_day,due_date=finish_day,
          amount=CASE WHEN partial AND employment.partial_period_rule='manual' THEN 0 ELSE COALESCE(existing.monthly_amount,existing.amount) END,
          status=CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'awaiting_adjustment' ELSE 'accruing' END,
          adjusted_at=NULL,adjusted_by=NULL,notes=CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'Manual amount required for final partial salary period.' ELSE NULL END
          WHERE id=existing.id;
      END IF;
    ELSE
      SELECT * INTO term FROM public.staff_compensation_terms WHERE employment_id=p_employment AND effective_from<=start_day
        AND (effective_to IS NULL OR effective_to>=start_day) ORDER BY effective_from DESC LIMIT 1;
      IF FOUND THEN
        INSERT INTO public.staff_salary_periods(employment_id,period_index,start_date,end_date_exclusive,due_date,amount,monthly_amount,currency,status,compensation_term_id,notes)
          VALUES(p_employment,i,start_day,finish_day,finish_day,CASE WHEN partial AND employment.partial_period_rule='manual' THEN 0 ELSE term.monthly_amount END,
            term.monthly_amount,term.currency,CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'awaiting_adjustment' ELSE 'accruing' END,
            term.id,CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'Manual amount required for final partial salary period.' ELSE NULL END);
      END IF;
    END IF;
  END LOOP;
  UPDATE public.staff_salary_periods p SET status=CASE WHEN p.amount-COALESCE((SELECT sum(x.amount) FROM public.external_payments x WHERE x.salary_period_id=p.id),0)<=0 THEN 'paid'
    WHEN COALESCE((SELECT sum(x.amount) FROM public.external_payments x WHERE x.salary_period_id=p.id),0)>0 THEN 'partially_paid'
    WHEN p.due_date<current_date THEN 'overdue' WHEN p.due_date=current_date THEN 'due' ELSE 'accruing' END
    WHERE p.employment_id=p_employment AND p.status NOT IN ('awaiting_adjustment','cancelled');
END; $$;

CREATE OR REPLACE FUNCTION public.save_staff_employment(p_actor uuid,p_profile uuid,p_hire date,p_end date,p_partial_rule text,p_amount numeric,p_currency text,p_effective date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE employment public.staff_employments; prior public.staff_employments; term public.staff_compensation_terms; next_effective date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=p_profile AND role IN ('recruiter','technical_recruiter') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a recruiter or technical recruiter'; END IF;
  IF p_amount IS NULL OR p_amount<0 OR p_amount<>round(p_amount,2) OR p_currency !~ '^[A-Z]{3}$'
    OR p_hire IS NULL OR p_effective IS NULL OR p_effective<p_hire OR (p_end IS NOT NULL AND (p_end<p_hire OR p_effective>p_end))
    OR p_partial_rule NOT IN ('manual','fixed_monthly') THEN RAISE EXCEPTION 'Invalid employment dates or salary terms'; END IF;
  SELECT * INTO prior FROM public.staff_employments WHERE profile_id=p_profile FOR UPDATE;
  IF FOUND THEN
    IF prior.hire_date<>p_hire AND EXISTS(SELECT 1 FROM public.staff_salary_periods WHERE employment_id=prior.id) THEN
      RAISE EXCEPTION 'Joining date cannot change after salary periods exist';
    END IF;
    UPDATE public.staff_employments SET hire_date=p_hire,end_date=p_end,partial_period_rule=p_partial_rule,updated_at=now()
      WHERE id=prior.id RETURNING * INTO employment;
  ELSE
    IF p_effective<>p_hire THEN RAISE EXCEPTION 'Initial salary terms must begin on the joining date'; END IF;
    INSERT INTO public.staff_employments(profile_id,hire_date,end_date,partial_period_rule,created_by)
      VALUES(p_profile,p_hire,p_end,p_partial_rule,p_actor) RETURNING * INTO employment;
  END IF;
  SELECT * INTO term FROM public.staff_compensation_terms WHERE employment_id=employment.id AND effective_from=p_effective;
  IF FOUND THEN
    IF term.monthly_amount<>p_amount OR trim(term.currency)<>p_currency THEN
      RAISE EXCEPTION 'Existing compensation terms are immutable; record a new effective date';
    END IF;
  ELSE
    SELECT min(effective_from) INTO next_effective FROM public.staff_compensation_terms WHERE employment_id=employment.id AND effective_from>p_effective;
    UPDATE public.staff_compensation_terms SET effective_to=p_effective-1 WHERE employment_id=employment.id
      AND effective_from<p_effective AND (effective_to IS NULL OR effective_to>=p_effective);
    INSERT INTO public.staff_compensation_terms(employment_id,monthly_amount,currency,effective_from,effective_to,created_by)
      VALUES(employment.id,p_amount,p_currency,p_effective,next_effective-1,p_actor);
  END IF;
  PERFORM public.sync_staff_salary_periods(employment.id);
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'staff_employment_terms_saved',employment.id,
    jsonb_build_object('before',to_jsonb(prior),'after',to_jsonb(employment),'monthly_amount',p_amount,'currency',p_currency,'effective_from',p_effective));
  RETURN to_jsonb(employment);
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_staff_salary_period(p_actor uuid,p_period uuid,p_amount numeric,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE period public.staff_salary_periods;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  SELECT * INTO period FROM public.staff_salary_periods WHERE id=p_period FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Salary period not found'; END IF;
  IF period.status<>'awaiting_adjustment' THEN RAISE EXCEPTION 'Only a period awaiting adjustment can be set'; END IF;
  IF p_amount IS NULL OR p_amount<0 OR p_amount<>round(p_amount,2) OR length(trim(COALESCE(p_reason,'')))=0 THEN RAISE EXCEPTION 'A valid final amount and adjustment reason are required'; END IF;
  UPDATE public.staff_salary_periods SET amount=p_amount,status=CASE WHEN p_amount=0 THEN 'paid' WHEN due_date<current_date THEN 'overdue' WHEN due_date=current_date THEN 'due' ELSE 'accruing' END,
    notes=p_reason,adjusted_at=now(),adjusted_by=p_actor WHERE id=p_period;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'salary_period_adjusted',p_period,
    jsonb_build_object('before_amount',period.amount,'amount',p_amount,'currency',period.currency,'reason',p_reason));
END; $$;

-- Cancellation is an employment correction, not permission to pay a non-existent period.
CREATE OR REPLACE FUNCTION public.guard_salary_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.salary_period_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.staff_salary_periods WHERE id=NEW.salary_period_id AND status='cancelled') THEN
    RAISE EXCEPTION 'Cancelled salary periods cannot receive payments';
  END IF;
  IF NEW.amount<>round(NEW.amount,2) THEN RAISE EXCEPTION 'Payment amount must use at most two decimal places'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER enforce_salary_payment BEFORE INSERT ON public.external_payments FOR EACH ROW EXECUTE FUNCTION public.guard_salary_payment();

REVOKE ALL ON FUNCTION public.sync_staff_salary_periods(uuid,date),public.save_staff_employment(uuid,uuid,date,date,text,numeric,text,date),public.adjust_staff_salary_period(uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_staff_salary_periods(uuid,date),public.save_staff_employment(uuid,uuid,date,date,text,numeric,text,date),public.adjust_staff_salary_period(uuid,uuid,numeric,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Source: 20261011000700_placement_history_and_operations.sql
BEGIN;

ALTER TABLE public.placement_months ADD COLUMN adjusted_at timestamptz;
ALTER TABLE public.placement_months ADD COLUMN adjusted_by uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.validate_placement_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.actual_join_date>current_date OR NEW.actual_end_date>current_date THEN RAISE EXCEPTION 'Actual employment dates cannot be in the future'; END IF;
  IF NEW.actual_end_date IS NOT NULL AND NEW.actual_join_date IS NULL THEN RAISE EXCEPTION 'Record actual joining before the employment end'; END IF;
  IF NEW.actual_end_date IS NOT NULL AND NEW.status NOT IN ('completed','ended_early') THEN NEW.status:='completed'; END IF;
  IF NEW.actual_join_date IS NOT NULL AND NEW.status IN ('offer_accepted','joining_scheduled') THEN NEW.status:='active'; END IF;
  IF NEW.status='active' AND (NEW.actual_join_date IS NULL OR NEW.actual_end_date IS NOT NULL) THEN RAISE EXCEPTION 'Active placement requires actual joining and no actual end date'; END IF;
  IF NEW.status IN ('completed','ended_early') AND NEW.actual_end_date IS NULL THEN RAISE EXCEPTION 'Completed placement requires an actual end date'; END IF;
  IF NEW.status='cancelled' AND NEW.actual_join_date IS NOT NULL THEN RAISE EXCEPTION 'A joined placement must be ended instead of cancelled'; END IF;
  IF NEW.candidate_monthly_amount IS NOT NULL AND NEW.candidate_currency IS NULL THEN RAISE EXCEPTION 'Candidate compensation requires a currency'; END IF;
  IF NEW.commission_amount IS NOT NULL AND (NEW.commission_currency IS NULL OR NEW.technical_recruiter_id IS NULL) THEN RAISE EXCEPTION 'Commission requires a credited technical recruiter and currency'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER enforce_placement_lifecycle BEFORE INSERT OR UPDATE ON public.placements FOR EACH ROW EXECUTE FUNCTION public.validate_placement_lifecycle();

CREATE OR REPLACE FUNCTION public.sync_placement_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE commission public.technical_recruiter_commissions; eligible boolean; milestone_date date;
BEGIN
  SELECT * INTO commission FROM public.technical_recruiter_commissions WHERE placement_id=NEW.id FOR UPDATE;
  IF FOUND THEN
    IF commission.status IN ('approved','partially_paid','paid') AND
      (NEW.commission_amount IS DISTINCT FROM OLD.commission_amount OR NEW.commission_currency IS DISTINCT FROM OLD.commission_currency
       OR NEW.technical_recruiter_id IS DISTINCT FROM OLD.technical_recruiter_id OR NEW.commission_milestone IS DISTINCT FROM OLD.commission_milestone
       OR NEW.actual_join_date IS NULL) THEN RAISE EXCEPTION 'An approved commission agreement and its credited recruiter cannot be rewritten'; END IF;
    IF NEW.technical_recruiter_id IS DISTINCT FROM commission.technical_recruiter_id OR NEW.commission_milestone<>commission.milestone THEN
      RAISE EXCEPTION 'Commission credit and milestone are preserved; record an explicit agreement correction';
    END IF;
    IF commission.status NOT IN ('awaiting_eligibility','awaiting_approval') THEN RETURN NEW; END IF;
    IF NEW.commission_amount IS NULL THEN RAISE EXCEPTION 'Keep the existing commission terms or reject the commission'; END IF;
  ELSIF NEW.commission_amount IS NULL OR NEW.technical_recruiter_id IS NULL THEN RETURN NEW;
  END IF;
  eligible:=NEW.status<>'cancelled' AND CASE NEW.commission_milestone WHEN 'candidate_joining' THEN NEW.actual_join_date IS NOT NULL ELSE NEW.status='active' END;
  milestone_date:=NEW.actual_join_date;
  IF commission.id IS NULL THEN
    INSERT INTO public.technical_recruiter_commissions(placement_id,technical_recruiter_id,milestone,amount,currency,due_date,status,eligible_at)
      VALUES(NEW.id,NEW.technical_recruiter_id,NEW.commission_milestone,NEW.commission_amount,NEW.commission_currency,
        CASE WHEN eligible THEN milestone_date+NEW.commission_due_days ELSE NULL END,
        CASE WHEN eligible THEN 'awaiting_approval' ELSE 'awaiting_eligibility' END,CASE WHEN eligible THEN now() ELSE NULL END);
  ELSE
    UPDATE public.technical_recruiter_commissions SET amount=NEW.commission_amount,currency=NEW.commission_currency,
      due_date=CASE WHEN eligible THEN milestone_date+NEW.commission_due_days ELSE NULL END,
      status=CASE WHEN eligible THEN 'awaiting_approval' ELSE 'awaiting_eligibility' END,
      eligible_at=CASE WHEN eligible THEN COALESCE(eligible_at,now()) ELSE NULL END WHERE id=commission.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER maintain_placement_commission AFTER INSERT OR UPDATE ON public.placements FOR EACH ROW EXECUTE FUNCTION public.sync_placement_commission();

CREATE OR REPLACE FUNCTION public.sync_placement_months(p_placement uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE placement public.placements; existing public.placement_months; cursor_month date; last_month date;
  first_day date; last_day date; final_date date; month_status text; full_month boolean;
BEGIN
  SELECT * INTO placement FROM public.placements WHERE id=p_placement FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Placement not found'; END IF;
  IF placement.status='cancelled' OR placement.actual_join_date IS NULL THEN
    UPDATE public.placement_months SET status='cancelled' WHERE placement_id=p_placement; RETURN;
  END IF;
  final_date:=COALESCE(placement.actual_end_date,current_date);
  cursor_month:=date_trunc('month',placement.actual_join_date)::date;
  last_month:=date_trunc('month',final_date)::date;
  UPDATE public.placement_months SET status='cancelled' WHERE placement_id=p_placement AND (month_start<cursor_month OR month_start>last_month);
  WHILE cursor_month<=last_month LOOP
    first_day:=greatest(cursor_month,placement.actual_join_date);
    last_day:=least((cursor_month+interval '1 month - 1 day')::date,COALESCE(placement.actual_end_date,(cursor_month+interval '1 month - 1 day')::date));
    full_month:=first_day=cursor_month AND last_day=(cursor_month+interval '1 month - 1 day')::date;
    month_status:=CASE WHEN placement.actual_end_date IS NOT NULL OR cursor_month<date_trunc('month',current_date)::date THEN 'completed' ELSE 'active' END;
    SELECT * INTO existing FROM public.placement_months WHERE placement_id=p_placement AND month_start=cursor_month FOR UPDATE;
    IF FOUND THEN
      IF existing.covered_start<>first_day OR existing.covered_end<>last_day OR existing.status='cancelled' THEN
        UPDATE public.placement_months SET covered_start=first_day,covered_end=last_day,status=month_status,
          agreed_amount=CASE WHEN full_month THEN placement.candidate_monthly_amount ELSE NULL END,currency=placement.candidate_currency,
          adjusted_at=NULL,adjusted_by=NULL,notes=NULL WHERE id=existing.id;
      ELSE UPDATE public.placement_months SET status=month_status WHERE id=existing.id;
      END IF;
    ELSE
      INSERT INTO public.placement_months(placement_id,month_start,covered_start,covered_end,agreed_amount,currency,status)
        VALUES(p_placement,cursor_month,first_day,last_day,CASE WHEN full_month THEN placement.candidate_monthly_amount ELSE NULL END,placement.candidate_currency,month_status);
    END IF;
    cursor_month:=(cursor_month+interval '1 month')::date;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_placement_month(p_actor uuid,p_placement uuid,p_month uuid,p_amount numeric,p_currency text,p_notes text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE month public.placement_months;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  SELECT * INTO month FROM public.placement_months WHERE id=p_month AND placement_id=p_placement FOR UPDATE;
  IF NOT FOUND OR month.status='cancelled' THEN RAISE EXCEPTION 'Active placement month not found'; END IF;
  IF p_amount IS NULL OR p_amount<0 OR p_amount<>round(p_amount,2) OR p_currency !~ '^[A-Z]{3}$' OR length(trim(COALESCE(p_reason,'')))=0 THEN RAISE EXCEPTION 'A valid agreed amount, currency and reason are required'; END IF;
  UPDATE public.placement_months SET agreed_amount=p_amount,currency=p_currency,notes=p_notes,adjusted_at=now(),adjusted_by=p_actor WHERE id=p_month;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'placement_month_adjusted',p_placement,
    jsonb_build_object('month_id',p_month,'before_amount',month.agreed_amount,'amount',p_amount,'currency',p_currency,'reason',p_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.decide_placement_commission(p_actor uuid,p_commission uuid,p_status text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE commission public.technical_recruiter_commissions;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  SELECT * INTO commission FROM public.technical_recruiter_commissions WHERE id=p_commission FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found'; END IF;
  IF p_status NOT IN ('approved','rejected') OR commission.status<>'awaiting_approval' OR commission.eligible_at IS NULL THEN RAISE EXCEPTION 'Only eligible commissions awaiting approval can be decided'; END IF;
  UPDATE public.technical_recruiter_commissions SET status=p_status,approved_by=p_actor,approved_at=now(),notes=p_reason WHERE id=p_commission;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'commission_'||p_status,p_commission,
    jsonb_build_object('placement_id',commission.placement_id,'amount',commission.amount,'currency',commission.currency,'reason',p_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.recruiting_operations_totals(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 RETURN jsonb_build_object('counts',jsonb_build_object(
  'activePlacements',(SELECT count(*) FROM public.placements WHERE status='active'),
  'joinsNext30Days',(SELECT count(*) FROM public.placements WHERE actual_join_date IS NULL AND planned_start_date BETWEEN current_date AND current_date+30 AND status IN ('offer_accepted','joining_scheduled')),
  'endsNext30Days',(SELECT count(*) FROM public.placements WHERE actual_end_date IS NULL AND expected_end_date BETWEEN current_date AND current_date+30 AND status<>'cancelled'),
  'captureIssues',(SELECT count(*) FROM public.job_submissions WHERE capture_status IN ('failed','submit_attempted','started','in_progress'))),
 'money',jsonb_build_object(
  'salaryOutstanding',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT trim(p.currency) currency,sum(p.amount-COALESCE(x.paid,0)) amount FROM public.staff_salary_periods p LEFT JOIN (SELECT salary_period_id,sum(amount) paid FROM public.external_payments GROUP BY salary_period_id) x ON x.salary_period_id=p.id WHERE p.status NOT IN ('cancelled','awaiting_adjustment') GROUP BY p.currency) t),'[]'::jsonb),
  'salaryPaid',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT trim(currency) currency,sum(amount) amount FROM public.external_payments WHERE salary_period_id IS NOT NULL GROUP BY currency) t),'[]'::jsonb),
  'commissionOutstanding',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT trim(c.currency) currency,sum(c.amount-COALESCE(x.paid,0)) amount FROM public.technical_recruiter_commissions c LEFT JOIN (SELECT commission_id,sum(amount) paid FROM public.external_payments GROUP BY commission_id) x ON x.commission_id=c.id WHERE c.status<>'rejected' GROUP BY c.currency) t),'[]'::jsonb),
  'commissionPaid',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT trim(currency) currency,sum(amount) amount FROM public.external_payments WHERE commission_id IS NOT NULL GROUP BY currency) t),'[]'::jsonb)));
END; $$;

CREATE VIEW public.earning_payment_balances AS
 SELECT salary_period_id,commission_id,sum(amount) amount FROM public.external_payments GROUP BY salary_period_id,commission_id;
REVOKE ALL ON public.earning_payment_balances FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.earning_payment_balances TO service_role;

CREATE OR REPLACE FUNCTION public.set_staff_account_status(p_actor uuid,p_profile uuid,p_status public.account_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.profiles;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 SELECT * INTO target FROM public.profiles WHERE id=p_profile FOR UPDATE;
 IF NOT FOUND OR target.role NOT IN ('recruiter','technical_recruiter') THEN RAISE EXCEPTION 'Choose a recruiter or technical recruiter account'; END IF;
 UPDATE public.profiles SET status=p_status WHERE id=p_profile;
 INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'profile_status_changed',p_profile,jsonb_build_object('from',target.status,'to',p_status));
END; $$;
REVOKE ALL ON FUNCTION public.set_staff_account_status(uuid,uuid,public.account_status) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_account_status(uuid,uuid,public.account_status) TO service_role;

REVOKE ALL ON FUNCTION public.sync_placement_months(uuid),public.adjust_placement_month(uuid,uuid,uuid,numeric,text,text,text),public.decide_placement_commission(uuid,uuid,text,text),public.recruiting_operations_totals(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_placement_months(uuid),public.adjust_placement_month(uuid,uuid,uuid,numeric,text,text,text),public.decide_placement_commission(uuid,uuid,text,text),public.recruiting_operations_totals(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Source: 20261011000800_capture_integrity.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.save_application_answer_snapshot(
 p_actor uuid,p_intent uuid,p_submission uuid,p_candidate uuid,p_attempt integer,p_event_key uuid,
 p_portal text,p_url text,p_profile_version integer,p_answers jsonb,p_observed_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.application_answer_snapshots; next_revision integer; saved public.application_answer_snapshots;
BEGIN
 IF NOT public.candidate_actor_can_access(p_actor,p_candidate) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
 IF p_attempt<1 OR p_answers IS NULL OR jsonb_typeof(p_answers)<>'array' OR jsonb_array_length(p_answers)>100 THEN RAISE EXCEPTION 'Invalid answer snapshot'; END IF;
 IF p_intent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.application_intents WHERE id=p_intent AND candidate_id=p_candidate AND submission_id=p_submission AND owner_id=p_actor) THEN RAISE EXCEPTION 'Application intent mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_submissions WHERE id=p_submission AND candidate_id=p_candidate) THEN RAISE EXCEPTION 'Submission mismatch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_submission::text||':'||p_attempt::text,0));
 SELECT * INTO prior FROM public.application_answer_snapshots WHERE submission_id=p_submission AND attempt=p_attempt AND event_key=p_event_key;
 IF FOUND THEN RETURN jsonb_build_object('id',prior.id,'revision',prior.revision,'answers',prior.answers); END IF;
 SELECT COALESCE(max(revision),0)+1 INTO next_revision FROM public.application_answer_snapshots WHERE submission_id=p_submission AND attempt=p_attempt;
 INSERT INTO public.application_answer_snapshots(intent_id,submission_id,candidate_id,actor_id,attempt,event_key,revision,portal,portal_url,profile_version,answers,observed_at)
 VALUES(p_intent,p_submission,p_candidate,p_actor,p_attempt,p_event_key,next_revision,left(p_portal,100),left(p_url,2000),p_profile_version,p_answers,p_observed_at)
 RETURNING * INTO saved;
 RETURN jsonb_build_object('id',saved.id,'revision',saved.revision,'answers',saved.answers);
END; $$;
REVOKE ALL ON FUNCTION public.save_application_answer_snapshot(uuid,uuid,uuid,uuid,integer,uuid,text,text,integer,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_application_answer_snapshot(uuid,uuid,uuid,uuid,integer,uuid,text,text,integer,jsonb,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Source: 20261011000900_task_assignment_access.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.task_actor_can_access(p_actor uuid,p_task uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; task public.background_tasks; document public.candidate_documents;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO task FROM public.background_tasks WHERE id=p_task;
 IF NOT FOUND THEN RETURN false; END IF;
 IF actor.role='super_admin' THEN RETURN true; END IF;
 IF task.actor_id<>p_actor THEN RETURN false; END IF;
 IF task.kind='resume_extract' THEN
  SELECT * INTO document FROM public.candidate_documents WHERE task_id=p_task AND status<>'deleted';
  IF NOT FOUND THEN RETURN false; END IF;
  IF document.candidate_id IS NULL THEN RETURN document.owner_id=p_actor; END IF;
  RETURN public.candidate_actor_can_access(p_actor,document.candidate_id);
 ELSIF task.kind IN ('candidate_match','packet_generate') THEN
  RETURN public.candidate_actor_can_access(p_actor,(task.payload->>'candidateId')::uuid);
 ELSE
  RETURN actor.role IN ('recruiter','technical_recruiter');
 END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.task_profile_can_read(p_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.task_actor_can_access(auth.uid(),p_task)
$$;
REVOKE ALL ON FUNCTION public.task_actor_can_access(uuid,uuid),public.task_profile_can_read(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.task_actor_can_access(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.task_profile_can_read(uuid) TO authenticated,service_role;
DROP POLICY IF EXISTS own_tasks ON public.background_tasks;
CREATE POLICY own_tasks ON public.background_tasks FOR SELECT TO authenticated USING(public.task_profile_can_read(id));

CREATE OR REPLACE FUNCTION public.retry_task(p_actor uuid,p_task uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE task public.background_tasks;
BEGIN
 SELECT * INTO task FROM public.background_tasks WHERE id=p_task FOR UPDATE;
 IF NOT public.task_actor_can_access(p_actor,p_task) THEN RAISE EXCEPTION 'Task access denied'; END IF;
 IF task.status<>'failed' THEN RAISE EXCEPTION 'Only failed tasks can be retried'; END IF;
 IF task.kind='resume_extract' THEN
  PERFORM 1 FROM public.candidate_documents WHERE task_id=p_task AND status NOT IN ('deleted','confirmed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document unavailable'; END IF;
  UPDATE public.candidate_documents SET status='queued',error=NULL WHERE task_id=p_task;
 END IF;
 UPDATE public.background_tasks SET status='queued',attempts=0,available_at=now(),lease_token=NULL,lease_until=NULL,error=NULL,result=NULL WHERE id=p_task;
 RETURN p_task;
END; $$;
REVOKE ALL ON FUNCTION public.retry_task(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_task(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Source: 20261011001000_preserve_earned_commission.sql
BEGIN;

-- A one-time active-placement milestone remains earned after normal employment ends.
CREATE OR REPLACE FUNCTION public.sync_placement_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE commission public.technical_recruiter_commissions; eligible boolean; milestone_date date;
BEGIN
  SELECT * INTO commission FROM public.technical_recruiter_commissions WHERE placement_id=NEW.id FOR UPDATE;
  IF FOUND THEN
    IF commission.status IN ('approved','partially_paid','paid') AND
      (NEW.commission_amount IS DISTINCT FROM OLD.commission_amount OR NEW.commission_currency IS DISTINCT FROM OLD.commission_currency
       OR NEW.technical_recruiter_id IS DISTINCT FROM OLD.technical_recruiter_id OR NEW.commission_milestone IS DISTINCT FROM OLD.commission_milestone
       OR NEW.actual_join_date IS NULL) THEN RAISE EXCEPTION 'An approved commission agreement and its credited recruiter cannot be rewritten'; END IF;
    IF NEW.technical_recruiter_id IS DISTINCT FROM commission.technical_recruiter_id OR NEW.commission_milestone<>commission.milestone THEN
      RAISE EXCEPTION 'Commission credit and milestone are preserved; record an explicit agreement correction';
    END IF;
    IF commission.status NOT IN ('awaiting_eligibility','awaiting_approval') THEN RETURN NEW; END IF;
    IF NEW.commission_amount IS NULL THEN RAISE EXCEPTION 'Keep the existing commission terms or reject the commission'; END IF;
  ELSIF NEW.commission_amount IS NULL OR NEW.technical_recruiter_id IS NULL THEN RETURN NEW;
  END IF;
  eligible:=NEW.status<>'cancelled' AND CASE NEW.commission_milestone WHEN 'candidate_joining' THEN NEW.actual_join_date IS NOT NULL ELSE NEW.status IN ('active','completed','ended_early') AND NEW.actual_join_date IS NOT NULL END;
  milestone_date:=NEW.actual_join_date;
  IF commission.id IS NULL THEN
    INSERT INTO public.technical_recruiter_commissions(placement_id,technical_recruiter_id,milestone,amount,currency,due_date,status,eligible_at)
      VALUES(NEW.id,NEW.technical_recruiter_id,NEW.commission_milestone,NEW.commission_amount,NEW.commission_currency,
        CASE WHEN eligible THEN milestone_date+NEW.commission_due_days ELSE NULL END,
        CASE WHEN eligible THEN 'awaiting_approval' ELSE 'awaiting_eligibility' END,CASE WHEN eligible THEN now() ELSE NULL END);
  ELSE
    UPDATE public.technical_recruiter_commissions SET amount=NEW.commission_amount,currency=NEW.commission_currency,
      due_date=CASE WHEN eligible THEN milestone_date+NEW.commission_due_days ELSE NULL END,
      status=CASE WHEN eligible THEN 'awaiting_approval' ELSE 'awaiting_eligibility' END,
      eligible_at=CASE WHEN eligible THEN COALESCE(eligible_at,now()) ELSE NULL END WHERE id=commission.id;
  END IF;
  RETURN NEW;
END; $$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Source: 20261011001100_oauth_staff_registration.sql
BEGIN;

-- Only the server may complete a signed Google registration intent. An existing
-- account is never reclassified by selecting a role at login.
CREATE TABLE public.oauth_registration_intents (
  id uuid PRIMARY KEY,
  role public.app_role NOT NULL CHECK(role IN ('client','recruiter','technical_recruiter')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  consumed_at timestamptz,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.oauth_registration_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oauth_registration_intents FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.oauth_registration_intents TO service_role;

CREATE OR REPLACE FUNCTION public.register_new_oauth_staff(p_profile uuid,p_role public.app_role,p_intent uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE target public.profiles; auth_created timestamptz; provider text; intent public.oauth_registration_intents;
BEGIN
  IF p_role NOT IN ('recruiter','technical_recruiter') THEN RAISE EXCEPTION 'Invalid staff registration role'; END IF;
  SELECT * INTO intent FROM public.oauth_registration_intents WHERE id=p_intent FOR UPDATE;
  IF NOT FOUND OR intent.consumed_at IS NOT NULL OR intent.role<>p_role OR intent.expires_at<now() THEN RETURN false; END IF;
  -- Consume even an existing-account attempt so the same signed intent cannot
  -- later reclassify another newly created Google account.
  UPDATE public.oauth_registration_intents SET consumed_at=now(),profile_id=p_profile WHERE id=p_intent;
  SELECT created_at,raw_app_meta_data->>'provider' INTO auth_created,provider FROM auth.users WHERE id=p_profile;
  IF auth_created IS NULL OR auth_created<intent.started_at OR provider IS DISTINCT FROM 'google' THEN RETURN false; END IF;
  SELECT * INTO target FROM public.profiles WHERE id=p_profile FOR UPDATE;
  IF NOT FOUND OR target.role<>'client' OR target.status<>'active'
     OR EXISTS(SELECT 1 FROM public.candidates WHERE user_id=p_profile) THEN RETURN false; END IF;
  UPDATE public.profiles SET role=p_role,status='pending',updated_at=now() WHERE id=p_profile;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata)
    VALUES(p_profile,'oauth_staff_registered',p_profile,jsonb_build_object('role',p_role,'status','pending'));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.register_new_oauth_staff(uuid,public.app_role,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_new_oauth_staff(uuid,public.app_role,uuid) TO service_role;

-- Administrators can repair candidate profiles from the previous Google flow.
-- Correction deliberately requires a separate staff approval operation.
CREATE OR REPLACE FUNCTION public.correct_staff_account_role(p_actor uuid,p_profile uuid,p_role public.app_role,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.profiles;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  IF p_actor=p_profile THEN RAISE EXCEPTION 'Cannot correct your own account role'; END IF;
  IF p_role NOT IN ('recruiter','technical_recruiter') THEN RAISE EXCEPTION 'Choose a recruiter or technical recruiter role'; END IF;
  IF length(COALESCE(p_reason,''))>500 THEN RAISE EXCEPTION 'Correction reason is too long'; END IF;
  SELECT * INTO target FROM public.profiles WHERE id=p_profile FOR UPDATE;
  IF NOT FOUND OR target.role<>'client' THEN RAISE EXCEPTION 'Only an existing candidate account can be corrected to pending staff'; END IF;
  UPDATE public.profiles SET role=p_role,status='pending',updated_at=now() WHERE id=p_profile;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata)
    VALUES(p_actor,'staff_account_role_corrected',p_profile,jsonb_build_object('from_role',target.role,'from_status',target.status,'to_role',p_role,'to_status','pending','reason',NULLIF(trim(p_reason),'')));
END; $$;
REVOKE ALL ON FUNCTION public.correct_staff_account_role(uuid,uuid,public.app_role,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.correct_staff_account_role(uuid,uuid,public.app_role,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Source: 202610120001_submission_actor_integrity.sql
BEGIN;

-- Manual browser writes must retain the actual submitting staff member.
-- Trusted capture/receipt/packet functions continue to supply their own actor.
CREATE OR REPLACE FUNCTION public.guard_submission_attribution() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles;
BEGIN
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role',true)='service_role'
    OR COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' THEN RETURN NEW; END IF;
  SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND status='active';
  IF actor.id IS NULL OR actor.role NOT IN ('recruiter','technical_recruiter','super_admin') THEN
    RAISE EXCEPTION 'Active recruiting staff required';
  END IF;
  IF TG_OP='INSERT' THEN
    NEW.recruiter_id:=CASE WHEN actor.role IN ('recruiter','super_admin') THEN actor.id ELSE NULL END;
    NEW.technical_recruiter_id:=CASE WHEN actor.role='technical_recruiter' THEN actor.id ELSE NULL END;
  ELSIF NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
    OR NEW.recruiter_id IS DISTINCT FROM OLD.recruiter_id
    OR NEW.technical_recruiter_id IS DISTINCT FROM OLD.technical_recruiter_id
    OR NEW.job_id IS DISTINCT FROM OLD.job_id THEN
    RAISE EXCEPTION 'Application candidate, job and staff attribution cannot be rewritten';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER enforce_submission_attribution BEFORE INSERT OR UPDATE ON public.job_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_submission_attribution();

NOTIFY pgrst,'reload schema';
COMMIT;

-- API performance update (2026-10-12)
-- Apply after the recruiting operations migrations. Preserves historical adjustments and payment checks.
BEGIN;
CREATE OR REPLACE FUNCTION public.sync_staff_salary_periods(p_employment uuid,p_through date DEFAULT (current_date+interval '2 months')::date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE employment public.staff_employments; term public.staff_compensation_terms; existing public.staff_salary_periods;
  month_date date; start_day date; next_month date; finish_day date; full_finish date; i integer;
  anchor integer; partial boolean; paid numeric;
BEGIN
  SELECT * INTO employment FROM public.staff_employments WHERE id=p_employment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employment not found'; END IF;
  anchor:=extract(day FROM employment.hire_date)::integer;
  IF employment.end_date IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.staff_salary_periods p JOIN public.external_payments x ON x.salary_period_id=p.id
      WHERE p.employment_id=p_employment AND p.start_date>employment.end_date GROUP BY p.id HAVING sum(x.amount)>0) THEN
      RAISE EXCEPTION 'Correct payments on periods after the employment end date first';
    END IF;
    UPDATE public.staff_salary_periods SET status='cancelled' WHERE employment_id=p_employment AND start_date>employment.end_date AND status<>'cancelled';
  END IF;
  FOR i IN 0..359 LOOP
    month_date:=(date_trunc('month',employment.hire_date)+make_interval(months=>i))::date;
    start_day:=month_date+least(anchor,extract(day FROM month_date+interval '1 month - 1 day')::integer)-1;
    EXIT WHEN start_day>p_through OR (employment.end_date IS NOT NULL AND start_day>employment.end_date);
    next_month:=(month_date+interval '1 month')::date;
    full_finish:=next_month+least(anchor,extract(day FROM next_month+interval '1 month - 1 day')::integer)-1;
    finish_day:=least(full_finish,COALESCE(employment.end_date+1,full_finish));
    partial:=finish_day<full_finish;
    SELECT * INTO existing FROM public.staff_salary_periods WHERE employment_id=p_employment AND period_index=i FOR UPDATE;
    IF FOUND THEN
      -- Never resnapshot salary terms or erase an explicit final-period adjustment on a read/refresh.
      IF existing.start_date IS DISTINCT FROM start_day THEN RAISE EXCEPTION 'Joining date cannot change after salary periods exist'; END IF;
      IF existing.end_date_exclusive IS DISTINCT FROM finish_day OR existing.status='cancelled' THEN
        SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE salary_period_id=existing.id;
        IF paid>0 THEN RAISE EXCEPTION 'Correct payments before changing the covered salary dates'; END IF;
        UPDATE public.staff_salary_periods SET end_date_exclusive=finish_day,due_date=finish_day,
          amount=CASE WHEN partial AND employment.partial_period_rule='manual' THEN 0 ELSE COALESCE(existing.monthly_amount,existing.amount) END,
          status=CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'awaiting_adjustment' ELSE 'accruing' END,
          adjusted_at=NULL,adjusted_by=NULL,notes=CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'Manual amount required for final partial salary period.' ELSE NULL END
          WHERE id=existing.id;
      END IF;
    ELSE
      SELECT * INTO term FROM public.staff_compensation_terms WHERE employment_id=p_employment AND effective_from<=start_day
        AND (effective_to IS NULL OR effective_to>=start_day) ORDER BY effective_from DESC LIMIT 1;
      IF FOUND THEN
        INSERT INTO public.staff_salary_periods(employment_id,period_index,start_date,end_date_exclusive,due_date,amount,monthly_amount,currency,status,compensation_term_id,notes)
          VALUES(p_employment,i,start_day,finish_day,finish_day,CASE WHEN partial AND employment.partial_period_rule='manual' THEN 0 ELSE term.monthly_amount END,
            term.monthly_amount,term.currency,CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'awaiting_adjustment' ELSE 'accruing' END,
            term.id,CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'Manual amount required for final partial salary period.' ELSE NULL END);
      END IF;
    END IF;
  END LOOP;
  -- Aggregate payments once per period instead of repeating correlated sums.
  WITH balances AS (
    SELECT p.id,p.amount,p.due_date,COALESCE(sum(x.amount),0) paid_total
    FROM public.staff_salary_periods p LEFT JOIN public.external_payments x ON x.salary_period_id=p.id
    WHERE p.employment_id=p_employment AND p.status NOT IN ('awaiting_adjustment','cancelled')
    GROUP BY p.id
  ), statuses AS (
    SELECT b.id,CASE WHEN b.amount-b.paid_total<=0 THEN 'paid' WHEN b.paid_total>0 THEN 'partially_paid'
      WHEN b.due_date<current_date THEN 'overdue' WHEN b.due_date=current_date THEN 'due' ELSE 'accruing' END status
    FROM balances b
  )
  UPDATE public.staff_salary_periods p SET status=s.status FROM statuses s
    WHERE p.id=s.id AND p.status IS DISTINCT FROM s.status;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_placement_months(p_placement uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE placement public.placements; existing public.placement_months; cursor_month date; last_month date;
  first_day date; last_day date; final_date date; month_status text; full_month boolean;
BEGIN
  SELECT * INTO placement FROM public.placements WHERE id=p_placement FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Placement not found'; END IF;
  IF placement.status='cancelled' OR placement.actual_join_date IS NULL THEN
    UPDATE public.placement_months SET status='cancelled' WHERE placement_id=p_placement AND status<>'cancelled'; RETURN;
  END IF;
  final_date:=COALESCE(placement.actual_end_date,current_date);
  cursor_month:=date_trunc('month',placement.actual_join_date)::date;
  last_month:=date_trunc('month',final_date)::date;
  UPDATE public.placement_months SET status='cancelled' WHERE placement_id=p_placement AND status<>'cancelled' AND (month_start<cursor_month OR month_start>last_month);
  WHILE cursor_month<=last_month LOOP
    first_day:=greatest(cursor_month,placement.actual_join_date);
    last_day:=least((cursor_month+interval '1 month - 1 day')::date,COALESCE(placement.actual_end_date,(cursor_month+interval '1 month - 1 day')::date));
    full_month:=first_day=cursor_month AND last_day=(cursor_month+interval '1 month - 1 day')::date;
    month_status:=CASE WHEN placement.actual_end_date IS NOT NULL OR cursor_month<date_trunc('month',current_date)::date THEN 'completed' ELSE 'active' END;
    SELECT * INTO existing FROM public.placement_months WHERE placement_id=p_placement AND month_start=cursor_month FOR UPDATE;
    IF FOUND THEN
      IF existing.covered_start<>first_day OR existing.covered_end<>last_day OR existing.status='cancelled' THEN
        UPDATE public.placement_months SET covered_start=first_day,covered_end=last_day,status=month_status,
          agreed_amount=CASE WHEN full_month THEN placement.candidate_monthly_amount ELSE NULL END,currency=placement.candidate_currency,
          adjusted_at=NULL,adjusted_by=NULL,notes=NULL WHERE id=existing.id;
      ELSE UPDATE public.placement_months SET status=month_status WHERE id=existing.id AND status IS DISTINCT FROM month_status;
      END IF;
    ELSE
      INSERT INTO public.placement_months(placement_id,month_start,covered_start,covered_end,agreed_amount,currency,status)
        VALUES(p_placement,cursor_month,first_day,last_day,CASE WHEN full_month THEN placement.candidate_monthly_amount ELSE NULL END,placement.candidate_currency,month_status);
    END IF;
    cursor_month:=(cursor_month+interval '1 month')::date;
  END LOOP;
END; $$;


CREATE OR REPLACE FUNCTION public.sync_recruiting_periods(p_employments uuid[] DEFAULT '{}',p_placements uuid[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item uuid;
BEGIN
 IF COALESCE(cardinality(p_employments),0)>200 OR COALESCE(cardinality(p_placements),0)>200 THEN
  RAISE EXCEPTION 'Period refresh accepts at most 200 IDs per kind';
 END IF;
 -- Consistent lock order also makes concurrent dashboard refreshes safer.
 FOR item IN SELECT DISTINCT id FROM unnest(p_employments) id WHERE id IS NOT NULL ORDER BY id LOOP
  PERFORM public.sync_staff_salary_periods(item);
 END LOOP;
 FOR item IN SELECT DISTINCT id FROM unnest(p_placements) id WHERE id IS NOT NULL ORDER BY id LOOP
  PERFORM public.sync_placement_months(item);
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.sync_recruiting_periods(uuid[],uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_recruiting_periods(uuid[],uuid[]) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Platform fixes (2026-10-12): job dates, service collections, task claims

BEGIN;
-- Source publication and application deadline are independent of sync timestamps and observed state.
-- Existing rows intentionally remain NULL: no historical dates can be inferred safely.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS closes_at timestamptz;
COMMENT ON COLUMN public.jobs.posted_at IS 'Provider publication timestamp: Greenhouse first publication; Ashby last publication, including republication. NULL when unavailable.';
COMMENT ON COLUMN public.jobs.closes_at IS 'Explicit provider application deadline only. NULL when unavailable. Independent of observed closed state.';
CREATE OR REPLACE FUNCTION public.save_job_snapshot(p_task uuid,p_lease uuid,p_source uuid,p_jobs jsonb,p_complete boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb; total integer;BEGIN
 PERFORM check_task_lease(p_task,p_lease);
 PERFORM 1 FROM job_sources WHERE id=p_source AND enabled FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Source no longer enabled';END IF;
 IF NOT EXISTS(SELECT 1 FROM background_tasks WHERE id=p_task AND kind='source_sync' AND payload->>'sourceId'=p_source::text) THEN RAISE EXCEPTION 'Invalid task source';END IF;
 IF EXISTS(SELECT 1 FROM source_sync_runs WHERE task_id=p_task) THEN RETURN jsonb_build_object('cached',true);END IF;
 IF jsonb_typeof(p_jobs)<>'array' THEN RAISE EXCEPTION 'Invalid jobs snapshot';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_jobs) LOOP
 INSERT INTO jobs(source_id,external_id,title,company,source_url,application_url,location,department,description,description_html,employment_type,employment_evidence,arrangements,compensation,posted_at,closes_at,content_hash)
 VALUES(p_source,item->>'external_id',item->>'title',item->>'company',item->>'source_url',item->>'application_url',item->>'location',item->>'department',item->>'description',item->>'description_html',item->>'employment_type',item->>'employment_evidence',item->'arrangements',item->'compensation',NULLIF(item->>'posted_at','')::timestamptz,NULLIF(item->>'closes_at','')::timestamptz,item->>'content_hash')
 ON CONFLICT(source_id,external_id) DO UPDATE SET title=EXCLUDED.title,company=EXCLUDED.company,source_url=EXCLUDED.source_url,application_url=EXCLUDED.application_url,location=EXCLUDED.location,department=EXCLUDED.department,description=EXCLUDED.description,description_html=EXCLUDED.description_html,employment_type=EXCLUDED.employment_type,employment_evidence=EXCLUDED.employment_evidence,arrangements=EXCLUDED.arrangements,compensation=EXCLUDED.compensation,posted_at=EXCLUDED.posted_at,closes_at=EXCLUDED.closes_at,content_hash=EXCLUDED.content_hash,version=jobs.version+CASE WHEN jobs.content_hash<>EXCLUDED.content_hash THEN 1 ELSE 0 END,state='active',last_seen_at=now(),updated_at=CASE WHEN jobs.content_hash<>EXCLUDED.content_hash THEN now() ELSE jobs.updated_at END;
 END LOOP;
 IF p_complete THEN UPDATE jobs SET state='closed' WHERE source_id=p_source AND external_id NOT IN(SELECT value->>'external_id' FROM jsonb_array_elements(p_jobs));END IF;
 total:=jsonb_array_length(p_jobs);INSERT INTO source_sync_runs(source_id,task_id,complete,count) VALUES(p_source,p_task,p_complete,total);
 UPDATE job_sources SET last_checked_at=now(),last_success_at=CASE WHEN p_complete THEN now() ELSE last_success_at END,health=CASE WHEN p_complete THEN 'healthy' ELSE 'partial' END,error=CASE WHEN p_complete THEN NULL ELSE 'Incomplete snapshot; omitted jobs retained.' END WHERE id=p_source;
 RETURN jsonb_build_object('count',total,'complete',p_complete);END;$$;
COMMIT;


BEGIN;
-- Service fees flow from the candidate/client to the business. Payroll remains separate.
CREATE TABLE public.service_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid NOT NULL REFERENCES public.candidates(id),
 joining_date date NOT NULL, end_date date, monthly_fee numeric(14,2) NOT NULL CHECK(monthly_fee>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(end_date IS NULL OR end_date>=joining_date)
);
CREATE TABLE public.service_bills (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid NOT NULL REFERENCES public.service_enrollments(id),
 start_date date NOT NULL,end_date_exclusive date NOT NULL,due_date date NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>=0),currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(enrollment_id,start_date),CHECK(end_date_exclusive>start_date)
);
CREATE TABLE public.service_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bill_id uuid NOT NULL REFERENCES public.service_bills(id),
 amount numeric(14,2) NOT NULL CHECK(amount<>0),currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),received_on date NOT NULL,
 method text NOT NULL CHECK(length(trim(method))>0),external_reference text UNIQUE,
 correction_of uuid REFERENCES public.service_receipts(id),reason text,recorded_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),CHECK((amount>0 AND correction_of IS NULL) OR (amount<0 AND correction_of IS NOT NULL AND length(trim(reason))>0))
);
CREATE INDEX service_bills_due ON public.service_bills(due_date);
CREATE INDEX service_receipts_bill ON public.service_receipts(bill_id);
CREATE INDEX service_enrollments_candidate ON public.service_enrollments(candidate_id);
ALTER TABLE public.service_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_enrollment_view ON public.service_enrollments FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active' AND (p.role='super_admin' OR (p.role='client' AND EXISTS(SELECT 1 FROM public.candidates c WHERE c.id=candidate_id AND c.user_id=p.id)))));
CREATE POLICY service_bill_view ON public.service_bills FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.service_enrollments e WHERE e.id=enrollment_id));
CREATE POLICY service_receipt_view ON public.service_receipts FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.service_bills b WHERE b.id=bill_id));
REVOKE ALL ON public.service_enrollments,public.service_bills,public.service_receipts FROM anon,authenticated;
GRANT SELECT ON public.service_enrollments,public.service_bills,public.service_receipts TO authenticated;
GRANT SELECT,INSERT ON public.service_enrollments,public.service_bills,public.service_receipts TO service_role;
-- Immutable fee and period snapshots: changes require a new enrollment, receipts require reversals.
CREATE FUNCTION public.service_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='service_enrollments' AND TG_OP='UPDATE' THEN
  IF OLD.end_date IS NULL AND NEW.end_date IS NOT NULL AND (to_jsonb(NEW)-'end_date')=(to_jsonb(OLD)-'end_date') THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Service billing history is immutable'; END $$;
CREATE TRIGGER service_enrollment_immutable BEFORE UPDATE OR DELETE ON public.service_enrollments FOR EACH ROW EXECUTE FUNCTION public.service_history_immutable();
CREATE TRIGGER service_bill_immutable BEFORE UPDATE OR DELETE ON public.service_bills FOR EACH ROW EXECUTE FUNCTION public.service_history_immutable();
CREATE TRIGGER service_receipt_immutable BEFORE UPDATE OR DELETE ON public.service_receipts FOR EACH ROW EXECUTE FUNCTION public.service_history_immutable();
CREATE VIEW public.service_bill_balances WITH(security_invoker=true) AS
 SELECT b.*,coalesce(r.received_amount,0)::numeric(14,2) received_amount,(b.amount-coalesce(r.received_amount,0))::numeric(14,2) balance,
 CASE WHEN b.amount-coalesce(r.received_amount,0)<=0 THEN 'paid' WHEN coalesce(r.received_amount,0)>0 THEN 'partially_paid' WHEN b.due_date<current_date THEN 'overdue' WHEN b.due_date=current_date THEN 'due' ELSE 'upcoming' END status
 FROM public.service_bills b LEFT JOIN (SELECT bill_id,sum(amount) received_amount FROM public.service_receipts GROUP BY bill_id) r ON r.bill_id=b.id;
GRANT SELECT ON public.service_bill_balances TO authenticated,service_role;
CREATE FUNCTION public.sync_service_bills(p_today date DEFAULT current_date,p_candidates uuid[] DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.service_enrollments; i integer; s date; n date;
BEGIN
 FOR e IN SELECT * FROM public.service_enrollments WHERE joining_date<=p_today AND (p_candidates IS NULL OR candidate_id=ANY(p_candidates)) ORDER BY id FOR UPDATE LOOP
  SELECT coalesce(max((extract(year FROM start_date)::int-extract(year FROM e.joining_date)::int)*12+extract(month FROM start_date)::int-extract(month FROM e.joining_date)::int),0) INTO i FROM public.service_bills WHERE enrollment_id=e.id;
  LOOP
   -- Add each interval to the ORIGINAL anchor so February never shifts March's day.
   s:=(e.joining_date+make_interval(months=>i))::date;n:=(e.joining_date+make_interval(months=>i+1))::date;
   EXIT WHEN s>p_today OR (e.end_date IS NOT NULL AND s>e.end_date);
   INSERT INTO public.service_bills(enrollment_id,start_date,end_date_exclusive,due_date,amount,currency)
    VALUES(e.id,s,least(n,coalesce(e.end_date+1,n)),n,e.monthly_fee,e.currency) ON CONFLICT(enrollment_id,start_date) DO NOTHING;
   i:=i+1;
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION public.create_service_enrollment(p_actor uuid,p_candidate uuid,p_join date,p_end date,p_fee numeric,p_currency text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.service_enrollments;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 IF p_join IS NULL OR p_fee IS NULL OR p_fee<0 OR p_fee<>round(p_fee,2) OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR p_end<p_join OR p_join<current_date-interval '20 years' THEN RAISE EXCEPTION 'Invalid service enrollment'; END IF;
 -- Serialize per candidate to prohibit overlapping fee agreements.
 PERFORM 1 FROM public.candidates WHERE id=p_candidate FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_enrollments WHERE candidate_id=p_candidate AND daterange(joining_date,coalesce(end_date+1,'infinity'::date),'[)') && daterange(p_join,coalesce(p_end+1,'infinity'::date),'[)')) THEN RAISE EXCEPTION 'Service enrollment overlaps an existing agreement'; END IF;
 INSERT INTO public.service_enrollments(candidate_id,joining_date,end_date,monthly_fee,currency,created_by) VALUES(p_candidate,p_join,p_end,p_fee,p_currency,p_actor) RETURNING * INTO e;
 PERFORM public.sync_service_bills();
 INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'service_enrollment_created',e.id,to_jsonb(e));
 RETURN to_jsonb(e);
END $$;
CREATE FUNCTION public.record_service_receipt(p_actor uuid,p_bill uuid,p_amount numeric,p_currency text,p_on date,p_method text,p_reference text,p_correction uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.service_bills; original public.service_receipts; r public.service_receipts; received numeric; reversible numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 SELECT * INTO b FROM public.service_bills WHERE id=p_bill FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Service bill not found'; END IF;
 IF p_amount IS NULL OR p_amount=0 OR p_amount<>round(p_amount,2) OR p_on IS NULL OR p_on>current_date OR p_method IS NULL OR length(trim(p_method))=0 THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
 IF p_currency IS DISTINCT FROM b.currency THEN RAISE EXCEPTION 'Receipt currency mismatch'; END IF;
 SELECT coalesce(sum(amount),0) INTO received FROM public.service_receipts WHERE bill_id=p_bill;
 IF p_correction IS NULL THEN
  IF p_amount<0 THEN RAISE EXCEPTION 'Negative receipts require a correction'; END IF;
  IF p_amount>b.amount-received THEN RAISE EXCEPTION 'Receipt exceeds outstanding balance'; END IF;
 ELSE
  SELECT * INTO original FROM public.service_receipts WHERE id=p_correction FOR UPDATE;
  IF NOT FOUND OR original.bill_id<>p_bill OR original.correction_of IS NOT NULL OR p_amount>=0 OR coalesce(length(trim(p_reason)),0)=0 THEN RAISE EXCEPTION 'Invalid receipt correction'; END IF;
  SELECT original.amount+coalesce(sum(amount),0) INTO reversible FROM public.service_receipts WHERE correction_of=p_correction;
  IF -p_amount>reversible THEN RAISE EXCEPTION 'Correction exceeds remaining original receipt'; END IF;
 END IF;
 INSERT INTO public.service_receipts(bill_id,amount,currency,received_on,method,external_reference,correction_of,reason,recorded_by)
 VALUES(p_bill,p_amount,p_currency,p_on,trim(p_method),nullif(trim(p_reference),''),p_correction,p_reason,p_actor) RETURNING * INTO r;
 INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,CASE WHEN p_correction IS NULL THEN 'service_receipt_recorded' ELSE 'service_receipt_corrected' END,p_bill,to_jsonb(r));
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.sync_service_bills(date,uuid[]),public.create_service_enrollment(uuid,uuid,date,date,numeric,text),public.record_service_receipt(uuid,uuid,numeric,text,date,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_service_bills(date,uuid[]),public.create_service_enrollment(uuid,uuid,date,date,numeric,text),public.record_service_receipt(uuid,uuid,numeric,text,date,text,text,uuid,text) TO service_role;
CREATE FUNCTION public.service_collection_totals(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 SELECT jsonb_build_object(
  'received',coalesce((SELECT jsonb_agg(t) FROM (SELECT currency,sum(amount) amount FROM public.service_receipts GROUP BY currency ORDER BY currency)t),'[]'::jsonb),
  'outstanding',coalesce((SELECT jsonb_agg(t) FROM (SELECT currency,sum(balance) amount FROM public.service_bill_balances WHERE balance>0 GROUP BY currency ORDER BY currency)t),'[]'::jsonb),
  'due',coalesce((SELECT jsonb_agg(t) FROM (SELECT currency,sum(balance) amount FROM public.service_bill_balances WHERE balance>0 AND due_date<=current_date GROUP BY currency ORDER BY currency)t),'[]'::jsonb),
  'duePeriods',(SELECT count(*) FROM public.service_bill_balances WHERE balance>0 AND due_date<=current_date)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.service_collection_totals(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_collection_totals(uuid) TO service_role;
CREATE FUNCTION public.end_service_enrollment(p_actor uuid,p_enrollment uuid,p_end date,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.service_enrollments;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 SELECT * INTO e FROM public.service_enrollments WHERE id=p_enrollment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Service enrollment not found'; END IF;
 IF e.end_date IS NOT NULL OR p_end IS NULL OR p_end<e.joining_date OR coalesce(length(trim(p_reason)),0)=0 THEN RAISE EXCEPTION 'Invalid service end date or reason'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_bills WHERE enrollment_id=e.id AND end_date_exclusive-1>p_end) THEN RAISE EXCEPTION 'End date cannot precede the end of existing billed periods'; END IF;
 UPDATE public.service_enrollments SET end_date=p_end WHERE id=e.id;
 INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'service_enrollment_ended',e.id,jsonb_build_object('end_date',p_end,'reason',p_reason,'existing_bills_preserved',true));
END $$;
REVOKE ALL ON FUNCTION public.end_service_enrollment(uuid,uuid,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.end_service_enrollment(uuid,uuid,date,text) TO service_role;
COMMIT;


BEGIN;
-- Targeted notifications share the durable worker lease contract. Duplicate calls are no-ops.
CREATE OR REPLACE FUNCTION public.claim_specific_task(p_task uuid,p_lease uuid)
RETURNS SETOF public.background_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 IF p_lease IS NULL THEN RAISE EXCEPTION 'Lease token required'; END IF;
 SELECT task.id INTO target FROM public.background_tasks task JOIN public.profiles profile ON profile.id=task.actor_id
 WHERE task.id=p_task AND profile.status='active' AND task.attempts<3
 AND ((task.status='queued' AND task.available_at<=now()) OR (task.status='running' AND task.lease_until<now()))
 FOR UPDATE OF task SKIP LOCKED LIMIT 1;
 RETURN QUERY UPDATE public.background_tasks SET status='running',attempts=attempts+1,lease_token=p_lease,
 lease_until=now()+interval '3 minutes',updated_at=now() WHERE id=target RETURNING *;
END; $$;
REVOKE ALL ON FUNCTION public.claim_specific_task(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_specific_task(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

NOTIFY pgrst, 'reload schema';

-- Candidate and recruiter email capture (2026-10-14)
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

-- Public directory vendor import (2026-10-14)
BEGIN;
-- Server-only, insert-only import. Serialize imports to make concurrent retries
-- idempotent without changing or deduplicating existing CRM records.
CREATE OR REPLACE FUNCTION public.import_public_vendors(p_entries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE entry jsonb; imported integer := 0; skipped integer := 0; host text;
BEGIN
  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' OR jsonb_array_length(p_entries) > 50 THEN
    RAISE EXCEPTION 'Expected at most 50 public company entries';
  END IF;
  PERFORM pg_advisory_xact_lock(20261014, 3);
  FOR entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    IF nullif(trim(entry->>'name'),'') IS NULL OR nullif(entry->>'public_directory_id','') IS NULL OR coalesce(entry->>'website','') !~ '^https://' THEN
      RAISE EXCEPTION 'Invalid public company entry';
    END IF;
    host := split_part(regexp_replace(lower(entry->>'website'), '^https?://(www\.)?', ''), '/', 1);
    IF EXISTS (SELECT 1 FROM public.vendors v WHERE
      v.data->>'public_directory_id' = entry->>'public_directory_id'
      OR lower(trim(v.name)) = lower(trim(entry->>'name'))
      OR split_part(regexp_replace(lower(v.data->>'website'), '^https?://(www\.)?', ''), '/', 1) = host
    ) THEN skipped := skipped + 1;
    ELSE
      INSERT INTO public.vendors(name,data) VALUES(trim(entry->>'name'), entry-'id'-'contacts');
      imported := imported + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('imported', imported, 'skipped', skipped);
END; $$;
REVOKE ALL ON FUNCTION public.import_public_vendors(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_public_vendors(jsonb) TO service_role;
COMMIT;
