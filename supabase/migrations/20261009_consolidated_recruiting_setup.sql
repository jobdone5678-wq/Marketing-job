-- ==============================================================================
-- MASTER CONSOLIDATED SETUP FOR RECRUITING & AI RESUME INTAKE
-- Fully Idempotent (Safe to run multiple times without 42701 or relation errors)
-- ==============================================================================

BEGIN;

-- 1. EXTEND SUBMISSION STATUS ENUM
DO $$ BEGIN
  ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'Draft';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. CANDIDATES SCHEMA & RELAXATION
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

-- 3. CRM TABLES (VENDORS & SETTINGS)
CREATE TABLE IF NOT EXISTS public.vendors(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(trim(name))>0),
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_contacts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_settings(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  ai_daily_limit integer NOT NULL DEFAULT 100 CHECK(ai_daily_limit BETWEEN 1 AND 10000),
  source_sync_minutes integer NOT NULL DEFAULT 30 CHECK(source_sync_minutes IN(15,30,60)),
  company_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.workspace_settings(id) VALUES(true) ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='job_submissions' AND column_name='vendor_id') THEN
    ALTER TABLE public.job_submissions ADD COLUMN vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.job_submissions ALTER COLUMN status SET DEFAULT 'Draft';

-- 4. BACKGROUND TASKS & AUDIT TABLES
CREATE TABLE IF NOT EXISTS public.background_tasks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL CHECK(kind IN('resume_extract','source_sync','candidate_match','packet_generate')),
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','succeeded','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kind,idempotency_key)
);

CREATE INDEX IF NOT EXISTS task_ready ON public.background_tasks(status,available_at);

CREATE TABLE IF NOT EXISTS public.provider_usage(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.background_tasks(id),
  model text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  subject_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. RESUMES & DOCUMENT EXTRACTIONS
CREATE TABLE IF NOT EXISTS public.candidate_documents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  candidate_version integer,
  object_path text NOT NULL UNIQUE,
  filename text NOT NULL,
  content_hash text NOT NULL,
  consent_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','review','confirmed','failed','deleted')),
  task_id uuid REFERENCES public.background_tasks(id),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_owner_created ON public.candidate_documents(owner_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.resume_extractions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE REFERENCES public.candidate_documents(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL DEFAULT '1',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. PRIVATE RESUMES STORAGE BUCKET
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) 
VALUES('candidate-resumes','candidate-resumes',false,10485760,
  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) 
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=EXCLUDED.allowed_mime_types;

-- 7. JOB FEEDS & SOURCES
CREATE TABLE IF NOT EXISTS public.job_sources(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK(provider IN('greenhouse','ashby')),
  board_slug text NOT NULL CHECK(board_slug~'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$'),
  company text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES profiles(id),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  health text NOT NULL DEFAULT 'not_connected' CHECK(health IN('not_connected','healthy','partial','stale')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,board_slug)
);

CREATE TABLE IF NOT EXISTS public.jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES job_sources(id),
  external_id text NOT NULL,
  title text NOT NULL,
  company text NOT NULL,
  source_url text NOT NULL,
  application_url text NOT NULL,
  location text,
  department text,
  description text NOT NULL,
  description_html text NOT NULL DEFAULT '',
  employment_type text NOT NULL CHECK(employment_type IN('contract','permanent','temporary','part_time','internship','unknown')),
  employment_evidence text,
  arrangements jsonb,
  compensation jsonb,
  content_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'active' CHECK(state IN('active','closed','stale')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,external_id)
);

CREATE TABLE IF NOT EXISTS public.source_sync_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES job_sources(id),
  task_id uuid UNIQUE REFERENCES background_tasks(id),
  complete boolean NOT NULL,
  count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='job_submissions' AND column_name='job_id') THEN
    ALTER TABLE public.job_submissions ADD COLUMN job_id uuid REFERENCES jobs(id);
  END IF;
END $$;

-- 8. AI MATCHES & SUBMISSION PACKETS
CREATE TABLE IF NOT EXISTS public.candidate_matches(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  candidate_version integer NOT NULL,
  job_version integer NOT NULL,
  data jsonb NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'match-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(candidate_id,job_id,candidate_version,job_version,prompt_version)
);

