-- Migration: 20261120160000_atomic_submission_dual_write.sql
-- Atomically writes job_submissions and outside_jobs within a single database transaction.
-- Enforces candidate ownership validation against trusted authenticated actor.
-- Enforces idempotent event handling returning code 'IDEMPOTENT_SUBMISSION_EXISTS'.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_extension_submission(
  p_actor uuid,
  p_candidate uuid,
  p_event_key uuid,
  p_attempt integer,
  p_fields jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor public.profiles;
  candidate public.candidates;
  existing public.extension_submission_events;
  existing_sub public.job_submissions;
  submission public.job_submissions;
  v_job public.jobs;
  v_job_id uuid;
  v_intent_id uuid;
  v_intent public.application_intents;
  v_submission_id uuid;
  company text;
  title text;
  today date := CURRENT_DATE;
  duplicate boolean := false;
  applied_res jsonb;
  raw_job_url text;
  safe_job_url text;
  v_description text;
  v_description_html text;
  v_emp_type text;
  v_content_hash text;
  v_ext_id text;
  v_portal_source text;
  v_final_notes text;
  v_notes text;
  v_evidence text;
  v_match_score numeric;
  v_matched_skills text[];
  v_missing_skills text[];
  v_extracted_skills text[];
  v_ats_analysis jsonb;
  v_answers jsonb;
  v_compensation jsonb;
  v_arrangements jsonb;
  v_location text;
  v_department text;
  v_confirmation_url text;
  is_portal boolean := false;
BEGIN
  -- 1. Validate Actor and Candidate Access
  SELECT * INTO actor FROM public.profiles WHERE id = p_actor AND status = 'active';
  SELECT * INTO candidate FROM public.candidates WHERE id = p_candidate;
  IF actor.id IS NULL OR candidate.id IS NULL OR p_attempt < 1 THEN
    RAISE EXCEPTION 'Active account and candidate required';
  END IF;
  IF NOT public.candidate_actor_can_access(p_actor, p_candidate) THEN
    RAISE EXCEPTION 'Candidate access denied';
  END IF;

  -- 2. Basic Field Extraction
  company := left(trim(COALESCE(p_fields->>'companyName', p_fields->>'company', '')), 200);
  title := left(trim(COALESCE(p_fields->>'jobTitle', p_fields->>'title', '')), 200);
  IF company = '' OR title = '' THEN
    RAISE EXCEPTION 'Company and job title are required';
  END IF;

  raw_job_url := left(COALESCE(p_fields->>'jobUrl', p_fields->>'job_url', ''), 2000);
  safe_job_url := NULLIF(trim(raw_job_url), '');
  v_confirmation_url := NULLIF(trim(left(COALESCE(p_fields->>'confirmationUrl', p_fields->>'confirmation_url', ''), 2000)), '');

  v_portal_source := NULLIF(left(COALESCE(p_fields->>'portalSource', p_fields->>'portal_source', 'Outside Job'), 100), '');
  v_location := NULLIF(left(trim(COALESCE(p_fields->>'jobLocation', p_fields->>'location', '')), 200), '');
  v_department := NULLIF(left(trim(COALESCE(p_fields->>'department', '')), 100), '');
  v_emp_type := COALESCE(p_fields->>'employmentType', p_fields->>'employment_type', 'unknown');
  IF v_emp_type NOT IN ('contract', 'permanent', 'temporary', 'part_time', 'internship', 'Full-time', 'Part-time', 'Contract') THEN
    v_emp_type := 'unknown';
  END IF;

  v_notes := p_fields->>'notes';
  v_evidence := p_fields->>'evidence';
  v_final_notes := NULLIF(left(COALESCE(v_notes, v_evidence, 'Application captured by NextKin browser extension'), 1000), '');

  applied_res := COALESCE(p_fields->'appliedResume', p_fields->'applied_resume');
  v_ats_analysis := CASE WHEN p_fields ? 'atsAnalysis' THEN p_fields->'atsAnalysis' ELSE NULL END;
  v_answers := CASE WHEN p_fields ? 'answers' THEN p_fields->'answers' ELSE NULL END;
  v_compensation := CASE WHEN p_fields ? 'compensation' THEN p_fields->'compensation' ELSE NULL END;
  v_arrangements := CASE WHEN p_fields ? 'arrangements' THEN p_fields->'arrangements' ELSE NULL END;

  IF (p_fields->>'matchScore') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    v_match_score := (p_fields->>'matchScore')::numeric;
  ELSE
    v_match_score := NULL;
  END IF;

  IF jsonb_typeof(p_fields->'matchedSkills') = 'array' THEN
    SELECT COALESCE(array_agg(elem), '{}') INTO v_matched_skills FROM jsonb_array_elements_text(p_fields->'matchedSkills') AS elem;
  ELSE
    v_matched_skills := '{}';
  END IF;

  IF jsonb_typeof(p_fields->'missingSkills') = 'array' THEN
    SELECT COALESCE(array_agg(elem), '{}') INTO v_missing_skills FROM jsonb_array_elements_text(p_fields->'missingSkills') AS elem;
  ELSE
    v_missing_skills := '{}';
  END IF;

  IF jsonb_typeof(p_fields->'extractedSkills') = 'array' THEN
    SELECT COALESCE(array_agg(elem), '{}') INTO v_extracted_skills FROM jsonb_array_elements_text(p_fields->'extractedSkills') AS elem;
  ELSE
    v_extracted_skills := '{}';
  END IF;

  -- 3. Idempotency Check with Advisory Lock on event key
  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_key::text, 0));

  SELECT * INTO existing FROM public.extension_submission_events WHERE event_key = p_event_key;
  IF FOUND THEN
    IF existing.actor_id <> p_actor OR existing.candidate_id <> p_candidate THEN
      RAISE EXCEPTION 'Submission event key conflict';
    END IF;
    SELECT * INTO submission FROM public.job_submissions WHERE id = existing.submission_id;
    IF submission.applied_resume IS NULL AND applied_res IS NOT NULL THEN
      UPDATE public.job_submissions SET applied_resume = applied_res WHERE id = submission.id RETURNING * INTO submission;
    END IF;
    -- Ensure outside_jobs row is marked Applied
    UPDATE public.outside_jobs SET
      status = 'Applied',
      applied_at = COALESCE(applied_at, now()),
      updated_at = now(),
      submission_id = submission.id
    WHERE (submission_id = submission.id OR (capture_owner_id = p_actor AND job_url = safe_job_url))
      AND status <> 'Applied';

    RETURN jsonb_build_object(
      'submission', to_jsonb(submission),
      'duplicate', true,
      'code', 'IDEMPOTENT_SUBMISSION_EXISTS',
      'replayed', true
    );
  END IF;

  -- Check if job_submissions already has a record with id = p_event_key
  SELECT * INTO existing_sub FROM public.job_submissions WHERE id = p_event_key;
  IF existing_sub.id IS NOT NULL THEN
    IF existing_sub.candidate_id <> p_candidate THEN
      RAISE EXCEPTION 'Submission event key conflict';
    END IF;
    INSERT INTO public.extension_submission_events(event_key, actor_id, candidate_id, submission_id, attempt)
    VALUES(p_event_key, p_actor, p_candidate, existing_sub.id, p_attempt)
    ON CONFLICT (event_key) DO NOTHING;

    RETURN jsonb_build_object(
      'submission', to_jsonb(existing_sub),
      'duplicate', true,
      'code', 'IDEMPOTENT_SUBMISSION_EXISTS',
      'replayed', true
    );
  END IF;

  -- 4. Check Portal Intent if provided
  IF p_fields ? 'intentId' AND p_fields->>'intentId' IS NOT NULL AND trim(p_fields->>'intentId') <> '' THEN
    v_intent_id := (p_fields->>'intentId')::uuid;
    SELECT * INTO v_intent FROM public.application_intents WHERE id = v_intent_id AND owner_id = p_actor FOR UPDATE;
    IF FOUND THEN
      v_submission_id := v_intent.submission_id;
      UPDATE public.application_intents SET attempt = GREATEST(attempt, p_attempt) WHERE id = v_intent_id;
      INSERT INTO public.browser_capture_events(intent_id, event_key, status, attempt, source, evidence, url, observed_at)
      VALUES(
        v_intent_id, p_event_key, 'submitted', p_attempt,
        COALESCE(p_fields->>'source', 'extension_observation'),
        COALESCE(v_evidence, 'Application submitted'),
        safe_job_url, now()
      ) ON CONFLICT (intent_id, event_key) DO NOTHING;
    END IF;
  END IF;

  -- 5. Resolve or create Job record in public.jobs
  v_description := COALESCE(p_fields->>'jobDescription', p_fields->>'description', 'Job description captured from ' || company || ' career portal');
  v_description_html := COALESCE(p_fields->>'jobDescriptionHtml', p_fields->>'description_html', '');
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
      location = COALESCE(public.jobs.location, v_location),
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
      v_location, v_department,
      v_description, v_description_html, v_emp_type,
      v_content_hash, true, v_portal_source, 'active'
    ) RETURNING id INTO v_job_id;
  END IF;

  -- 6. Check for duplicate submission within 30 days
  SELECT EXISTS(
    SELECT 1 FROM public.job_submissions
    WHERE candidate_id = p_candidate
      AND lower(trim(company_name)) = lower(trim(company))
      AND lower(trim(job_title)) = lower(trim(title))
      AND submission_date >= today - 30
  ) INTO duplicate;

  -- 7. Find existing submission draft if not already resolved from intent
  IF v_submission_id IS NULL AND safe_job_url IS NOT NULL THEN
    SELECT id INTO v_submission_id FROM public.job_submissions
    WHERE candidate_id = p_candidate
      AND lower(trim(job_url)) = lower(trim(safe_job_url))
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- 8. Write to job_submissions (Atomic Part 1)
  IF v_submission_id IS NOT NULL THEN
    UPDATE public.job_submissions SET
      status = CASE WHEN status = 'Draft' OR v_confirmation_url IS NULL THEN 'Applied'::public.submission_status ELSE status END,
      capture_status = 'submitted',
      submission_date = CASE WHEN status = 'Draft' THEN today ELSE submission_date END,
      notes = COALESCE(v_final_notes, notes),
      source_type = 'extension',
      job_id = COALESCE(job_id, v_job_id),
      applied_resume = COALESCE(applied_res, applied_resume)
    WHERE id = v_submission_id
    RETURNING * INTO submission;
  ELSE
    INSERT INTO public.job_submissions(
      id, candidate_id, company_name, job_title, job_url, portal_source,
      job_location, job_id, status, capture_status, duplicate_flag,
      submission_date, notes, applied_resume, source_type
    ) VALUES (
      p_event_key, p_candidate, company, title, safe_job_url, v_portal_source,
      v_location, v_job_id, 'Applied', 'submitted', duplicate,
      today, v_final_notes, applied_res, 'extension'
    ) RETURNING * INTO submission;
  END IF;

  -- 9. Record event in extension_submission_events
  INSERT INTO public.extension_submission_events(event_key, actor_id, candidate_id, submission_id, attempt)
  VALUES(p_event_key, p_actor, p_candidate, submission.id, p_attempt)
  ON CONFLICT (event_key) DO NOTHING;

  -- 10. Write to outside_jobs (Atomic Part 2)
  IF safe_job_url IS NOT NULL THEN
    is_portal := (safe_job_url ~* '^https?://([^/]+\.)?(nextkinhr\.com|jobright-internal\.com)(/.*)?$');
  END IF;

  IF NOT is_portal AND safe_job_url IS NOT NULL THEN
    INSERT INTO public.outside_jobs (
      candidate_id, submission_id, capture_owner_id, title, company,
      job_url, portal_source, location, department, employment_type,
      description, description_html, match_score, matched_skills,
      missing_skills, extracted_skills, ats_analysis, answers,
      applied_resume, status, applied_at, updated_at,
      external_id, application_url, compensation, arrangements
    ) VALUES (
      p_candidate,
      submission.id,
      p_actor,
      title,
      company,
      safe_job_url,
      v_portal_source,
      v_location,
      v_department,
      COALESCE(p_fields->>'employmentType', p_fields->>'employment_type', 'Full-time'),
      v_description,
      v_description_html,
      v_match_score,
      v_matched_skills,
      v_missing_skills,
      v_extracted_skills,
      v_ats_analysis,
      v_answers,
      applied_res,
      'Applied',
      now(),
      now(),
      v_ext_id,
      safe_job_url,
      v_compensation,
      v_arrangements
    )
    ON CONFLICT (capture_owner_id, job_url) DO UPDATE SET
      submission_id = EXCLUDED.submission_id,
      candidate_id = EXCLUDED.candidate_id,
      status = 'Applied',
      applied_at = now(),
      updated_at = now(),
      title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE outside_jobs.title END,
      company = CASE WHEN EXCLUDED.company <> '' THEN EXCLUDED.company ELSE outside_jobs.company END,
      portal_source = COALESCE(EXCLUDED.portal_source, outside_jobs.portal_source),
      location = COALESCE(EXCLUDED.location, outside_jobs.location),
      department = COALESCE(EXCLUDED.department, outside_jobs.department),
      employment_type = COALESCE(EXCLUDED.employment_type, outside_jobs.employment_type),
      description = CASE WHEN length(COALESCE(EXCLUDED.description, '')) >= length(COALESCE(outside_jobs.description, '')) THEN EXCLUDED.description ELSE outside_jobs.description END,
      description_html = CASE WHEN length(COALESCE(EXCLUDED.description_html, '')) >= length(COALESCE(outside_jobs.description_html, '')) THEN EXCLUDED.description_html ELSE outside_jobs.description_html END,
      match_score = COALESCE(EXCLUDED.match_score, outside_jobs.match_score),
      matched_skills = CASE WHEN cardinality(EXCLUDED.matched_skills) > 0 THEN EXCLUDED.matched_skills ELSE outside_jobs.matched_skills END,
      missing_skills = CASE WHEN cardinality(EXCLUDED.missing_skills) > 0 THEN EXCLUDED.missing_skills ELSE outside_jobs.missing_skills END,
      extracted_skills = CASE WHEN cardinality(EXCLUDED.extracted_skills) > 0 THEN EXCLUDED.extracted_skills ELSE outside_jobs.extracted_skills END,
      ats_analysis = COALESCE(EXCLUDED.ats_analysis, outside_jobs.ats_analysis),
      answers = COALESCE(EXCLUDED.answers, outside_jobs.answers),
      applied_resume = COALESCE(EXCLUDED.applied_resume, outside_jobs.applied_resume),
      compensation = COALESCE(EXCLUDED.compensation, outside_jobs.compensation),
      arrangements = COALESCE(EXCLUDED.arrangements, outside_jobs.arrangements);

    UPDATE public.outside_jobs SET
      status = 'Applied',
      applied_at = COALESCE(applied_at, now()),
      updated_at = now()
    WHERE submission_id = submission.id AND status <> 'Applied';
  END IF;

  RETURN jsonb_build_object(
    'submission', to_jsonb(submission),
    'duplicate', duplicate,
    'code', null,
    'replayed', false,
    'job_id', v_job_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_extension_submission(uuid, uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_extension_submission(uuid, uuid, uuid, integer, jsonb) TO service_role;

-- Alias function for submission events
CREATE OR REPLACE FUNCTION public.record_application_submission(
  p_actor uuid,
  p_candidate uuid,
  p_event_key uuid,
  p_attempt integer,
  p_fields jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  RETURN public.record_extension_submission(p_actor, p_candidate, p_event_key, p_attempt, p_fields);
END;
$$;

REVOKE ALL ON FUNCTION public.record_application_submission(uuid, uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_application_submission(uuid, uuid, uuid, integer, jsonb) TO service_role;

COMMIT;
