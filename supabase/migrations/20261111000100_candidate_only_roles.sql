-- Candidate-only accounts.
--
-- The workspace has a single account role: candidate. This migration retires the
-- super admin / recruiter / technical recruiter roles, drops the staff-only
-- schema, and rewrites every role-dependent policy and function so that a
-- candidate can only ever reach their own records.

BEGIN;

-- 1. Drop every policy whose expression reads a role. A column used by a policy
--    cannot be retyped, and the enum cannot be dropped while policies depend on
--    it. Each of these is recreated candidate-only further down.
DROP POLICY IF EXISTS admin_audit ON public.audit_events;
DROP POLICY IF EXISTS private_documents ON public.candidate_documents;
DROP POLICY IF EXISTS candidate_owner_insert ON public.candidates;
DROP POLICY IF EXISTS candidate_owner_update ON public.candidates;
DROP POLICY IF EXISTS candidate_owner_reads ON public.candidates;
DROP POLICY IF EXISTS "Clients can only view their own candidate profile" ON public.candidates;
DROP POLICY IF EXISTS candidate_assignment_reads ON public.candidates;
DROP POLICY IF EXISTS own_confirmation_events ON public.email_confirmation_events;
DROP POLICY IF EXISTS own_email_connections ON public.email_connections;
DROP POLICY IF EXISTS own_email_receipts ON public.email_receipts;
DROP POLICY IF EXISTS credential_reads ON public.extension_credentials;
DROP POLICY IF EXISTS requirement_reads ON public.job_requirements;
DROP POLICY IF EXISTS source_reads ON public.job_sources;
DROP POLICY IF EXISTS assigned_staff_submission_access ON public.job_submissions;
DROP POLICY IF EXISTS "Clients can view their own submissions" ON public.job_submissions;
DROP POLICY IF EXISTS job_reads ON public.jobs;
DROP POLICY IF EXISTS scoped_profiles ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS admin_usage ON public.provider_usage;
DROP POLICY IF EXISTS private_extractions ON public.resume_extractions;
DROP POLICY IF EXISTS service_enrollment_view ON public.service_enrollments;
DROP POLICY IF EXISTS sync_reads ON public.source_sync_runs;
DROP POLICY IF EXISTS match_reads ON public.candidate_matches;
DROP POLICY IF EXISTS packet_reads ON public.submission_packets;
DROP POLICY IF EXISTS intent_reads ON public.application_intents;
DROP POLICY IF EXISTS event_reads ON public.browser_capture_events;
DROP POLICY IF EXISTS answer_snapshot_reads ON public.application_answer_snapshots;
DROP POLICY IF EXISTS own_tasks ON public.background_tasks;
DROP POLICY IF EXISTS private_resume_reads ON storage.objects;
DROP POLICY IF EXISTS outside_jobs_select ON public.outside_jobs;
DROP POLICY IF EXISTS outside_jobs_insert ON public.outside_jobs;
DROP POLICY IF EXISTS outside_jobs_update ON public.outside_jobs;
DROP POLICY IF EXISTS candidate_outside_jobs ON public.outside_jobs;

-- The candidate-share and RTR tables arrived after the operations bundle, so
-- their policies are dropped only when those tables are present.
DO $$
BEGIN
  IF to_regclass('public.candidate_shares') IS NOT NULL THEN
    DROP POLICY IF EXISTS candidate_shares_admin_select ON public.candidate_shares;
    DROP POLICY IF EXISTS candidate_shares_delete ON public.candidate_shares;
    DROP POLICY IF EXISTS candidate_shares_update ON public.candidate_shares;
  END IF;
  IF to_regclass('public.rtr_documents') IS NOT NULL THEN
    DROP POLICY IF EXISTS rtr_candidate_read ON public.rtr_documents;
    DROP POLICY IF EXISTS rtr_documents_staff_access ON public.rtr_documents;
    DROP POLICY IF EXISTS rtr_staff_read ON public.rtr_documents;
  END IF;
END $$;

-- 2. Drop the staff-only schema. These tables carry role-typed columns and
--    trigger functions, so they go before the enum is replaced.
DROP TRIGGER IF EXISTS maintain_placement_commission ON public.placements;
DROP TRIGGER IF EXISTS sync_placement_commission ON public.placements;
DROP TRIGGER IF EXISTS enforce_submission_attribution ON public.job_submissions;
DROP TRIGGER IF EXISTS enforce_placement_lifecycle ON public.placements;

-- Staff-only functions. Each is either dropped outright or replaced with a
-- candidate-only equivalent further down.
DROP FUNCTION IF EXISTS public.sync_placement_commission();
DROP FUNCTION IF EXISTS public.adjust_placement_month(uuid,uuid,uuid,numeric,text,text,text);
DROP FUNCTION IF EXISTS public.decide_placement_commission(uuid,uuid,text,text);
DROP FUNCTION IF EXISTS public.recruiting_operations_totals(uuid);
DROP FUNCTION IF EXISTS public.create_service_enrollment(uuid,uuid,date,date,numeric,text);
DROP FUNCTION IF EXISTS public.record_service_receipt(uuid,uuid,numeric,text,date,text,text,uuid,text);
DROP FUNCTION IF EXISTS public.end_service_enrollment(uuid,uuid,date,text);
DROP FUNCTION IF EXISTS public.guard_submission_attribution();
DROP FUNCTION IF EXISTS public.validate_placement_lifecycle();
DROP FUNCTION IF EXISTS public.service_collection_totals(uuid);

DROP TABLE IF EXISTS public.candidate_staff_assignments;
DROP TABLE IF EXISTS public.oauth_registration_intents;