CREATE TABLE IF NOT EXISTS public.submission_packets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  candidate_version integer NOT NULL,
  job_version integer NOT NULL,
  data jsonb NOT NULL,
  submission_id uuid REFERENCES job_submissions(id),
  task_id uuid UNIQUE REFERENCES background_tasks(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. APPLICATION INTENTS & EXTENSION CAPTURE
CREATE TABLE IF NOT EXISTS public.application_intents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id),
  candidate_id uuid NOT NULL REFERENCES candidates(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  submission_id uuid NOT NULL REFERENCES job_submissions(id) ON DELETE RESTRICT,
  attempt integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,candidate_id,job_id)
);

CREATE TABLE IF NOT EXISTS public.extension_pair_codes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id),
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  used_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.extension_credentials(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.browser_capture_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES application_intents(id),
  event_key uuid NOT NULL,
  status text NOT NULL CHECK(status IN('in_progress','submit_attempted','submitted','failed')),
  attempt integer NOT NULL CHECK(attempt>=1),
  source text NOT NULL CHECK(source IN('extension_observation','recruiter_attestation')),
  evidence text NOT NULL CHECK(length(evidence)<=1000),
  url text NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(intent_id,event_key)
);

-- 10. ENABLE RLS ACROSS ALL TABLES
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_pair_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_capture_events ENABLE ROW LEVEL SECURITY;

-- 11. POLICIES SETUP
DROP POLICY IF EXISTS candidate_owner_insert ON public.candidates;
CREATE POLICY candidate_owner_insert ON public.candidates FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND public.get_current_role()='client');

DROP POLICY IF EXISTS candidate_owner_update ON public.candidates;
CREATE POLICY candidate_owner_update ON public.candidates FOR UPDATE TO authenticated USING(user_id=auth.uid() AND public.get_current_role()='client') WITH CHECK(user_id=auth.uid());

DROP POLICY IF EXISTS "Clients can only view their own candidate profile" ON public.candidates;
CREATE POLICY "Clients can only view their own candidate profile" ON public.candidates FOR SELECT TO authenticated USING(user_id=auth.uid() AND get_current_role()='client');

DROP POLICY IF EXISTS "Clients can view their own submissions" ON public.job_submissions;
CREATE POLICY "Clients can view their own submissions" ON public.job_submissions FOR SELECT TO authenticated USING(get_current_role()='client' AND candidate_id IN(SELECT id FROM candidates WHERE user_id=auth.uid()));

DROP POLICY IF EXISTS scoped_profiles ON public.profiles;
CREATE POLICY scoped_profiles ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid() OR public.get_current_role() IN ('recruiter','super_admin'));

DROP POLICY IF EXISTS staff_vendors ON public.vendors;
CREATE POLICY staff_vendors ON public.vendors FOR SELECT TO authenticated USING(public.get_current_role() IN('recruiter','super_admin'));

DROP POLICY IF EXISTS staff_contacts ON public.vendor_contacts;
CREATE POLICY staff_contacts ON public.vendor_contacts FOR SELECT TO authenticated USING(public.get_current_role() IN('recruiter','super_admin'));

DROP POLICY IF EXISTS staff_settings ON public.workspace_settings;
CREATE POLICY staff_settings ON public.workspace_settings FOR SELECT TO authenticated USING(public.get_current_role() IN('recruiter','super_admin'));

DROP POLICY IF EXISTS own_tasks ON public.background_tasks;
CREATE POLICY own_tasks ON public.background_tasks FOR SELECT TO authenticated USING(actor_id=auth.uid() AND public.get_current_role() IS NOT NULL OR public.get_current_role()='super_admin');

DROP POLICY IF EXISTS admin_usage ON public.provider_usage;
CREATE POLICY admin_usage ON public.provider_usage FOR SELECT TO authenticated USING(public.get_current_role()='super_admin');

DROP POLICY IF EXISTS admin_audit ON public.audit_events;
CREATE POLICY admin_audit ON public.audit_events FOR SELECT TO authenticated USING(public.get_current_role()='super_admin');

