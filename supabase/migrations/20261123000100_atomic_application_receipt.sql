BEGIN;

ALTER TABLE public.extension_submission_events
  ADD COLUMN intent_id uuid REFERENCES public.application_intents(id) ON DELETE SET NULL,
  ADD COLUMN posting_url text,
  ADD COLUMN receipt_source text;

CREATE SEQUENCE public.application_receipt_order;
ALTER TABLE public.extension_submission_events ADD COLUMN receipt_order bigint;
ALTER TABLE public.extension_submission_events ALTER COLUMN receipt_order SET DEFAULT nextval('public.application_receipt_order');
ALTER TABLE public.browser_capture_events ADD COLUMN receipt_order bigint;
ALTER TABLE public.browser_capture_events ALTER COLUMN receipt_order SET DEFAULT nextval('public.application_receipt_order');
ALTER TABLE public.job_submissions
  ADD COLUMN applied_resume_event_key uuid,
  ADD COLUMN applied_resume_receipt_order bigint;

CREATE FUNCTION public.save_application_receipt_resume(
  p_actor uuid, p_candidate uuid, p_submission uuid, p_event_key uuid, p_resume jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  submission public.job_submissions;
  archive_order bigint;
BEGIN
  IF NOT public.candidate_actor_can_access(p_actor, p_candidate)
     OR jsonb_typeof(p_resume) IS DISTINCT FROM 'object' OR p_resume ? 'base64' THEN
    RAISE EXCEPTION 'Invalid receipt resume';
  END IF;

  SELECT * INTO submission FROM public.job_submissions
    WHERE id = p_submission AND candidate_id = p_candidate FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission mismatch'; END IF;

  SELECT max(receipt_order) INTO archive_order FROM (
    SELECT COALESCE(event.receipt_order, 0) AS receipt_order FROM public.extension_submission_events event
      WHERE event.event_key = p_event_key AND event.submission_id = p_submission
        AND event.candidate_id = p_candidate AND event.actor_id = p_actor
    UNION ALL
    SELECT COALESCE(event.receipt_order, 0) FROM public.browser_capture_events event
      JOIN public.application_intents intent ON intent.id = event.intent_id
      WHERE event.event_key = p_event_key AND event.status = 'submitted'
        AND intent.submission_id = p_submission AND intent.candidate_id = p_candidate AND intent.owner_id = p_actor
  ) AS receipts;
  IF archive_order IS NULL THEN RAISE EXCEPTION 'Application receipt mismatch'; END IF;

  IF submission.applied_resume_event_key = p_event_key
     OR archive_order <= submission.applied_resume_receipt_order
     OR (archive_order = 0 AND submission.applied_resume IS NOT NULL
         AND submission.applied_resume <> 'null'::jsonb AND NOT (submission.applied_resume ? 'base64')) THEN
    RETURN submission.applied_resume;
  END IF;

  UPDATE public.job_submissions SET applied_resume = p_resume,
    applied_resume_event_key = p_event_key, applied_resume_receipt_order = archive_order
    WHERE id = p_submission;
  UPDATE public.outside_jobs SET applied_resume = p_resume
    WHERE submission_id = p_submission AND candidate_id = p_candidate AND capture_owner_id = p_actor;
  RETURN p_resume;
END;
$$;
REVOKE ALL ON FUNCTION public.save_application_receipt_resume(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_application_receipt_resume(uuid,uuid,uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION public.link_application_receipt_outside_jobs(
  p_actor uuid, p_candidate uuid, p_submission uuid, p_postings text[], p_observed timestamptz
) RETURNS void LANGUAGE sql SET search_path=public,pg_temp AS $$
  UPDATE public.outside_jobs AS outside
  SET submission_id = p_submission, candidate_id = COALESCE(outside.candidate_id, p_candidate),
      status = 'Applied',
      applied_at = COALESCE(outside.applied_at, p_observed), updated_at = now()
  WHERE (outside.submission_id = p_submission AND outside.candidate_id = p_candidate AND outside.status <> 'Applied')
    OR (outside.submission_id IS NULL AND (outside.candidate_id = p_candidate OR outside.candidate_id IS NULL)
      AND outside.capture_owner_id = p_actor AND outside.job_url = ANY(p_postings));
$$;
REVOKE ALL ON FUNCTION public.link_application_receipt_outside_jobs(uuid,uuid,uuid,text[],timestamptz) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.record_application_observation(
  p_actor uuid, p_intent uuid, p_key uuid, p_status text, p_attempt integer,
  p_source text, p_evidence text, p_url text, p_observed timestamptz, p_postings text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  intent public.application_intents;
  event public.browser_capture_events;
  next_status text;
BEGIN
  SELECT * INTO intent FROM public.application_intents WHERE id = p_intent AND owner_id = p_actor FOR UPDATE;
  IF NOT FOUND OR NOT public.candidate_actor_can_access(p_actor, intent.candidate_id) THEN
    RAISE EXCEPTION 'Intent access denied';
  END IF;
  next_status := public.record_browser_event(p_actor, p_intent, p_key, p_status, p_attempt, p_source, p_evidence, p_url, p_observed);
  SELECT * INTO STRICT event FROM public.browser_capture_events WHERE intent_id = p_intent AND event_key = p_key;
  IF event.status <> p_status OR event.source <> p_source THEN
    RAISE EXCEPTION 'Observation event key conflict';
  END IF;
  IF event.status = 'submitted' AND next_status IN ('submitted', 'confirmed') THEN
    PERFORM public.link_application_receipt_outside_jobs(p_actor, intent.candidate_id, intent.submission_id, p_postings, event.observed_at);
  END IF;
  RETURN jsonb_build_object('status', next_status, 'attempt', event.attempt, 'observed_at', event.observed_at);
END;
$$;
REVOKE ALL ON FUNCTION public.record_application_observation(uuid,uuid,uuid,text,integer,text,text,text,timestamptz,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_application_observation(uuid,uuid,uuid,text,integer,text,text,text,timestamptz,text[]) TO service_role;

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
  v_job_id uuid;
  v_intent_id uuid;
  v_intent public.application_intents;
  v_submission_id uuid;
  v_company text;
  v_title text;
  today date := CURRENT_DATE;
  duplicate boolean := false;
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
  is_portal boolean := false;
  v_postings text[];
  v_source text := COALESCE(p_fields->>'source', 'extension_observation');
BEGIN
  -- 1. Validate Actor and Candidate Access
  SELECT * INTO actor FROM public.profiles WHERE id = p_actor AND status = 'active';
  SELECT * INTO candidate FROM public.candidates WHERE id = p_candidate;
  IF actor.id IS NULL OR candidate.id IS NULL THEN
    RAISE EXCEPTION 'Active account and candidate required';
  END IF;
  IF NOT public.candidate_actor_can_access(p_actor, p_candidate) THEN
    RAISE EXCEPTION 'Candidate access denied';
  END IF;

  -- 2. Basic Field Extraction
  v_company := left(trim(COALESCE(p_fields->>'companyName', p_fields->>'company', '')), 200);
  v_title := left(trim(COALESCE(p_fields->>'jobTitle', p_fields->>'title', '')), 200);
  IF v_company = '' OR v_title = '' THEN
    RAISE EXCEPTION 'Company and job title are required';
  END IF;

  raw_job_url := left(COALESCE(p_fields->>'jobUrl', p_fields->>'job_url', ''), 2000);
  safe_job_url := NULLIF(trim(raw_job_url), '');

  v_portal_source := NULLIF(left(COALESCE(p_fields->>'portalSource', p_fields->>'portal_source', 'Outside Job'), 100), '');
  v_location := NULLIF(left(trim(COALESCE(p_fields->>'jobLocation', p_fields->>'location', '')), 200), '');
  v_department := NULLIF(left(trim(COALESCE(p_fields->>'department', '')), 100), '');
  v_emp_type := COALESCE(p_fields->>'employmentType', p_fields->>'employment_type', 'unknown');
  v_emp_type := CASE lower(v_emp_type)
    WHEN 'full-time' THEN 'permanent' WHEN 'part-time' THEN 'part_time' ELSE lower(v_emp_type) END;
  IF v_emp_type NOT IN ('contract', 'permanent', 'temporary', 'part_time', 'internship') THEN
    v_emp_type := 'unknown';
  END IF;

  v_notes := p_fields->>'notes';
  v_evidence := p_fields->>'evidence';
  v_final_notes := NULLIF(left(COALESCE(v_notes, v_evidence, 'Application captured by NextKin browser extension'), 1000), '');

  v_ats_analysis := NULLIF(p_fields->'atsAnalysis', 'null'::jsonb);
  v_answers := NULLIF(p_fields->'answers', 'null'::jsonb);
  v_compensation := NULLIF(p_fields->'compensation', 'null'::jsonb);
  v_arrangements := NULLIF(p_fields->'arrangements', 'null'::jsonb);

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

  -- Lock the event identity and serialize job/submission lookup by posting.
  IF p_event_key IS NULL OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 1000
     OR v_source NOT IN ('extension_observation', 'recruiter_attestation') THEN
    RAISE EXCEPTION 'Invalid submission event';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_key::text, 0));
  IF jsonb_typeof(p_fields->'postingKeys') = 'array' THEN
    SELECT array_agg(value) INTO v_postings FROM jsonb_array_elements_text(p_fields->'postingKeys');
  ELSE
    v_postings := ARRAY[safe_job_url];
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    COALESCE(lower(safe_job_url), jsonb_build_array(lower(v_company), lower(v_title))::text), 1
  ));

  SELECT * INTO existing FROM public.extension_submission_events WHERE event_key = p_event_key;
  IF FOUND THEN
    IF existing.actor_id <> p_actor OR existing.candidate_id <> p_candidate THEN
      RAISE EXCEPTION 'Submission event key conflict';
    END IF;
    SELECT * INTO submission FROM public.job_submissions WHERE id = existing.submission_id;
    IF (existing.receipt_source IS NOT NULL AND existing.posting_url IS DISTINCT FROM safe_job_url)
       OR (existing.receipt_source IS NOT NULL AND existing.receipt_source <> v_source)
       OR (existing.receipt_source IS NULL AND lower(trim(safe_job_url)) IS DISTINCT FROM lower(trim(submission.job_url))) THEN
      RAISE EXCEPTION 'Submission event key conflict';
    END IF;
    IF submission.status = 'Draft' OR COALESCE(submission.capture_status, '') NOT IN ('submitted', 'confirmed') THEN
      UPDATE public.job_submissions SET
        status = CASE WHEN status = 'Draft' THEN 'Applied'::public.submission_status ELSE status END,
        capture_status = CASE WHEN capture_status = 'confirmed' THEN 'confirmed' ELSE 'submitted' END
      WHERE id = submission.id RETURNING * INTO submission;
    END IF;
    PERFORM public.link_application_receipt_outside_jobs(p_actor, p_candidate, submission.id, ARRAY[safe_job_url], existing.created_at);

    RETURN jsonb_build_object(
      'submission', to_jsonb(submission), 'duplicate', true,
      'code', 'IDEMPOTENT_SUBMISSION_EXISTS', 'replayed', true,
      'attempt', existing.attempt, 'observed_at', existing.created_at, 'intent_id', existing.intent_id
    );
  END IF;

  -- Adopt a receipt previously written by versions that used the event key as the row ID.
  SELECT * INTO existing_sub FROM public.job_submissions WHERE id = p_event_key;
  IF FOUND THEN
    IF existing_sub.candidate_id <> p_candidate OR existing_sub.job_url IS DISTINCT FROM safe_job_url THEN
      RAISE EXCEPTION 'Submission event key conflict';
    END IF;
    v_submission_id := existing_sub.id;
  END IF;

  -- 4. Check Portal Intent if provided
  IF p_fields ? 'intentId' AND p_fields->>'intentId' IS NOT NULL AND trim(p_fields->>'intentId') <> '' THEN
    v_intent_id := (p_fields->>'intentId')::uuid;
    SELECT * INTO v_intent FROM public.application_intents WHERE id = v_intent_id AND owner_id = p_actor AND candidate_id = p_candidate FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Intent access denied'; END IF;
    IF v_submission_id IS NOT NULL AND v_submission_id <> v_intent.submission_id THEN
      RAISE EXCEPTION 'Submission event key conflict';
    END IF;
    v_submission_id := v_intent.submission_id;
    UPDATE public.application_intents SET attempt = GREATEST(attempt, p_attempt) WHERE id = v_intent_id;
    INSERT INTO public.browser_capture_events(intent_id, event_key, status, attempt, source, evidence, url, observed_at)
    VALUES(
      v_intent_id, p_event_key, 'submitted', p_attempt,
      v_source,
      COALESCE(v_evidence, 'Application submitted'),
      safe_job_url, now()
    ) ON CONFLICT (intent_id, event_key) DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'Submission event key conflict'; END IF;
  END IF;

  -- 5. Resolve or create Job record in public.jobs
  v_description := COALESCE(p_fields->>'jobDescription', p_fields->>'description', 'Job description captured from ' || v_company || ' career portal');
  v_description_html := COALESCE(p_fields->>'jobDescriptionHtml', p_fields->>'description_html', '');
  v_content_hash := md5(COALESCE(v_description, v_title || v_company));
  v_ext_id := COALESCE(p_fields->>'externalId', 'ext_' || md5(COALESCE(safe_job_url, v_company || v_title)));

  IF safe_job_url IS NOT NULL THEN
    SELECT id INTO v_job_id FROM public.jobs WHERE lower(trim(application_url)) = lower(trim(safe_job_url)) LIMIT 1;
  END IF;

  IF v_intent.id IS NOT NULL THEN
    v_job_id := v_intent.job_id;
  ELSIF v_job_id IS NULL AND safe_job_url IS NULL THEN
    SELECT id INTO v_job_id FROM public.jobs WHERE lower(trim(public.jobs.company)) = lower(trim(v_company)) AND lower(trim(public.jobs.title)) = lower(trim(v_title)) LIMIT 1;
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
      NULL, v_ext_id, v_title, v_company,
      COALESCE(safe_job_url, 'https://careers.external.invalid/' || v_ext_id),
      COALESCE(safe_job_url, 'https://careers.external.invalid/' || v_ext_id),
      v_location, v_department,
      v_description, v_description_html, v_emp_type,
      v_content_hash, true, v_portal_source, 'active'
    ) RETURNING id INTO v_job_id;
  END IF;

  -- 6. Check for duplicate submission within 30 days
  SELECT EXISTS(
    SELECT 1 FROM public.job_submissions
    WHERE candidate_id = p_candidate
      AND lower(trim(company_name)) = lower(trim(v_company))
      AND lower(trim(job_title)) = lower(trim(v_title))
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
      status = CASE WHEN status = 'Draft' THEN 'Applied'::public.submission_status ELSE status END,
      capture_status = CASE WHEN capture_status = 'confirmed' THEN 'confirmed' ELSE 'submitted' END,
      submission_date = CASE WHEN status = 'Draft' THEN today ELSE submission_date END,
      notes = COALESCE(v_final_notes, notes),
      source_type = 'extension',
      job_id = COALESCE(job_id, v_job_id)
    WHERE id = v_submission_id
    RETURNING * INTO submission;
  ELSE
    INSERT INTO public.job_submissions(
      id, candidate_id, company_name, job_title, job_url, portal_source,
      job_location, job_id, status, capture_status, duplicate_flag,
      submission_date, notes, source_type
    ) VALUES (
      p_event_key, p_candidate, v_company, v_title, safe_job_url, v_portal_source,
      v_location, v_job_id, 'Applied', 'submitted', duplicate,
      today, v_final_notes, 'extension'
    ) RETURNING * INTO submission;
  END IF;

  -- 9. Record event in extension_submission_events
  INSERT INTO public.extension_submission_events(event_key, actor_id, candidate_id, submission_id, attempt, intent_id, posting_url, receipt_source)
  VALUES(p_event_key, p_actor, p_candidate, submission.id, p_attempt, v_intent_id, safe_job_url, v_source)
  RETURNING * INTO existing;

  -- 10. Write to outside_jobs (Atomic Part 2)
  IF safe_job_url IS NOT NULL THEN
    is_portal := (safe_job_url ~* '^https?://([^/]+\.)?(nextkinhr\.com|jobright-internal\.com)(/.*)?$');
  END IF;

  IF NOT is_portal AND v_intent_id IS NULL AND safe_job_url IS NOT NULL THEN
    INSERT INTO public.outside_jobs (
      candidate_id, submission_id, capture_owner_id, title, company,
      job_url, portal_source, location, department, employment_type,
      description, description_html, match_score, matched_skills,
      missing_skills, extracted_skills, ats_analysis, answers,
      status, applied_at, updated_at,
      external_id, application_url, compensation, arrangements
    ) VALUES (
      p_candidate,
      submission.id,
      p_actor,
      v_title,
      v_company,
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
      applied_at = COALESCE(outside_jobs.applied_at, EXCLUDED.applied_at),
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
      compensation = COALESCE(EXCLUDED.compensation, outside_jobs.compensation),
      arrangements = COALESCE(EXCLUDED.arrangements, outside_jobs.arrangements)
      WHERE (outside_jobs.candidate_id = EXCLUDED.candidate_id
             AND (outside_jobs.submission_id IS NULL OR outside_jobs.submission_id = EXCLUDED.submission_id))
        OR (outside_jobs.candidate_id IS NULL AND outside_jobs.submission_id IS NULL);
    IF NOT FOUND THEN RAISE EXCEPTION 'Outside Jobs candidate conflict for this posting'; END IF;

  END IF;

  PERFORM public.link_application_receipt_outside_jobs(p_actor, p_candidate, submission.id, v_postings, existing.created_at);

  RETURN jsonb_build_object(
    'submission', to_jsonb(submission),
    'duplicate', duplicate,
    'code', null,
    'replayed', false,
    'job_id', v_job_id, 'attempt', existing.attempt,
    'observed_at', existing.created_at, 'intent_id', existing.intent_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_extension_submission(uuid, uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_extension_submission(uuid, uuid, uuid, integer, jsonb) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