-- 3. Retire the staff roles from the enum. The enum keeps its name so the
--    existing column and helper functions stay valid.
DROP FUNCTION IF EXISTS public.register_new_oauth_staff(uuid,public.app_role,uuid);
DROP FUNCTION IF EXISTS public.correct_staff_account_role(uuid,uuid,public.app_role,text);
DROP FUNCTION IF EXISTS public.set_candidate_staff_assignment(uuid,uuid,text,boolean);
DROP FUNCTION IF EXISTS public.get_current_role();

ALTER TYPE public.app_role RENAME TO app_role_legacy;
CREATE TYPE public.app_role AS ENUM ('candidate');

-- 4. Every existing account becomes a candidate. No row may keep a staff role.
UPDATE public.profiles SET role = 'candidate'::public.app_role_legacy WHERE role <> 'candidate'::public.app_role_legacy;

-- 5. Point the role column at the new enum.
ALTER TABLE public.profiles
  ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'candidate';
ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;

DROP TYPE public.app_role_legacy;

-- 6. Recruiter attribution columns no longer have a writer. The commission
--    trigger and the placement read policies are dropped first: they read the
--    columns being dropped.
DROP TRIGGER IF EXISTS maintain_placement_commission ON public.placements;
DROP TRIGGER IF EXISTS sync_placement_commission ON public.placements;
DROP FUNCTION IF EXISTS public.sync_placement_commission();
DROP POLICY IF EXISTS placement_reads ON public.placements;
DROP POLICY IF EXISTS placement_month_reads ON public.placement_months;

ALTER TABLE public.candidates DROP COLUMN IF EXISTS assigned_recruiter_id;
ALTER TABLE public.candidates DROP COLUMN IF EXISTS assigned_technical_recruiter_id;
ALTER TABLE public.job_submissions DROP COLUMN IF EXISTS recruiter_id;
ALTER TABLE public.job_submissions DROP COLUMN IF EXISTS technical_recruiter_id;
ALTER TABLE public.placements DROP COLUMN IF EXISTS recruiter_id;
ALTER TABLE public.placements DROP COLUMN IF EXISTS technical_recruiter_id;
ALTER TABLE public.placements DROP COLUMN IF EXISTS commission_amount;
ALTER TABLE public.placements DROP COLUMN IF EXISTS commission_currency;
ALTER TABLE public.placements DROP COLUMN IF EXISTS commission_milestone;
ALTER TABLE public.placements DROP COLUMN IF EXISTS commission_due_days;

-- 6. Profile creation and privilege guards.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE user_full_name text; user_phone text; requested_role text; assigned_role public.app_role;
BEGIN
  user_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email,'@',1)
  );
  user_phone := NEW.raw_user_meta_data->>'phone';
  requested_role := NEW.raw_user_meta_data->>'role';
  IF requested_role = 'candidate' THEN
    assigned_role := 'candidate'::public.app_role;
  ELSE
    assigned_role := 'candidate'::public.app_role;
  END IF;
  -- Every signup creates an active candidate profile.
  INSERT INTO public.profiles (id,email,full_name,phone,role,status)
  VALUES(NEW.id,COALESCE(NEW.email,''),user_full_name,user_phone,assigned_role,'active'::public.account_status)
  ON CONFLICT(id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_privileges() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true)='service_role'
     OR COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb->>'role'='service_role'
     OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Role and account status changes require an administrator operation';
  END IF;
  IF TG_OP='INSERT' AND NOT (NEW.role IN ('candidate') AND NEW.status='active') THEN
    RAISE EXCEPTION 'Staff privileges cannot be granted by profile insertion'; END IF;
  RETURN NEW;
END; $$;

-- 7. The current role helper always resolves to the candidate role.
CREATE OR REPLACE FUNCTION public.get_current_role() RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 8. Candidate access helpers. A candidate reaches only their own record.
--    The share table arrives with the extension migrations, so the share check
--    is resolved at run time and skipped where that table is absent.
CREATE OR REPLACE FUNCTION public.candidate_actor_can_access(p_actor uuid, p_candidate uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE shared boolean := false;
BEGIN
  IF to_regclass('public.candidate_shares') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.candidate_shares cs WHERE cs.candidate_id=$1 AND cs.recipient_id=$2 AND cs.revoked_at IS NULL)'
      INTO shared USING p_candidate, p_actor;
  END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.profiles actor
    JOIN public.candidates candidate ON candidate.id = p_candidate
    WHERE actor.id = p_actor AND actor.status = 'active' AND actor.role IN ('candidate')
      AND (
        candidate.user_id = actor.id
        OR lower(trim(COALESCE(candidate.email, ''))) = lower(trim(COALESCE(actor.email, '')))
        OR shared
      )
  );
END; $$;