DROP POLICY IF EXISTS private_documents ON public.candidate_documents;
CREATE POLICY private_documents ON public.candidate_documents FOR SELECT TO authenticated USING(public.get_current_role() IN('recruiter','super_admin') OR owner_id=auth.uid() AND public.get_current_role()='client');

DROP POLICY IF EXISTS private_extractions ON public.resume_extractions;
CREATE POLICY private_extractions ON public.resume_extractions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM candidate_documents document WHERE document.id=document_id));

DROP POLICY IF EXISTS private_resume_reads ON storage.objects;
CREATE POLICY private_resume_reads ON storage.objects FOR SELECT TO authenticated USING(bucket_id='candidate-resumes' AND
  (public.get_current_role() IN('recruiter','super_admin') OR split_part(name,'/',1)=auth.uid()::text AND public.get_current_role()='client'));

DROP POLICY IF EXISTS source_reads ON job_sources;
CREATE POLICY source_reads ON job_sources FOR SELECT TO authenticated USING(get_current_role() IN('recruiter','super_admin'));

DROP POLICY IF EXISTS job_reads ON jobs;
CREATE POLICY job_reads ON jobs FOR SELECT TO authenticated USING(get_current_role() IN('client','recruiter','super_admin'));

DROP POLICY IF EXISTS sync_reads ON source_sync_runs;
CREATE POLICY sync_reads ON source_sync_runs FOR SELECT TO authenticated USING(get_current_role() IN('recruiter','super_admin'));

DROP POLICY IF EXISTS match_reads ON candidate_matches;
CREATE POLICY match_reads ON candidate_matches FOR SELECT TO authenticated USING(get_current_role() IN('recruiter','super_admin') OR get_current_role()='client' AND EXISTS(SELECT 1 FROM candidates c WHERE c.id=candidate_id AND c.user_id=auth.uid()));

DROP POLICY IF EXISTS packet_reads ON submission_packets;
CREATE POLICY packet_reads ON submission_packets FOR SELECT TO authenticated USING(get_current_role() IN('recruiter','super_admin') OR get_current_role()='client' AND EXISTS(SELECT 1 FROM candidates c WHERE c.id=candidate_id AND c.user_id=auth.uid()));

DROP POLICY IF EXISTS intent_reads ON application_intents;
CREATE POLICY intent_reads ON application_intents FOR SELECT TO authenticated USING(owner_id=auth.uid() AND get_current_role() IN('recruiter','super_admin'));

DROP POLICY IF EXISTS event_reads ON browser_capture_events;
CREATE POLICY event_reads ON browser_capture_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM application_intents i WHERE i.id=intent_id AND i.owner_id=auth.uid() AND get_current_role() IN('recruiter','super_admin')));

DROP POLICY IF EXISTS credential_reads ON extension_credentials;
CREATE POLICY credential_reads ON extension_credentials FOR SELECT TO authenticated USING(owner_id=auth.uid() AND get_current_role() IN('recruiter','super_admin'));

-- 12. PERMISSIONS GRANTS
REVOKE INSERT,UPDATE,DELETE ON public.candidates FROM authenticated;
REVOKE ALL ON public.vendors,public.vendor_contacts,public.workspace_settings FROM anon,authenticated;
REVOKE ALL ON public.background_tasks,public.provider_usage,public.audit_events FROM anon,authenticated;
REVOKE ALL ON public.candidate_documents,public.resume_extractions FROM anon,authenticated;
REVOKE ALL ON application_intents,extension_pair_codes,extension_credentials,browser_capture_events FROM anon,authenticated;

GRANT SELECT ON public.vendors,public.vendor_contacts,public.workspace_settings TO authenticated;
GRANT SELECT ON public.background_tasks,public.provider_usage,public.audit_events TO authenticated;
GRANT SELECT ON public.candidate_documents,public.resume_extractions TO authenticated;
GRANT SELECT ON job_sources,jobs,source_sync_runs TO authenticated;
GRANT SELECT ON candidate_matches,submission_packets TO authenticated;
GRANT SELECT ON application_intents,browser_capture_events TO authenticated;
GRANT SELECT(id,owner_id,expires_at,revoked_at,created_at) ON extension_credentials TO authenticated;

