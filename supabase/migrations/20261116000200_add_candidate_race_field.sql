-- Add race / ethnicity columns to public.candidates
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS race text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS race_ethnicity text;

-- Update save_candidate_profile to persist race and race_ethnicity
CREATE OR REPLACE FUNCTION public.save_candidate_profile(p_actor uuid,p_id uuid,p_expected integer,p_fields jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; prior public.candidates; incoming public.candidates; result uuid;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active' AND role IN ('candidate');
  IF NOT FOUND THEN RAISE EXCEPTION 'Active account required'; END IF;
  SELECT * INTO incoming FROM jsonb_populate_record(NULL::public.candidates,p_fields);
  IF incoming.full_name IS NULL OR length(trim(incoming.full_name)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Full name is required'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO prior FROM public.candidates WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR prior.user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
    IF p_expected IS DISTINCT FROM prior.version THEN RAISE EXCEPTION 'Profile changed; reload before saving'; END IF;
    result:=p_id;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
    IF EXISTS(SELECT 1 FROM public.candidates WHERE user_id=p_actor) THEN RAISE EXCEPTION 'Your profile already exists; edit it instead'; END IF;
    INSERT INTO public.candidates(full_name,user_id,created_by)
      VALUES(trim(incoming.full_name),p_actor,p_actor) RETURNING id INTO result;
  END IF;
  UPDATE public.candidates SET
    full_name=trim(incoming.full_name),email=incoming.email,phone=incoming.phone,linkedin_url=incoming.linkedin_url,
    current_city=incoming.current_city,current_state=incoming.current_state,full_address=incoming.full_address,visa_status=incoming.visa_status,
    work_authorization=COALESCE(incoming.work_authorization, p_fields->>'work_authorization', incoming.visa_status),
    gender=COALESCE(incoming.gender, p_fields->>'gender'),
    race=COALESCE(incoming.race, p_fields->>'race', incoming.race_ethnicity, p_fields->>'race_ethnicity'),
    race_ethnicity=COALESCE(incoming.race_ethnicity, p_fields->>'race_ethnicity', incoming.race, p_fields->>'race'),
    veteran=COALESCE(incoming.veteran, p_fields->>'veteran', incoming.veteran_status, p_fields->>'veteran_status'),
    veteran_status=COALESCE(incoming.veteran_status, p_fields->>'veteran_status', incoming.veteran, p_fields->>'veteran'),
    disability=COALESCE(incoming.disability, p_fields->>'disability', incoming.disability_status, p_fields->>'disability_status'),
    disability_status=COALESCE(incoming.disability_status, p_fields->>'disability_status', incoming.disability, p_fields->>'disability'),
    authorized_in_usa=incoming.authorized_in_usa,need_sponsorship_now=incoming.need_sponsorship_now,need_sponsorship_future=incoming.need_sponsorship_future,
    current_employer=incoming.current_employer,current_job_title=incoming.current_job_title,employment_status=incoming.employment_status,
    total_experience_years=incoming.total_experience_years,relevant_experience_years=incoming.relevant_experience_years,
    notice_period=incoming.notice_period,available_to_join=incoming.available_to_join,interview_availability=incoming.interview_availability,
    open_to_relocation=incoming.open_to_relocation,preferred_work_type=incoming.preferred_work_type,preferred_locations=incoming.preferred_locations,
    current_salary=incoming.current_salary,expected_salary=incoming.expected_salary,employment_types=incoming.employment_types,
    highest_qualification=incoming.highest_qualification,university_name=incoming.university_name,graduation_year=incoming.graduation_year,
    target_job_titles=incoming.target_job_titles,primary_skills=incoming.primary_skills,secondary_skills=incoming.secondary_skills,
    certifications=incoming.certifications,is_active_bench=COALESCE(incoming.is_active_bench,false),notes=incoming.notes,provenance_status='confirmed',
    employment_history=COALESCE(incoming.employment_history,'[]'::jsonb),education_history=COALESCE(incoming.education_history,'[]'::jsonb),
    evidence=COALESCE(incoming.evidence,'[]'::jsonb),confirmed_facts=p_fields-'user_id'-'created_by'-'version'-'id'-'resume_url',
    version=version+1 WHERE id=result;
  RETURN result;
END; $$;