-- The staff-scoped helper is kept as an alias so existing policies keep working.
CREATE OR REPLACE FUNCTION public.candidate_staff_can_access(p_candidate uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.candidate_actor_can_access(auth.uid(), p_candidate);
$$;

CREATE OR REPLACE FUNCTION public.candidate_resume_object_can_access(p_object_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidate_documents document
    JOIN public.profiles actor ON actor.id = auth.uid() AND actor.status = 'active' AND actor.role IN ('candidate')
    WHERE document.object_path = p_object_path AND document.status <> 'deleted'
      AND (
        document.owner_id = actor.id AND document.candidate_id IS NULL
        OR public.candidate_actor_can_access(actor.id, document.candidate_id)
      )
  )
$$;

-- 9. Candidate profile writes.
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
  UPDATE public.candidates SET full_name=trim(incoming.full_name),email=incoming.email,phone=incoming.phone,linkedin_url=incoming.linkedin_url,
    current_city=incoming.current_city,current_state=incoming.current_state,full_address=incoming.full_address,visa_status=incoming.visa_status,
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

-- 10. Candidate-owned guard on candidate rows.
CREATE OR REPLACE FUNCTION public.guard_candidate_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role',true)='service_role'
    OR COALESCE(current_setting('request.jwt.claims',true),'{}'::jsonb)->>'role'='service_role' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND (NEW.version<>1 OR NEW.provenance_status<>'legacy_unconfirmed' OR NEW.confirmed_facts<>'{}'::jsonb
    OR NEW.created_by IS NOT NULL
    OR (NEW.user_id IS DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Candidate protected fields require a trusted review operation';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.version IS DISTINCT FROM OLD.version OR NEW.provenance_status IS DISTINCT FROM OLD.provenance_status
    OR NEW.confirmed_facts IS DISTINCT FROM OLD.confirmed_facts OR NEW.employment_history IS DISTINCT FROM OLD.employment_history
    OR NEW.education_history IS DISTINCT FROM OLD.education_history OR NEW.evidence IS DISTINCT FROM OLD.evidence OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'Candidate protected fields require a trusted review operation';
  END IF;
  RETURN NEW;
END; $$;

-- 11. Candidate-scoped application intents and browser events.
CREATE OR REPLACE FUNCTION public.create_application_intent(p_actor uuid,p_candidate uuid,p_job uuid,p_submission uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.jobs; target uuid; submission uuid; matches integer; actor public.profiles; candidate public.candidates;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate;
  IF actor.id IS NULL OR actor.role NOT IN ('candidate') THEN RAISE EXCEPTION 'Active account required'; END IF;
  IF candidate.id IS NULL OR NOT public.candidate_actor_can_access(p_actor,p_candidate) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
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
    INSERT INTO public.job_submissions(candidate_id,company_name,job_title,job_url,job_id,status,capture_status)
      VALUES(p_candidate,job.company,job.title,job.application_url,p_job,'Draft','started') RETURNING id INTO submission;
  ELSE UPDATE public.job_submissions SET capture_status=COALESCE(capture_status,'started'),job_id=COALESCE(job_id,p_job) WHERE id=submission; END IF;
  INSERT INTO public.application_intents(owner_id,candidate_id,job_id,submission_id) VALUES(p_actor,p_candidate,p_job,submission) RETURNING id INTO target;
  RETURN target;
END; $$;

CREATE OR REPLACE FUNCTION public.record_browser_event(p_actor uuid,p_intent uuid,p_key uuid,p_status text,p_attempt integer,p_source text,p_evidence text,p_url text,p_observed timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE intent public.application_intents; current_status text; next_status text; current_rank integer; observed_rank integer; actor public.profiles;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF actor.id IS NULL OR actor.role NOT IN ('candidate') THEN RAISE EXCEPTION 'Active account required'; END IF;
  SELECT * INTO intent FROM public.application_intents WHERE id=p_intent AND owner_id=p_actor FOR UPDATE;
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

-- Extension pairing is a candidate action.
CREATE OR REPLACE FUNCTION public.pair_extension(p_code text,p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE code public.extension_pair_codes; target uuid;
BEGIN
  SELECT * INTO code FROM public.extension_pair_codes
    WHERE code_hash=encode(digest(p_code,'sha256'),'hex') AND used_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=code.owner_id AND status='active' AND role IN ('candidate')) THEN RAISE EXCEPTION 'Pairing code expired or invalid'; END IF;
  UPDATE public.extension_pair_codes SET used_at=now() WHERE id=code.id;
  INSERT INTO public.extension_credentials(owner_id,token_hash) VALUES(code.owner_id,p_token) RETURNING id INTO target;
  RETURN target;
END; $$;

-- 12. Task access and workspace metrics are candidate scoped.
CREATE OR REPLACE FUNCTION public.task_actor_can_access(p_actor uuid,p_task uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; task public.background_tasks; document public.candidate_documents;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO task FROM public.background_tasks WHERE id=p_task;
 IF NOT FOUND THEN RETURN false; END IF;
 IF task.actor_id<>p_actor THEN RETURN false; END IF;
 IF task.kind='resume_extract' THEN
  SELECT * INTO document FROM public.candidate_documents WHERE task_id=p_task AND status<>'deleted';
  IF NOT FOUND THEN RETURN false; END IF;
  IF document.candidate_id IS NULL THEN RETURN document.owner_id=p_actor; END IF;
  RETURN public.candidate_actor_can_access(p_actor,document.candidate_id);
 ELSIF task.kind IN ('candidate_match','packet_generate','resume_tailor','application_answers') THEN
  IF task.payload ? 'candidateId' THEN
    RETURN public.candidate_actor_can_access(p_actor,(task.payload->>'candidateId')::uuid);
  END IF;
  RETURN true;
 ELSIF task.kind='source_sync' THEN
  RETURN true;
 ELSE
  RETURN false;
 END IF;
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
    'activity',COALESCE((SELECT jsonb_agg(row_to_json(activity)) FROM (
      SELECT s.submission_date::text AS date,count(*) AS submissions FROM public.job_submissions s
      WHERE s.submission_date>=current_date-30 AND public.candidate_actor_can_access(p_actor,s.candidate_id)
      GROUP BY s.submission_date ORDER BY s.submission_date) activity),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END; $$;

-- 13. Recruiter-attributed rows are gone; packets no longer carry a recruiter.
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
    IF task.kind<>'packet_generate' THEN RAISE EXCEPTION 'Invalid packet task'; END IF;
    SELECT id INTO target FROM public.submission_packets WHERE task_id=p_task;
    IF target IS NOT NULL THEN RETURN target; END IF;
    INSERT INTO public.job_submissions(candidate_id,company_name,job_title,job_url,job_id,status,notes)
      VALUES(p_candidate,job.company,job.title,job.application_url,p_job,'Draft','Draft prepared; no external application submitted.') RETURNING id INTO submission;
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

-- 14. The extension submission writer drops recruiter attribution.
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

-- 15. Row level security: a candidate reaches only their own records.
DROP POLICY IF EXISTS scoped_profiles ON public.profiles;
CREATE POLICY scoped_profiles ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid());

DROP POLICY IF EXISTS candidate_owner_insert ON public.candidates;
CREATE POLICY candidate_owner_insert ON public.candidates FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());

DROP POLICY IF EXISTS candidate_owner_update ON public.candidates;
CREATE POLICY candidate_owner_update ON public.candidates FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());

DROP POLICY IF EXISTS "Clients can only view their own candidate profile" ON public.candidates;
DROP POLICY IF EXISTS candidate_assignment_reads ON public.candidates;
CREATE POLICY candidate_owner_reads ON public.candidates FOR SELECT TO authenticated
  USING(public.candidate_actor_can_access(auth.uid(), id));

DROP POLICY IF EXISTS "Admins and Recruiters have full candidate access" ON public.candidates;
DROP POLICY IF EXISTS "Admins and Recruiters have full submission access" ON public.job_submissions;
DROP POLICY IF EXISTS assigned_staff_submission_access ON public.job_submissions;
DROP POLICY IF EXISTS "Clients can view their own submissions" ON public.job_submissions;
DROP POLICY IF EXISTS candidate_submission_reads ON public.job_submissions;
CREATE POLICY candidate_submission_reads ON public.job_submissions FOR SELECT TO authenticated
  USING(public.candidate_actor_can_access(auth.uid(), candidate_id));

DROP POLICY IF EXISTS private_documents ON public.candidate_documents;
CREATE POLICY private_documents ON public.candidate_documents FOR SELECT TO authenticated
  USING(status<>'deleted' AND (owner_id=auth.uid() OR public.candidate_actor_can_access(auth.uid(), candidate_id)));

DROP POLICY IF EXISTS private_extractions ON public.resume_extractions;
CREATE POLICY private_extractions ON public.resume_extractions FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.candidate_documents document WHERE document.id=document_id
    AND (document.owner_id=auth.uid() OR public.candidate_actor_can_access(auth.uid(), document.candidate_id))));

DROP POLICY IF EXISTS private_resume_reads ON storage.objects;
CREATE POLICY private_resume_reads ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id='candidate-resumes' AND public.candidate_resume_object_can_access(name));

DROP POLICY IF EXISTS match_reads ON public.candidate_matches;
CREATE POLICY match_reads ON public.candidate_matches FOR SELECT TO authenticated
  USING(public.candidate_actor_can_access(auth.uid(), candidate_id));

DROP POLICY IF EXISTS packet_reads ON public.submission_packets;
CREATE POLICY packet_reads ON public.submission_packets FOR SELECT TO authenticated
  USING(public.candidate_actor_can_access(auth.uid(), candidate_id));

DROP POLICY IF EXISTS intent_reads ON public.application_intents;
CREATE POLICY intent_reads ON public.application_intents FOR SELECT TO authenticated
  USING(owner_id=auth.uid());

DROP POLICY IF EXISTS event_reads ON public.browser_capture_events;
CREATE POLICY event_reads ON public.browser_capture_events FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.application_intents i WHERE i.id=intent_id AND i.owner_id=auth.uid()));

