BEGIN;
CREATE TABLE public.application_intents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES profiles(id),candidate_id uuid NOT NULL REFERENCES candidates(id),job_id uuid NOT NULL REFERENCES jobs(id),submission_id uuid NOT NULL REFERENCES job_submissions(id) ON DELETE RESTRICT,attempt integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner_id,candidate_id,job_id));
CREATE TABLE public.extension_pair_codes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES profiles(id),code_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',used_at timestamptz);
CREATE TABLE public.extension_credentials(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES profiles(id),token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.browser_capture_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),intent_id uuid NOT NULL REFERENCES application_intents(id),event_key uuid NOT NULL,status text NOT NULL CHECK(status IN('in_progress','submit_attempted','submitted','failed')),attempt integer NOT NULL CHECK(attempt>=1),source text NOT NULL CHECK(source IN('extension_observation','recruiter_attestation')),evidence text NOT NULL CHECK(length(evidence)<=1000),url text NOT NULL,observed_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(intent_id,event_key));
ALTER TABLE application_intents ENABLE ROW LEVEL SECURITY;ALTER TABLE extension_pair_codes ENABLE ROW LEVEL SECURITY;ALTER TABLE extension_credentials ENABLE ROW LEVEL SECURITY;ALTER TABLE browser_capture_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY intent_reads ON application_intents FOR SELECT TO authenticated USING(owner_id=auth.uid() AND get_current_role() IN('recruiter','super_admin'));
CREATE POLICY event_reads ON browser_capture_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM application_intents i WHERE i.id=intent_id AND i.owner_id=auth.uid() AND get_current_role() IN('recruiter','super_admin')));
REVOKE ALL ON application_intents,extension_pair_codes,extension_credentials,browser_capture_events FROM anon,authenticated;
GRANT SELECT ON application_intents,browser_capture_events TO authenticated;GRANT SELECT(id,owner_id,expires_at,revoked_at,created_at) ON extension_credentials TO authenticated;
CREATE POLICY credential_reads ON extension_credentials FOR SELECT TO authenticated USING(owner_id=auth.uid() AND get_current_role() IN('recruiter','super_admin'));
GRANT ALL ON application_intents,extension_pair_codes,extension_credentials,browser_capture_events TO service_role;
CREATE FUNCTION public.pair_extension(p_code text,p_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE code extension_pair_codes;target uuid;BEGIN
 SELECT * INTO code FROM extension_pair_codes WHERE code_hash=p_code AND used_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=code.owner_id AND status='active' AND role IN('recruiter','super_admin')) THEN RAISE EXCEPTION 'Pairing code expired or invalid';END IF;
 UPDATE extension_pair_codes SET used_at=now() WHERE id=code.id;INSERT INTO extension_credentials(owner_id,token_hash) VALUES(code.owner_id,p_token) RETURNING id INTO target;RETURN target;END;$$;