GRANT ALL ON public.vendors,public.vendor_contacts,public.workspace_settings TO service_role;
GRANT ALL ON public.background_tasks,public.provider_usage,public.audit_events TO service_role;
GRANT ALL ON public.candidate_documents,public.resume_extractions TO service_role;
GRANT ALL ON job_sources,jobs,source_sync_runs TO service_role;
GRANT ALL ON candidate_matches,submission_packets TO service_role;
GRANT ALL ON application_intents,extension_pair_codes,extension_credentials,browser_capture_events TO service_role;

-- 13. CORE PROCEDURES & FUNCTIONS
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

CREATE OR REPLACE FUNCTION public.save_vendor(p_id uuid,p_data jsonb,p_contacts jsonb) RETURNS uuid 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;contact jsonb;
BEGIN
  IF p_id IS NULL THEN INSERT INTO vendors(name,data) VALUES(trim(p_data->>'name'),p_data-'contacts'-'id') RETURNING id INTO target;
  ELSE UPDATE vendors SET name=trim(p_data->>'name'),data=p_data-'contacts'-'id',updated_at=now() WHERE id=p_id RETURNING id INTO target;
    IF target IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF; END IF;
  DELETE FROM vendor_contacts WHERE vendor_id=target;
  FOR contact IN SELECT * FROM jsonb_array_elements(p_contacts) LOOP INSERT INTO vendor_contacts(vendor_id,data) VALUES(target,contact-'id');END LOOP;
  RETURN target;
END; $$;