DROP POLICY IF EXISTS answer_snapshot_reads ON public.application_answer_snapshots;
CREATE POLICY answer_snapshot_reads ON public.application_answer_snapshots FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.application_intents i WHERE i.id=intent_id AND i.owner_id=auth.uid()));

DROP POLICY IF EXISTS credential_reads ON public.extension_credentials;
CREATE POLICY credential_reads ON public.extension_credentials FOR SELECT TO authenticated
  USING(owner_id=auth.uid());

DROP POLICY IF EXISTS requirement_reads ON public.job_requirements;
CREATE POLICY requirement_reads ON public.job_requirements FOR SELECT TO authenticated
  USING(public.get_current_role() IN ('candidate') AND data IS NOT NULL);

DROP POLICY IF EXISTS source_reads ON public.job_sources;
CREATE POLICY source_reads ON public.job_sources FOR SELECT TO authenticated USING(true);

DROP POLICY IF EXISTS sync_reads ON public.source_sync_runs;
CREATE POLICY sync_reads ON public.source_sync_runs FOR SELECT TO authenticated USING(true);

DROP POLICY IF EXISTS own_tasks ON public.background_tasks;
CREATE POLICY own_tasks ON public.background_tasks FOR SELECT TO authenticated USING(public.task_profile_can_read(id));

DROP POLICY IF EXISTS admin_audit ON public.audit_events;
CREATE POLICY admin_audit ON public.audit_events FOR SELECT TO authenticated USING(actor_id=auth.uid());

DROP POLICY IF EXISTS admin_usage ON public.provider_usage;
CREATE POLICY admin_usage ON public.provider_usage FOR SELECT TO authenticated USING(false);

DROP POLICY IF EXISTS job_reads ON public.jobs;
CREATE POLICY job_reads ON public.jobs FOR SELECT TO authenticated USING(true);

DROP POLICY IF EXISTS own_email_connections ON public.email_connections;
CREATE POLICY own_email_connections ON public.email_connections FOR SELECT TO authenticated
  USING(owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('candidate')));

DROP POLICY IF EXISTS own_email_receipts ON public.email_receipts;
CREATE POLICY own_email_receipts ON public.email_receipts FOR SELECT TO authenticated
  USING(owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('candidate')));