CREATE FUNCTION public.create_application_intent(p_actor uuid,p_candidate uuid,p_job uuid,p_submission uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job jobs;target uuid;submission uuid;matches integer;BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND status='active' AND role IN('recruiter','super_admin')) THEN RAISE EXCEPTION 'Active staff required';END IF;
 SELECT * INTO job FROM jobs WHERE id=p_job AND state<>'closed';IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM candidates WHERE id=p_candidate) THEN RAISE EXCEPTION 'Candidate or job unavailable';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_candidate::text||lower(trim(job.company))||lower(trim(job.title)),0));
 SELECT id INTO target FROM application_intents WHERE owner_id=p_actor AND candidate_id=p_candidate AND job_id=p_job;IF target IS NOT NULL THEN RETURN target;END IF;
 submission:=p_submission;
 IF submission IS NOT NULL THEN
 IF NOT EXISTS(SELECT 1 FROM job_submissions WHERE id=submission AND candidate_id=p_candidate AND lower(trim(company_name))=lower(trim(job.company)) AND lower(trim(job_title))=lower(trim(job.title))) THEN RAISE EXCEPTION 'Submission does not match intent';END IF;
 ELSE
 SELECT count(*),(array_agg(id))[1] INTO matches,submission FROM job_submissions WHERE candidate_id=p_candidate AND lower(trim(company_name))=lower(trim(job.company)) AND lower(trim(job_title))=lower(trim(job.title)) AND submission_date>=current_date-30;
 IF matches>1 THEN RAISE EXCEPTION 'Several submissions match; select the correct submission';END IF;
 END IF;
 IF submission IS NULL THEN INSERT INTO job_submissions(candidate_id,recruiter_id,company_name,job_title,job_url,job_id,status,capture_status) VALUES(p_candidate,p_actor,job.company,job.title,job.application_url,p_job,'Draft','started') RETURNING id INTO submission;
 ELSE UPDATE job_submissions SET capture_status=COALESCE(capture_status,'started'),job_id=COALESCE(job_id,p_job) WHERE id=submission;END IF;
 INSERT INTO application_intents(owner_id,candidate_id,job_id,submission_id) VALUES(p_actor,p_candidate,p_job,submission) RETURNING id INTO target;RETURN target;END;$$;
CREATE FUNCTION public.record_browser_event(p_actor uuid,p_intent uuid,p_key uuid,p_status text,p_attempt integer,p_source text,p_evidence text,p_url text,p_observed timestamptz) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE intent application_intents;current_status text;next_status text;current_rank integer;observed_rank integer;BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND status='active' AND role IN('recruiter','super_admin')) THEN RAISE EXCEPTION 'Active staff required';END IF;
 SELECT * INTO intent FROM application_intents WHERE id=p_intent AND owner_id=p_actor FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Intent access denied';END IF;
 SELECT capture_status INTO current_status FROM job_submissions WHERE id=intent.submission_id FOR UPDATE;
 INSERT INTO browser_capture_events(intent_id,event_key,status,attempt,source,evidence,url,observed_at) VALUES(p_intent,p_key,p_status,p_attempt,p_source,p_evidence,p_url,p_observed) ON CONFLICT(intent_id,event_key) DO NOTHING;
 IF NOT FOUND THEN RETURN current_status;END IF;
 next_status:=current_status;
 IF current_status NOT IN('submitted','confirmed') AND p_attempt>=intent.attempt THEN
 current_rank:=CASE current_status WHEN 'in_progress' THEN 1 WHEN 'submit_attempted' THEN 2 ELSE 0 END;
 observed_rank:=CASE p_status WHEN 'in_progress' THEN 1 WHEN 'submit_attempted' THEN 2 WHEN 'submitted' THEN 3 ELSE -1 END;
 IF p_attempt>intent.attempt OR p_status='failed' OR observed_rank>=current_rank THEN next_status:=p_status;END IF;
 END IF;
 UPDATE application_intents SET attempt=GREATEST(attempt,p_attempt) WHERE id=p_intent;
 UPDATE job_submissions SET capture_status=next_status,status=CASE WHEN next_status IN('submitted','confirmed') AND status='Draft' THEN 'Applied'::submission_status ELSE status END WHERE id=intent.submission_id;
 RETURN next_status;END;$$;
CREATE FUNCTION public.promote_confirmed_draft() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.capture_status='confirmed' AND NEW.status='Draft' THEN NEW.status:='Applied';END IF;RETURN NEW;END;$$;
CREATE TRIGGER promote_confirmed_draft BEFORE UPDATE ON job_submissions FOR EACH ROW EXECUTE FUNCTION promote_confirmed_draft();
REVOKE ALL ON FUNCTION pair_extension(text,text),create_application_intent(uuid,uuid,uuid,uuid),record_browser_event(uuid,uuid,uuid,text,integer,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION pair_extension(text,text),create_application_intent(uuid,uuid,uuid,uuid),record_browser_event(uuid,uuid,uuid,text,integer,text,text,text,timestamptz) TO service_role;
COMMIT;