CREATE OR REPLACE FUNCTION public.enqueue_task(p_actor uuid,p_kind text,p_payload jsonb,p_key text) RETURNS uuid 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid; BEGIN
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND status='active') THEN RAISE EXCEPTION 'Active account required';END IF;
  INSERT INTO background_tasks(actor_id,kind,payload,idempotency_key) VALUES(p_actor,p_kind,p_payload,p_key)
    ON CONFLICT(kind,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id INTO target;
  RETURN target;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_task(p_lease uuid) RETURNS SETOF public.background_tasks 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid; BEGIN
  UPDATE background_tasks SET status='failed',error='Retry limit reached after worker interruption',lease_token=NULL,lease_until=NULL
    WHERE status='running' AND lease_until<now() AND attempts>=3;
  SELECT task.id INTO target FROM background_tasks task JOIN profiles profile ON profile.id=task.actor_id
    WHERE profile.status='active' AND task.attempts<3 AND (task.status='queued' AND task.available_at<=now() OR task.status='running' AND task.lease_until<now())
    ORDER BY task.available_at,task.created_at FOR UPDATE OF task SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE background_tasks SET status='running',attempts=attempts+1,lease_token=p_lease,lease_until=now()+interval '3 minutes',updated_at=now() WHERE id=target RETURNING *;
END; $$;

CREATE OR REPLACE FUNCTION public.check_task_lease(p_task uuid,p_lease uuid) RETURNS void 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM background_tasks task JOIN profiles profile ON profile.id=task.actor_id WHERE task.id=p_task AND task.status='running'
    AND task.lease_token=p_lease AND task.lease_until>now() AND profile.status='active' FOR UPDATE OF task;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active task lease required';END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.heartbeat_task(p_task uuid,p_lease uuid) RETURNS void 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM check_task_lease(p_task,p_lease);UPDATE background_tasks SET lease_until=now()+interval '3 minutes' WHERE id=p_task;END; $$;

CREATE OR REPLACE FUNCTION public.finish_task(p_task uuid,p_lease uuid,p_result jsonb,p_error text,p_transient boolean) RETURNS void 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM check_task_lease(p_task,p_lease);
  UPDATE background_tasks SET status=CASE WHEN p_error IS NULL THEN 'succeeded' WHEN p_transient AND attempts<3 THEN 'queued' ELSE 'failed' END,
    result=p_result,error=p_error,available_at=now()+make_interval(secs=>30*attempts*attempts),lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=p_task;
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_ai_call(p_task uuid,p_lease uuid,p_model text) RETURNS uuid 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE quota integer;counted integer;target uuid;BEGIN
  PERFORM check_task_lease(p_task,p_lease);
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-budget:'||(now() AT TIME ZONE 'UTC')::date::text,0));
  SELECT ai_daily_limit INTO quota FROM workspace_settings WHERE id=true;
  SELECT count(*) INTO counted FROM provider_usage WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF counted>=quota THEN RAISE EXCEPTION 'Daily AI budget exhausted';END IF;
  INSERT INTO provider_usage(task_id,model) VALUES(p_task,p_model) RETURNING id INTO target;RETURN target;
END; $$;

CREATE OR REPLACE FUNCTION public.save_resume_extraction(p_task uuid,p_lease uuid,p_document uuid,p_data jsonb,p_model text,p_prompt text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE document public.candidate_documents; BEGIN
  PERFORM check_task_lease(p_task,p_lease);
  SELECT * INTO document FROM candidate_documents WHERE id=p_document AND task_id=p_task AND status IN('queued','processing','failed','review') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document is no longer awaiting extraction';END IF;
  INSERT INTO resume_extractions(document_id,data,model,prompt_version) VALUES(p_document,p_data,p_model,p_prompt) ON CONFLICT(document_id) DO NOTHING;
  UPDATE candidate_documents SET status='review',error=NULL WHERE id=p_document;
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_resume(p_actor uuid,p_document uuid,p_expected integer,p_fields jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE document public.candidate_documents; extraction public.resume_extractions; actor public.profiles;target uuid;fields jsonb;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id=p_actor AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'Resume access denied';END IF;
  SELECT * INTO document FROM candidate_documents WHERE id=p_document;
  PERFORM pg_advisory_xact_lock(hashtextextended('resume:'||COALESCE(document.candidate_id::text,document.owner_id::text),0));
  SELECT * INTO document FROM candidate_documents WHERE id=p_document FOR UPDATE;
  IF NOT FOUND OR (actor.role='client' AND document.owner_id<>p_actor) THEN RAISE EXCEPTION 'Resume access denied';END IF;
  IF document.status='confirmed' THEN RETURN document.candidate_id;END IF;
  IF document.status<>'review' OR document.candidate_version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Resume or profile changed; reload before confirming';END IF;
  IF EXISTS(SELECT 1 FROM candidate_documents newer WHERE newer.id<>document.id AND newer.status<>'deleted' AND newer.created_at>document.created_at AND
    (document.candidate_id IS NOT NULL AND newer.candidate_id=document.candidate_id OR document.candidate_id IS NULL AND newer.candidate_id IS NULL AND newer.owner_id=document.owner_id)) THEN
    RAISE EXCEPTION 'A newer resume exists; review the latest draft';END IF;
  SELECT * INTO extraction FROM resume_extractions WHERE document_id=p_document;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resume extraction is not ready';END IF;
  fields:=p_fields||jsonb_build_object('employment_history',extraction.data->'employmentHistory','education_history',extraction.data->'educationHistory','evidence',extraction.data->'evidence');
  target:=save_candidate_profile(p_actor,document.candidate_id,p_expected,fields);
  UPDATE candidate_documents SET status='confirmed',candidate_id=target WHERE id=p_document;
  INSERT INTO audit_events(actor_id,action,subject_id) VALUES(p_actor,'resume_confirmed',target);
  RETURN target;
END; $$;

CREATE OR REPLACE FUNCTION public.register_resume(p_actor uuid,p_document uuid,p_candidate uuid,p_expected integer,p_path text,p_filename text,p_hash text) RETURNS uuid 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE task uuid;actor profiles;candidate candidates;BEGIN
  SELECT * INTO actor FROM profiles WHERE id=p_actor AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'Resume access denied';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('resume:'||COALESCE(p_candidate::text,p_actor::text),0));
  IF p_candidate IS NOT NULL THEN SELECT * INTO candidate FROM candidates WHERE id=p_candidate FOR UPDATE;IF NOT FOUND OR actor.role='client' AND candidate.user_id IS DISTINCT FROM p_actor OR candidate.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Candidate changed or access denied';END IF;END IF;
  IF split_part(p_path,'/',1)<>p_actor::text THEN RAISE EXCEPTION 'Invalid private object path';END IF;
  INSERT INTO candidate_documents(id,owner_id,candidate_id,candidate_version,object_path,filename,content_hash,consent_at) VALUES(p_document,p_actor,p_candidate,p_expected,p_path,p_filename,p_hash,now());
  task:=enqueue_task(p_actor,'resume_extract',jsonb_build_object('documentId',p_document),'resume:'||p_document||':v1');
  UPDATE candidate_documents SET task_id=task WHERE id=p_document;RETURN task;
END;$$;

CREATE OR REPLACE FUNCTION public.retry_task(p_actor uuid,p_task uuid) RETURNS uuid 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE task background_tasks;BEGIN
  SELECT * INTO task FROM background_tasks WHERE id=p_task FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND status='active' AND (p_actor=task.actor_id OR role='super_admin')) THEN RAISE EXCEPTION 'Task access denied';END IF;
  IF task.status<>'failed' THEN RAISE EXCEPTION 'Only failed tasks can be retried';END IF;
  IF task.kind='resume_extract' THEN
    PERFORM 1 FROM candidate_documents WHERE task_id=p_task AND status NOT IN('deleted','confirmed') FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Document unavailable';END IF;
    UPDATE candidate_documents SET status='queued',error=NULL WHERE task_id=p_task;
  END IF;
  UPDATE background_tasks SET status='queued',attempts=0,available_at=now(),lease_token=NULL,lease_until=NULL,error=NULL,result=NULL WHERE id=p_task;RETURN p_task;
END;$$;

CREATE OR REPLACE FUNCTION public.record_task_failure(p_task uuid,p_lease uuid,p_error text) RETURNS void 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE task background_tasks;BEGIN
  PERFORM check_task_lease(p_task,p_lease);SELECT * INTO task FROM background_tasks WHERE id=p_task;
  IF task.kind='resume_extract' THEN UPDATE candidate_documents SET status='failed',error=p_error WHERE task_id=p_task AND status IN('queued','processing','failed');END IF;
  IF task.kind='source_sync' THEN UPDATE job_sources SET health='stale',error=p_error,last_checked_at=now() WHERE id=(task.payload->>'sourceId')::uuid;
  UPDATE jobs SET state='stale' WHERE source_id=(task.payload->>'sourceId')::uuid AND state='active';END IF;
END;$$;

CREATE OR REPLACE FUNCTION public.enqueue_source_sync(p_actor uuid,p_source uuid) RETURNS uuid 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;BEGIN
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND status='active' AND role IN('recruiter','super_admin')) THEN RAISE EXCEPTION 'Source access denied';END IF;
  PERFORM 1 FROM job_sources WHERE id=p_source AND enabled FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Source is disabled or missing';END IF;
  SELECT id INTO target FROM background_tasks WHERE kind='source_sync' AND payload->>'sourceId'=p_source::text AND status IN('queued','running') LIMIT 1;
  IF target IS NULL THEN target:=enqueue_task(p_actor,'source_sync',jsonb_build_object('sourceId',p_source),'source:'||p_source||':'||gen_random_uuid());END IF;
  RETURN target;
