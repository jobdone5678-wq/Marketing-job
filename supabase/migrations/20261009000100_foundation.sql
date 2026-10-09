BEGIN;
-- Preserve existing values; remove fabricated defaults for future candidate records.
DO $$ DECLARE col text; BEGIN
  FOREACH col IN ARRAY ARRAY['visa_status','authorized_in_usa','need_sponsorship_now','need_sponsorship_future','employment_status',
    'notice_period','available_to_join','interview_availability','open_to_relocation','preferred_work_type','preferred_locations',
    'current_salary','expected_salary','employment_types','highest_qualification','target_job_titles'] LOOP
    EXECUTE format('ALTER TABLE public.candidates ALTER COLUMN %I DROP DEFAULT, ALTER COLUMN %I DROP NOT NULL',col,col);
  END LOOP;
END $$;

ALTER TABLE public.candidates ALTER COLUMN is_active_bench SET DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidates' AND column_name='version') THEN
    ALTER TABLE public.candidates ADD COLUMN version integer NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidates' AND column_name='provenance_status') THEN
    ALTER TABLE public.candidates ADD COLUMN provenance_status text NOT NULL DEFAULT 'legacy_unconfirmed' CHECK(provenance_status IN ('legacy_unconfirmed','confirmed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidates' AND column_name='confirmed_facts') THEN
    ALTER TABLE public.candidates ADD COLUMN confirmed_facts jsonb NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidates' AND column_name='employment_history') THEN
    ALTER TABLE public.candidates ADD COLUMN employment_history jsonb NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidates' AND column_name='education_history') THEN
    ALTER TABLE public.candidates ADD COLUMN education_history jsonb NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidates' AND column_name='evidence') THEN
    ALTER TABLE public.candidates ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidates' AND column_name='created_by') THEN
    ALTER TABLE public.candidates ADD COLUMN created_by uuid REFERENCES public.profiles(id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_candidate_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role',true)='service_role'
    OR COALESCE(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'='service_role' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND (NEW.version<>1 OR NEW.provenance_status<>'legacy_unconfirmed' OR NEW.confirmed_facts<>'{}'::jsonb
    OR NEW.created_by IS NOT NULL OR (public.get_current_role()='client' AND (NEW.user_id IS DISTINCT FROM auth.uid() OR NEW.assigned_recruiter_id IS NOT NULL))) THEN
    RAISE EXCEPTION 'Candidate protected fields require a trusted review operation';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.assigned_recruiter_id IS DISTINCT FROM OLD.assigned_recruiter_id
    OR NEW.version IS DISTINCT FROM OLD.version OR NEW.provenance_status IS DISTINCT FROM OLD.provenance_status
    OR NEW.confirmed_facts IS DISTINCT FROM OLD.confirmed_facts OR NEW.employment_history IS DISTINCT FROM OLD.employment_history
    OR NEW.education_history IS DISTINCT FROM OLD.education_history OR NEW.evidence IS DISTINCT FROM OLD.evidence OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'Candidate protected fields require a trusted review operation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_candidate_fields ON public.candidates;
CREATE TRIGGER guard_candidate_fields BEFORE INSERT OR UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.guard_candidate_fields();

DROP POLICY IF EXISTS candidate_owner_insert ON public.candidates;
CREATE POLICY candidate_owner_insert ON public.candidates FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND public.get_current_role()='client');

DROP POLICY IF EXISTS candidate_owner_update ON public.candidates;
CREATE POLICY candidate_owner_update ON public.candidates FOR UPDATE TO authenticated USING(user_id=auth.uid() AND public.get_current_role()='client') WITH CHECK(user_id=auth.uid());

REVOKE INSERT,UPDATE,DELETE ON public.candidates FROM authenticated;

DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS scoped_profiles ON public.profiles;
CREATE POLICY scoped_profiles ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid() OR public.get_current_role() IN ('recruiter','super_admin'));

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
    INSERT INTO public.candidates(full_name,user_id,assigned_recruiter_id,created_by)
      VALUES(trim(incoming.full_name),CASE WHEN actor.role='client' THEN p_actor ELSE NULL END,CASE WHEN actor.role<>'client' THEN p_actor ELSE NULL END,p_actor) RETURNING id INTO result;
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
    evidence=COALESCE(incoming.evidence,'[]'::jsonb),confirmed_facts=p_fields-'user_id'-'assigned_recruiter_id'-'created_by'-'version'-'id'-'resume_url',
    version=version+1 WHERE id=result;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.save_candidate_profile(uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_candidate_profile(uuid,uuid,integer,jsonb) TO service_role;

DROP POLICY IF EXISTS "Clients can only view their own candidate profile" ON public.candidates;
CREATE POLICY "Clients can only view their own candidate profile" ON public.candidates FOR SELECT TO authenticated USING(user_id=auth.uid() AND get_current_role()='client');

DROP POLICY IF EXISTS "Clients can view their own submissions" ON public.job_submissions;
CREATE POLICY "Clients can view their own submissions" ON public.job_submissions FOR SELECT TO authenticated USING(get_current_role()='client' AND candidate_id IN(SELECT id FROM candidates WHERE user_id=auth.uid()));

COMMIT;