DROP POLICY IF EXISTS own_confirmation_events ON public.email_confirmation_events;
CREATE POLICY own_confirmation_events ON public.email_confirmation_events FOR SELECT TO authenticated
  USING(actor_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('candidate')));

-- The candidate-share and RTR policies are recreated only when those tables exist.
DO $$
BEGIN
  IF to_regclass('public.candidate_shares') IS NOT NULL THEN
    CREATE POLICY candidate_shares_update ON public.candidate_shares FOR UPDATE TO authenticated
      USING(pushed_by=auth.uid());
    CREATE POLICY candidate_shares_delete ON public.candidate_shares FOR DELETE TO authenticated
      USING(pushed_by=auth.uid());
  END IF;
  IF to_regclass('public.rtr_documents') IS NOT NULL THEN
    CREATE POLICY rtr_candidate_read ON public.rtr_documents FOR SELECT TO authenticated
      USING(public.candidate_actor_can_access(auth.uid(), candidate_id));
  END IF;
  IF to_regclass('public.outside_jobs') IS NOT NULL THEN
    CREATE POLICY candidate_outside_jobs ON public.outside_jobs FOR SELECT TO authenticated
      USING(public.candidate_actor_can_access(auth.uid(), candidate_id));
  END IF;
END $$;

-- 16. Staff-only tables are gone; their policies went with them.
DROP POLICY IF EXISTS staff_vendors ON public.vendors;
DROP POLICY IF EXISTS staff_contacts ON public.vendor_contacts;
DROP POLICY IF EXISTS staff_settings ON public.workspace_settings;

-- 17. Recruiter-facing grants are revoked.
REVOKE ALL ON public.vendors, public.vendor_contacts, public.workspace_settings FROM anon,authenticated;
REVOKE ALL ON public.provider_usage, public.audit_events FROM anon,authenticated;

-- 18. Placement reads stay candidate scoped.
DROP POLICY IF EXISTS placement_reads ON public.placements;
CREATE POLICY placement_reads ON public.placements FOR SELECT TO authenticated
  USING(public.candidate_actor_can_access(auth.uid(), candidate_id));

DROP POLICY IF EXISTS placement_month_reads ON public.placement_months;
CREATE POLICY placement_month_reads ON public.placement_months FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.placements p WHERE p.id=placement_id
    AND public.candidate_actor_can_access(auth.uid(), p.candidate_id)));

DROP POLICY IF EXISTS service_enrollment_view ON public.service_enrollments;
CREATE POLICY service_enrollment_view ON public.service_enrollments FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.candidates c WHERE c.id=candidate_id
    AND public.candidate_actor_can_access(auth.uid(), c.id)));

DROP POLICY IF EXISTS service_bill_view ON public.service_bills;
CREATE POLICY service_bill_view ON public.service_bills FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.service_enrollments e WHERE e.id=enrollment_id
    AND EXISTS(SELECT 1 FROM public.candidates c WHERE c.id=e.candidate_id
      AND public.candidate_actor_can_access(auth.uid(), c.id))));

DROP POLICY IF EXISTS service_receipt_view ON public.service_receipts;
CREATE POLICY service_receipt_view ON public.service_receipts FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.service_bills b WHERE b.id=bill_id
    AND EXISTS(SELECT 1 FROM public.service_enrollments e WHERE e.id=b.enrollment_id
      AND EXISTS(SELECT 1 FROM public.candidates c WHERE c.id=e.candidate_id
        AND public.candidate_actor_can_access(auth.uid(), c.id)))));