END;$$;

CREATE OR REPLACE FUNCTION public.save_job_snapshot(p_task uuid,p_lease uuid,p_source uuid,p_jobs jsonb,p_complete boolean) RETURNS jsonb 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb; total integer;BEGIN
  PERFORM check_task_lease(p_task,p_lease);
  PERFORM 1 FROM job_sources WHERE id=p_source AND enabled FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Source no longer enabled';END IF;
  IF NOT EXISTS(SELECT 1 FROM background_tasks WHERE id=p_task AND kind='source_sync' AND payload->>'sourceId'=p_source::text) THEN RAISE EXCEPTION 'Invalid task source';END IF;
  IF EXISTS(SELECT 1 FROM source_sync_runs WHERE task_id=p_task) THEN RETURN jsonb_build_object('cached',true);END IF;
  IF jsonb_typeof(p_jobs)<>'array' THEN RAISE EXCEPTION 'Invalid jobs snapshot';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_jobs) LOOP
    INSERT INTO jobs(source_id,external_id,title,company,source_url,application_url,location,department,description,description_html,employment_type,employment_evidence,arrangements,compensation,content_hash)
    VALUES(p_source,item->>'external_id',item->>'title',item->>'company',item->>'source_url',item->>'application_url',item->>'location',item->>'department',item->>'description',item->>'description_html',item->>'employment_type',item->>'employment_evidence',item->'arrangements',item->'compensation',item->>'content_hash')
    ON CONFLICT(source_id,external_id) DO UPDATE SET title=EXCLUDED.title,company=EXCLUDED.company,source_url=EXCLUDED.source_url,application_url=EXCLUDED.application_url,location=EXCLUDED.location,department=EXCLUDED.department,description=EXCLUDED.description,description_html=EXCLUDED.description_html,employment_type=EXCLUDED.employment_type,employment_evidence=EXCLUDED.employment_evidence,arrangements=EXCLUDED.arrangements,compensation=EXCLUDED.compensation,content_hash=EXCLUDED.content_hash,version=jobs.version+CASE WHEN jobs.content_hash<>EXCLUDED.content_hash THEN 1 ELSE 0 END,state='active',last_seen_at=now(),updated_at=CASE WHEN jobs.content_hash<>EXCLUDED.content_hash THEN now() ELSE jobs.updated_at END;
  END LOOP;
  IF p_complete THEN UPDATE jobs SET state='closed' WHERE source_id=p_source AND external_id NOT IN(SELECT value->>'external_id' FROM jsonb_array_elements(p_jobs));END IF;
  total:=jsonb_array_length(p_jobs);INSERT INTO source_sync_runs(source_id,task_id,complete,count) VALUES(p_source,p_task,p_complete,total);
  UPDATE job_sources SET last_checked_at=now(),last_success_at=CASE WHEN p_complete THEN now() ELSE last_success_at END,health=CASE WHEN p_complete THEN 'healthy' ELSE 'partial' END,error=CASE WHEN p_complete THEN NULL ELSE 'Incomplete snapshot; omitted jobs retained.' END WHERE id=p_source;
  RETURN jsonb_build_object('count',total,'complete',p_complete);
