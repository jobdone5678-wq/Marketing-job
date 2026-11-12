-- Migration: 20261112000200_update_record_extension_submission_source_type.sql
-- Updates record_extension_submission to set source_type='extension' for extension-captured applications

CREATE OR REPLACE FUNCTION public.record_extension_submission(
  p_actor uuid, p_candidate uuid, p_event_key uuid, p_attempt integer, p_fields jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor public.profiles;
  candidate public.candidates;
  existing public.extension_submission_events;
  submission public.job_submissions;
  v_job public.jobs;
  v_job_id uuid;
  company text;
  title text;
  today date;
  duplicate boolean;
  applied_res jsonb;
  raw_job_url text;
  safe_job_url text;
  v_description text;
  v_description_html text;
  v_emp_type text;
  v_content_hash text;
  v_ext_id text;
  v_portal_source text;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id = p_actor AND status = 'active';
  SELECT * INTO candidate FROM public.candidates WHERE id = p_candidate;
  IF actor.id IS NULL OR candidate.id IS NULL OR p_attempt < 1 THEN
    RAISE EXCEPTION 'Active account and candidate required';
  END IF;
  IF NOT public.candidate_actor_can_access(p_actor, p_candidate) THEN
    RAISE EXCEPTION 'Candidate access denied';
  END IF;

  company := left(trim(COALESCE(p_fields->>'companyName', '')), 200);
  title := left(trim(COALESCE(p_fields->>'jobTitle', '')), 200);
  IF company = '' OR title = '' THEN
    RAISE EXCEPTION 'Company and job title are required';
  END IF;

  raw_job_url := left(COALESCE(p_fields->>'jobUrl', ''), 2000);
  safe_job_url := NULLIF(trim(raw_job_url), '');
  v_portal_source := NULLIF(left(COALESCE(p_fields->>'portalSource', 'Outside Application'), 100), '');

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_key::text, 0));
  SELECT * INTO existing FROM public.extension_submission_events WHERE event_key = p_event_key;
  IF FOUND THEN
    IF existing.actor_id <> p_actor OR existing.candidate_id <> p_candidate THEN
      RAISE EXCEPTION 'Submission event key conflict';
    END IF;
    SELECT id INTO submission FROM public.job_submissions WHERE id = existing.submission_id;
    applied_res := COALESCE(p_fields->'appliedResume', p_fields->'applied_resume');
    IF submission.applied_resume IS NULL AND applied_res IS NOT NULL THEN
      UPDATE public.job_submissions SET applied_resume = applied_res WHERE id = submission RETURNING * INTO submission;
    END IF;
    RETURN jsonb_build_object('submission', to_jsonb(submission), 'duplicate', submission.duplicate_flag, 'replayed', true);
  END IF;

  v_description := COALESCE(p_fields->>'jobDescription', p_fields->>'description', 'Job description captured from ' || company || ' career portal');
  v_description_html := COALESCE(p_fields->>'jobDescriptionHtml', p_fields->>'description_html', '');
  v_emp_type := COALESCE(p_fields->>'employmentType', 'unknown');
  IF v_emp_type NOT IN ('contract', 'permanent', 'temporary', 'part_time', 'internship', 'unknown') THEN
    v_emp_type := 'unknown';
  END IF;
  v_content_hash := md5(COALESCE(v_description, title || company));
  v_ext_id := COALESCE(p_fields->>'externalId', 'ext_' || md5(COALESCE(safe_job_url, company || title)));

  IF safe_job_url IS NOT NULL THEN
    SELECT id INTO v_job_id FROM public.jobs WHERE lower(trim(application_url)) = lower(trim(safe_job_url)) LIMIT 1;
  END IF;

  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id FROM public.jobs WHERE lower(trim(public.jobs.company)) = lower(trim(company)) AND lower(trim(public.jobs.title)) = lower(trim(title)) LIMIT 1;
  END IF;

  IF v_job_id IS NOT NULL THEN
    UPDATE public.jobs SET
      description = CASE WHEN length(public.jobs.description) < 50 AND length(v_description) >= 50 THEN v_description ELSE public.jobs.description END,
      description_html = CASE WHEN public.jobs.description_html = '' AND v_description_html <> '' THEN v_description_html ELSE public.jobs.description_html END,
      location = COALESCE(public.jobs.location, NULLIF(left(trim(p_fields->>'jobLocation'), 200), '')),
      last_seen_at = now()
    WHERE id = v_job_id;
  ELSE
    INSERT INTO public.jobs (
      source_id, external_id, title, company, source_url, application_url,
      location, department, description, description_html, employment_type,
      content_hash, is_external, portal_source, state
    ) VALUES (
      NULL, v_ext_id, title, company,
      COALESCE(safe_job_url, 'https://careers.external.invalid'),
      COALESCE(safe_job_url, 'https://careers.external.invalid'),
      NULLIF(left(p_fields->>'jobLocation', 200), ''),
      NULLIF(left(p_fields->>'department', 100), ''),
      v_description, v_description_html, v_emp_type,
      v_content_hash, true, v_portal_source, 'active'
    ) RETURNING id INTO v_job_id;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.job_submissions
    WHERE candidate_id = p_candidate
      AND lower(trim(company_name)) = lower(trim(company))
      AND lower(trim(job_title)) = lower(trim(title))
      AND submission_date >= today - 30
  ) INTO duplicate;

  applied_res := COALESCE(p_fields->'appliedResume', p_fields->'applied_resume');

  INSERT INTO public.job_submissions(
    candidate_id, company_name, job_title, job_url, portal_source,
    job_location, job_id, status, capture_status, duplicate_flag,
    submission_date, notes, applied_resume, source_type
  ) VALUES (
    p_candidate, company, title, safe_job_url, v_portal_source,
    NULLIF(left(p_fields->>'jobLocation', 200), ''), v_job_id, 'Applied', 'submitted', duplicate,
    today, NULLIF(left(COALESCE(p_fields->>'notes', p_fields->>'evidence', 'Application captured by NextKin browser extension'), 1000), ''), applied_res, 'extension'
  ) RETURNING * INTO submission;

  INSERT INTO public.extension_submission_events(event_key, actor_id, candidate_id, submission_id, attempt)
  VALUES(p_event_key, p_actor, p_candidate, submission.id, p_attempt);

  RETURN jsonb_build_object(
    'submission', to_jsonb(submission),
    'duplicate', duplicate,
    'replayed', false,
    'job_id', v_job_id
  );
END;
$$;