-- 19. Private job briefs belong to the recruiter workspace and are removed.
--    The tailored resume and shortlist tables reference them, so they go first.
--    job_requirements is kept: it powers candidate-to-job matching.
DO $$
BEGIN
  IF to_regclass('public.jd_shortlists') IS NOT NULL THEN
    DROP TABLE public.jd_shortlists;
  END IF;
  IF to_regclass('public.tailored_resumes') IS NOT NULL THEN
    ALTER TABLE public.tailored_resumes DROP COLUMN IF EXISTS brief_id;
  END IF;
  IF to_regclass('public.job_briefs') IS NOT NULL THEN
    DROP TABLE public.job_briefs;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.create_job_brief(uuid,uuid,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.save_job_brief_requirements(uuid,uuid,uuid,jsonb,text);
DROP FUNCTION IF EXISTS public.review_job_brief(uuid,uuid,integer,jsonb);
DROP FUNCTION IF EXISTS public.extract_job_requirements(uuid,uuid);
DROP FUNCTION IF EXISTS public.match_brief_candidate(uuid,jsonb);
DROP FUNCTION IF EXISTS public.get_job_brief(uuid);

-- 20. The candidate workspace no longer produces JD brief tasks.
ALTER TABLE public.background_tasks DROP CONSTRAINT IF EXISTS background_tasks_kind_check;
ALTER TABLE public.background_tasks ADD CONSTRAINT background_tasks_kind_check
  CHECK(kind IN('resume_extract','source_sync','candidate_match','packet_generate','resume_tailor','application_answers'));

-- 21. The remaining candidate-facing functions are rewritten candidate-only.
DROP FUNCTION IF EXISTS public.placement_profile_can_read(uuid,uuid,uuid,boolean);

CREATE OR REPLACE FUNCTION public.email_candidate_access(p_owner uuid,p_candidate uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.candidates c ON c.id=p_candidate
 WHERE p.id=p_owner AND p.status='active' AND p.role IN ('candidate') AND c.user_id=p.id);
$$;

CREATE OR REPLACE FUNCTION public.confirm_email_receipt(
  p_owner uuid, p_receipt uuid, p_candidate uuid, p_company text, p_title text,
  p_submission uuid DEFAULT NULL, p_manual boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.email_receipts; target uuid; existing_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner AND status = 'active' AND role IN ('candidate')) THEN
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
    INSERT INTO public.job_submissions(candidate_id,company_name,job_title,submission_date,portal_source,status,job_location)
      VALUES(p_candidate,trim(p_company),trim(p_title),(r.received_at AT TIME ZONE 'UTC')::date,'Email confirmation','Applied',NULL)
      RETURNING id INTO target;
  END IF;
  -- Preserve the recruiting pipeline status (interviews, offers, rejection, etc.).
  UPDATE public.job_submissions SET capture_status='confirmed', email_confirmed_at=COALESCE(email_confirmed_at,r.received_at) WHERE id=target;
  UPDATE public.email_receipts SET disposition='confirmed', candidate_id=p_candidate, submission_id=target,
    extracted_company=trim(p_company),extracted_job_title=trim(p_title),reviewed_at=now() WHERE id=r.id;
  INSERT INTO public.email_confirmation_events(receipt_id,submission_id,actor_id,evidence_source,observed_at)
    VALUES(r.id,target,p_owner,CASE WHEN p_manual THEN 'candidate_review' ELSE 'mailbox_receipt' END,r.received_at);
  RETURN target;
END; $$;

CREATE OR REPLACE FUNCTION public.ingest_mailbox_receipt(
  p_owner uuid,p_connection uuid,p_lease uuid,p_key text,p_payload jsonb,p_confirm boolean
) RETURNS TABLE(id uuid,disposition text,duplicate boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.email_receipts; saved_id uuid; prior public.email_receipts;
BEGIN
  PERFORM 1 FROM public.email_connections WHERE email_connections.id=p_connection AND owner_id=p_owner
    AND status='connected' AND sync_lease_token=p_lease AND sync_lease_until>now() FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE profiles.id=p_owner AND status='active' AND role IN ('candidate')) THEN
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

CREATE OR REPLACE FUNCTION public.claim_email_sync(p_connection uuid,p_owner uuid,p_lease uuid)
RETURNS SETOF public.email_connections LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.email_connections SET sync_lease_until=now()+interval '5 minutes',sync_lease_token=p_lease,last_attempted_at=now()
    WHERE id=p_connection AND owner_id=p_owner AND status='connected'
    AND (sync_lease_until IS NULL OR sync_lease_until < now())
    AND EXISTS(SELECT 1 FROM public.profiles WHERE id=p_owner AND role IN ('candidate') AND status='active')
    RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.eligible_email_connections()
RETURNS TABLE(id uuid,owner_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT connection.id,connection.owner_id FROM public.email_connections connection JOIN public.profiles profile ON profile.id=connection.owner_id
    WHERE connection.status='connected' AND profile.status='active' AND profile.role IN ('candidate')
      AND (connection.sync_lease_until IS NULL OR connection.sync_lease_until<now())
    ORDER BY connection.last_attempted_at ASC NULLS FIRST,connection.id LIMIT 3;
$$;

CREATE OR REPLACE FUNCTION public.sync_recruiting_periods(p_placements uuid[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item uuid;
BEGIN
 IF COALESCE(cardinality(p_placements),0)>200 THEN
  RAISE EXCEPTION 'Period refresh accepts at most 200 IDs per kind';
 END IF;
 -- Consistent lock order also makes concurrent dashboard refreshes safer.
 FOR item IN SELECT DISTINCT id FROM unnest(p_placements) id WHERE id IS NOT NULL ORDER BY id LOOP
  PERFORM public.sync_placement_months(item);
 END LOOP;
END; $$;

DROP FUNCTION IF EXISTS public.sync_recruiting_periods(uuid[],uuid[]);

-- The candidate-share helpers are recreated only where the share table exists.
DO $do$
BEGIN
IF to_regclass('public.candidate_shares') IS NOT NULL THEN
CREATE OR REPLACE FUNCTION public.candidate_actor_can_share(
  p_actor uuid, p_candidate uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; candidate public.candidates;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active' AND role IN ('candidate');
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate;
  IF NOT FOUND OR candidate.provenance_status <> 'confirmed' THEN RETURN false; END IF;
  RETURN candidate.user_id = p_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_candidate_share(
  p_actor uuid, p_share uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE share public.candidate_shares;
BEGIN
  SELECT * INTO share FROM public.candidate_shares WHERE id = p_share;
  IF NOT FOUND THEN RETURN false; END IF;
  IF share.pushed_by <> p_actor THEN
    RETURN false;
  END IF;
  UPDATE public.candidate_shares SET revoked_at = now() WHERE id = p_share;
  RETURN true;
END;
$$;
END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.enqueue_source_sync(p_actor uuid,p_source uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;BEGIN
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND status='active' AND role IN ('candidate')) THEN RAISE EXCEPTION 'Source access denied';END IF;
  PERFORM 1 FROM job_sources WHERE id=p_source AND enabled FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Source is disabled or missing';END IF;
  SELECT id INTO target FROM background_tasks WHERE kind='source_sync' AND payload->>'sourceId'=p_source::text AND status IN('queued','running') LIMIT 1;
  IF target IS NULL THEN target:=enqueue_task(p_actor,'source_sync',jsonb_build_object('sourceId',p_source),'source:'||p_source||':'||gen_random_uuid());END IF;
  RETURN target;
END;$$;

-- The RTR writer is a candidate action: the candidate files their own agreement.
-- The RTR tables arrived after the operations bundle, so the replacement only
-- applies where those tables exist.
DO $do$
BEGIN
IF to_regclass('public.rtr_documents') IS NOT NULL THEN
CREATE OR REPLACE FUNCTION public.save_rtr_document(
    p_actor uuid,
    p_submission uuid,
    p_candidate uuid,
    p_filename text,
    p_mime_type text,
    p_base64 text,
    p_vendor_id uuid DEFAULT NULL,
    p_vendor_name text DEFAULT NULL,
    p_vendor_contact_name text DEFAULT NULL,
    p_vendor_contact_email text DEFAULT NULL,
    p_vendor_contact_phone text DEFAULT NULL,
    p_rtr_type text DEFAULT 'vendor_rtr',
    p_rtr_status text DEFAULT 'received',
    p_rtr_date date DEFAULT CURRENT_DATE,
    p_expiration_date date DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
    actor public.profiles;
    submission public.job_submissions;
    candidate public.candidates;
    rtr public.rtr_documents;
BEGIN
    SELECT * INTO actor FROM public.profiles WHERE id = p_actor AND status = 'active' AND role IN ('candidate');
    IF actor.id IS NULL THEN
        RAISE EXCEPTION 'Active candidate account required';
    END IF;

    SELECT * INTO submission FROM public.job_submissions WHERE id = p_submission FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Submission not found';
    END IF;

    IF submission.candidate_id IS DISTINCT FROM p_candidate THEN
        RAISE EXCEPTION 'Submission candidate mismatch';
    END IF;

    IF NOT public.candidate_actor_can_access(p_actor, p_candidate) THEN
        RAISE EXCEPTION 'Candidate access denied';
    END IF;

    INSERT INTO public.rtr_documents (
        submission_id, candidate_id,
        filename, mime_type, base64,
        vendor_id, vendor_name, vendor_contact_name, vendor_contact_email, vendor_contact_phone,
        rtr_type, rtr_status, rtr_date, expiration_date, notes, uploaded_by,
        hourly_rate, daily_rate, monthly_rate, annual_rate, currency
    ) VALUES (
        p_submission, p_candidate,
        left(p_filename, 255), left(p_mime_type, 100), p_base64,
        p_vendor_id, left(p_vendor_name, 200), left(p_vendor_contact_name, 200),
        left(p_vendor_contact_email, 255), left(p_vendor_contact_phone, 50),
        p_rtr_type, p_rtr_status, p_rtr_date, p_expiration_date, left(p_notes, 2000), p_actor,
        p_hourly_rate, p_daily_rate, p_monthly_rate, p_annual_rate, p_currency
    ) RETURNING * INTO rtr;

    UPDATE public.job_submissions
    SET rtr_document = jsonb_build_object(
        'id', rtr.id,
        'filename', rtr.filename,
        'mime_type', rtr.mime_type,
        'vendor_name', rtr.vendor_name,
        'rtr_type', rtr.rtr_type,
        'rtr_status', rtr.rtr_status,
        'rtr_date', rtr.rtr_date,
        'expiration_date', rtr.expiration_date,
        'created_at', rtr.created_at
    )
    WHERE id = p_submission;

    INSERT INTO public.audit_events (actor_id, action, subject_id, metadata)
    VALUES (p_actor, 'rtr_document_saved', rtr.id,
        jsonb_build_object(
            'submission_id', p_submission,
            'candidate_id', p_candidate,
            'filename', p_filename,
            'vendor_name', p_vendor_name,
            'rtr_type', p_rtr_type,
            'rtr_status', p_rtr_status
        )
    );

    RETURN jsonb_build_object(
        'id', rtr.id,
        'submission_id', rtr.submission_id,
        'candidate_id', rtr.candidate_id,
        'filename', rtr.filename,
        'vendor_name', rtr.vendor_name,
        'rtr_type', rtr.rtr_type,
        'rtr_status', rtr.rtr_status,
        'rtr_date', rtr.rtr_date,
        'expiration_date', rtr.expiration_date,
        'created_at', rtr.created_at
    );
END; $$;

CREATE OR REPLACE FUNCTION public.update_rtr_status(
    p_actor uuid,
    p_rtr_id uuid,
    p_rtr_status text,
    p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
    actor public.profiles;
    rtr public.rtr_documents;
BEGIN
    SELECT * INTO actor FROM public.profiles WHERE id = p_actor AND status = 'active' AND role IN ('candidate');
    IF actor.id IS NULL THEN
        RAISE EXCEPTION 'Active candidate account required';
    END IF;

    SELECT * INTO rtr FROM public.rtr_documents WHERE id = p_rtr_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'RTR document not found';
    END IF;

    IF NOT public.candidate_actor_can_access(p_actor, rtr.candidate_id) THEN
        RAISE EXCEPTION 'Candidate access denied';
    END IF;

    UPDATE public.rtr_documents
    SET rtr_status = p_rtr_status,
        notes = COALESCE(left(p_notes, 2000), rtr.notes),
        updated_at = now()
    WHERE id = p_rtr_id
    RETURNING * INTO rtr;

    UPDATE public.job_submissions
    SET rtr_document = jsonb_build_object(
        'id', rtr.id,
        'filename', rtr.filename,
        'mime_type', rtr.mime_type,
        'vendor_name', rtr.vendor_name,
        'rtr_type', rtr.rtr_type,
        'rtr_status', rtr.rtr_status,
        'rtr_date', rtr.rtr_date,
        'expiration_date', rtr.expiration_date,
        'created_at', rtr.created_at
    )
    WHERE id = rtr.submission_id;

    INSERT INTO public.audit_events (actor_id, action, subject_id, metadata)
    VALUES (p_actor, 'rtr_status_updated', rtr.id,
        jsonb_build_object('old_status', rtr.rtr_status, 'new_status', p_rtr_status, 'notes', p_notes)
    );

    RETURN jsonb_build_object('id', rtr.id, 'rtr_status', rtr.rtr_status, 'updated_at', rtr.updated_at);
END; $$;
END IF;
END
$do$;

-- Tailored resumes are generated from a public job, never a private JD.
-- The tailored resume tables arrived after the operations bundle, so the
-- replacement only applies where those tables exist.
DO $do$
BEGIN
IF to_regclass('public.tailored_resumes') IS NOT NULL THEN
CREATE OR REPLACE FUNCTION public.request_tailored_resume(p_actor uuid,p_candidate uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate public.candidates; v_source_version integer; v_source_key text; target uuid; task uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND status='active' AND role IN ('candidate')) OR NOT public.candidate_actor_can_access(p_actor,p_candidate) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate FOR SHARE;
  IF candidate.provenance_status<>'confirmed' THEN RAISE EXCEPTION 'Review the candidate resume first'; END IF;
  IF p_job IS NULL THEN RAISE EXCEPTION 'Select a job'; END IF;
  SELECT version INTO v_source_version FROM public.jobs WHERE id=p_job AND state<>'closed' FOR SHARE;
  v_source_key:='job:'||p_job::text||':'||v_source_version::text;
  IF v_source_version IS NULL THEN RAISE EXCEPTION 'Job unavailable'; END IF;
  INSERT INTO public.tailored_resumes(actor_id,candidate_id,candidate_version,job_id,source_version,source_key)
  VALUES(p_actor,p_candidate,candidate.version,p_job,v_source_version,v_source_key)
  ON CONFLICT(actor_id,candidate_id,candidate_version,source_key) DO NOTHING RETURNING id INTO target;
  IF target IS NULL THEN
    SELECT id,task_id INTO target,task FROM public.tailored_resumes
     WHERE actor_id=p_actor AND candidate_id=p_candidate AND candidate_version=candidate.version AND source_key=v_source_key;
    RETURN jsonb_build_object('resumeId',target,'taskId',task);
  END IF;
  task:=public.enqueue_task(p_actor,'resume_tailor',jsonb_build_object('resumeId',target,'candidateId',p_candidate),'tailor:'||target::text||':v1');
  UPDATE public.tailored_resumes SET task_id=task WHERE id=target;
  RETURN jsonb_build_object('resumeId',target,'taskId',task);
END; $$;

DROP FUNCTION IF EXISTS public.request_tailored_resume(uuid,uuid,uuid,uuid);

CREATE OR REPLACE FUNCTION public.tailored_resume_is_current(p_resume uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.tailored_resumes r JOIN public.candidates c ON c.id=r.candidate_id
   JOIN public.jobs j ON j.id=r.job_id
   WHERE r.id=p_resume AND c.provenance_status='confirmed' AND c.version=r.candidate_version
   AND j.version=r.source_version AND j.state<>'closed')
$$;

CREATE OR REPLACE FUNCTION public.save_tailored_resume(p_task uuid,p_lease uuid,p_resume uuid,p_content text,p_data jsonb,p_model text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.tailored_resumes; task public.background_tasks;
BEGIN
  PERFORM public.check_task_lease(p_task,p_lease);
  SELECT * INTO task FROM public.background_tasks WHERE id=p_task;
  SELECT * INTO target FROM public.tailored_resumes WHERE id=p_resume FOR UPDATE;
  PERFORM 1 FROM public.candidates WHERE id=target.candidate_id FOR SHARE;
  PERFORM 1 FROM public.jobs WHERE id=target.job_id FOR SHARE;
  IF target.id IS NULL OR task.kind<>'resume_tailor' OR task.payload->>'resumeId' IS DISTINCT FROM p_resume::text OR target.task_id IS DISTINCT FROM p_task OR target.actor_id IS DISTINCT FROM task.actor_id OR NOT public.candidate_actor_can_access(task.actor_id,target.candidate_id)
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=task.actor_id AND status='active' AND role IN ('candidate')) THEN RAISE EXCEPTION 'Resume task access denied'; END IF;
  IF NOT public.tailored_resume_is_current(p_resume) THEN RAISE EXCEPTION 'Candidate or job changed; generate a fresh resume'; END IF;
  IF length(trim(p_content)) NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid generated resume'; END IF;
  IF target.status<>'queued' THEN RETURN; END IF;
  UPDATE public.tailored_resumes SET content=p_content,data=p_data,model=p_model,status='review',updated_at=now() WHERE id=p_resume;
  INSERT INTO public.tailored_resume_edits(resume_id,revision,content,editor_id) VALUES(p_resume,1,p_content,task.actor_id) ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.review_tailored_resume(p_actor uuid,p_resume uuid,p_expected integer,p_content text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.tailored_resumes;
BEGIN
  SELECT * INTO target FROM public.tailored_resumes WHERE id=p_resume FOR UPDATE;
  IF target.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND status='active' AND role IN ('candidate')) OR NOT public.candidate_actor_can_access(p_actor,target.candidate_id) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
  PERFORM 1 FROM public.candidates WHERE id=target.candidate_id FOR SHARE;
  PERFORM 1 FROM public.jobs WHERE id=target.job_id FOR SHARE;
  IF target.revision<>p_expected OR target.status NOT IN('review','ready') OR NOT public.tailored_resume_is_current(p_resume) THEN RAISE EXCEPTION 'Resume or source changed; reload or regenerate'; END IF;
  IF length(trim(p_content)) NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid reviewed resume'; END IF;
  UPDATE public.tailored_resumes SET content=p_content,revision=revision+1,reviewed_revision=revision+1,status='ready',updated_at=now() WHERE id=p_resume;
  INSERT INTO public.tailored_resume_edits(resume_id,revision,content,editor_id,reviewed) VALUES(p_resume,target.revision+1,p_content,p_actor,true);
END; $$;
END IF;
END
$do$;

-- 22. Refresh the API schema cache.
NOTIFY pgrst,'reload schema';

COMMIT;