END;$$;

CREATE OR REPLACE FUNCTION public.save_recruiting_artifact(p_task uuid,p_lease uuid,p_candidate uuid,p_job uuid,p_cv integer,p_jv integer,p_data jsonb,p_model text,p_packet boolean) RETURNS uuid 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate public.candidates; job public.jobs;task public.background_tasks; target uuid;submission uuid;BEGIN
  PERFORM check_task_lease(p_task,p_lease);SELECT * INTO task FROM background_tasks WHERE id=p_task;
  SELECT * INTO candidate FROM candidates WHERE id=p_candidate FOR UPDATE;SELECT * INTO job FROM jobs WHERE id=p_job FOR UPDATE;
  IF candidate.version IS DISTINCT FROM p_cv OR job.version IS DISTINCT FROM p_jv OR candidate.provenance_status<>'confirmed' OR job.state='closed' THEN RAISE EXCEPTION 'Candidate or job changed; review and retry';END IF;
  IF task.payload->>'candidateId'<>p_candidate::text OR task.payload->>'jobId'<>p_job::text OR
  NOT EXISTS(SELECT 1 FROM profiles p WHERE p.id=task.actor_id AND p.status='active' AND (p.role IN('recruiter','super_admin') OR p.role='client' AND candidate.user_id=p.id)) THEN RAISE EXCEPTION 'Artifact access denied';END IF;
  IF p_packet THEN
    IF task.kind<>'packet_generate' OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=task.actor_id AND role IN('recruiter','super_admin')) THEN RAISE EXCEPTION 'Packet access denied';END IF;
    SELECT id INTO target FROM submission_packets WHERE task_id=p_task;IF target IS NOT NULL THEN RETURN target;END IF;
    INSERT INTO job_submissions(candidate_id,recruiter_id,company_name,job_title,job_url,job_id,status,notes)
    VALUES(p_candidate,task.actor_id,job.company,job.title,job.application_url,p_job,'Draft','Draft prepared; no external application submitted.') RETURNING id INTO submission;
    INSERT INTO submission_packets(candidate_id,job_id,candidate_version,job_version,data,submission_id,task_id) VALUES(p_candidate,p_job,p_cv,p_jv,p_data,submission,p_task) RETURNING id INTO target;
  ELSE
    IF task.kind<>'candidate_match' THEN RAISE EXCEPTION 'Invalid match task';END IF;
    INSERT INTO candidate_matches(candidate_id,job_id,candidate_version,job_version,data,model) VALUES(p_candidate,p_job,p_cv,p_jv,p_data,p_model)
    ON CONFLICT(candidate_id,job_id,candidate_version,job_version,prompt_version) DO UPDATE SET data=candidate_matches.data RETURNING id INTO target;
  END IF;
  RETURN target;
