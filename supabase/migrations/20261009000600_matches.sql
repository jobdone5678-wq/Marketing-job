BEGIN;
CREATE TABLE public.candidate_matches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_id uuid NOT NULL REFERENCES candidates(id),job_id uuid NOT NULL REFERENCES jobs(id),candidate_version integer NOT NULL,job_version integer NOT NULL,data jsonb NOT NULL,model text NOT NULL,prompt_version text NOT NULL DEFAULT 'match-v1',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(candidate_id,job_id,candidate_version,job_version,prompt_version));
CREATE TABLE public.submission_packets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_id uuid NOT NULL REFERENCES candidates(id),job_id uuid NOT NULL REFERENCES jobs(id),candidate_version integer NOT NULL,job_version integer NOT NULL,data jsonb NOT NULL,submission_id uuid REFERENCES job_submissions(id),task_id uuid UNIQUE REFERENCES background_tasks(id),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE candidate_matches ENABLE ROW LEVEL SECURITY;ALTER TABLE submission_packets ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_reads ON candidate_matches FOR SELECT TO authenticated USING(get_current_role() IN('recruiter','super_admin') OR get_current_role()='client' AND EXISTS(SELECT 1 FROM candidates c WHERE c.id=candidate_id AND c.user_id=auth.uid()));
CREATE POLICY packet_reads ON submission_packets FOR SELECT TO authenticated USING(get_current_role() IN('recruiter','super_admin') OR get_current_role()='client' AND EXISTS(SELECT 1 FROM candidates c WHERE c.id=candidate_id AND c.user_id=auth.uid()));
GRANT SELECT ON candidate_matches,submission_packets TO authenticated;GRANT ALL ON candidate_matches,submission_packets TO service_role;
CREATE FUNCTION public.save_recruiting_artifact(p_task uuid,p_lease uuid,p_candidate uuid,p_job uuid,p_cv integer,p_jv integer,p_data jsonb,p_model text,p_packet boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
 END IF;RETURN target;END;$$;
REVOKE ALL ON FUNCTION save_recruiting_artifact(uuid,uuid,uuid,uuid,integer,integer,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION save_recruiting_artifact(uuid,uuid,uuid,uuid,integer,integer,jsonb,text,boolean) TO service_role;
COMMIT;