END;$$;

CREATE OR REPLACE FUNCTION public.workspace_metrics(p_actor uuid) RETURNS jsonb 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor profiles;result jsonb;BEGIN
  SELECT * INTO actor FROM profiles WHERE id=p_actor AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'Account access denied';END IF;
  SELECT jsonb_build_object('candidates',(SELECT count(*) FROM candidates WHERE actor.role IN('recruiter','super_admin') OR user_id=p_actor),
  'submissions',(SELECT count(*) FROM job_submissions s WHERE actor.role IN('recruiter','super_admin') OR EXISTS(SELECT 1 FROM candidates c WHERE c.id=s.candidate_id AND c.user_id=p_actor)),
  'confirmed',(SELECT count(*) FROM job_submissions s WHERE capture_status='confirmed' AND (actor.role IN('recruiter','super_admin') OR EXISTS(SELECT 1 FROM candidates c WHERE c.id=s.candidate_id AND c.user_id=p_actor))),
  'contractJobs',(SELECT count(*) FROM jobs WHERE state<>'closed' AND employment_type='contract'),
  'vendors',CASE WHEN actor.role IN('recruiter','super_admin') THEN (SELECT count(*) FROM vendors) ELSE NULL END,
  'activity',COALESCE((SELECT jsonb_agg(row_to_json(activity)) FROM (SELECT submission_date::text AS date,count(*) AS submissions FROM job_submissions s WHERE submission_date>=current_date-30 AND (actor.role IN('recruiter','super_admin') OR EXISTS(SELECT 1 FROM candidates c WHERE c.id=s.candidate_id AND c.user_id=p_actor)) GROUP BY submission_date ORDER BY submission_date) activity),'[]'::jsonb)) INTO result;RETURN result;
END;$$;

REVOKE ALL ON FUNCTION public.save_candidate_profile(uuid,uuid,integer,jsonb),public.save_vendor(uuid,jsonb,jsonb),public.enqueue_task(uuid,text,jsonb,text),public.claim_task(uuid),public.check_task_lease(uuid,uuid),public.heartbeat_task(uuid,uuid),public.finish_task(uuid,uuid,jsonb,text,boolean),public.reserve_ai_call(uuid,uuid,text),public.save_resume_extraction(uuid,uuid,uuid,jsonb,text,text),public.confirm_resume(uuid,uuid,integer,jsonb),public.register_resume(uuid,uuid,uuid,integer,text,text,text),public.retry_task(uuid,uuid),public.record_task_failure(uuid,uuid,text),public.enqueue_source_sync(uuid,uuid),public.save_job_snapshot(uuid,uuid,uuid,jsonb,boolean),public.save_recruiting_artifact(uuid,uuid,uuid,uuid,integer,integer,jsonb,text,boolean),public.workspace_metrics(uuid) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.save_candidate_profile(uuid,uuid,integer,jsonb),public.save_vendor(uuid,jsonb,jsonb),public.enqueue_task(uuid,text,jsonb,text),public.claim_task(uuid),public.check_task_lease(uuid,uuid),public.heartbeat_task(uuid,uuid),public.finish_task(uuid,uuid,jsonb,text,boolean),public.reserve_ai_call(uuid,uuid,text),public.save_resume_extraction(uuid,uuid,uuid,jsonb,text,text),public.confirm_resume(uuid,uuid,integer,jsonb),public.register_resume(uuid,uuid,uuid,integer,text,text,text),public.retry_task(uuid,uuid),public.record_task_failure(uuid,uuid,text),public.enqueue_source_sync(uuid,uuid),public.save_job_snapshot(uuid,uuid,uuid,jsonb,boolean),public.save_recruiting_artifact(uuid,uuid,uuid,uuid,integer,integer,jsonb,text,boolean),public.workspace_metrics(uuid) TO service_role;

COMMIT;
