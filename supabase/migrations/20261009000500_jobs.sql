BEGIN;
CREATE TABLE public.job_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider text NOT NULL CHECK(provider IN('greenhouse','ashby')),board_slug text NOT NULL CHECK(board_slug~'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$'),company text NOT NULL,enabled boolean NOT NULL DEFAULT true,created_by uuid NOT NULL REFERENCES profiles(id),last_checked_at timestamptz,last_success_at timestamptz,health text NOT NULL DEFAULT 'not_connected' CHECK(health IN('not_connected','healthy','partial','stale')),error text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider,board_slug));
CREATE TABLE public.jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id uuid NOT NULL REFERENCES job_sources(id),external_id text NOT NULL,title text NOT NULL,company text NOT NULL,source_url text NOT NULL,application_url text NOT NULL,location text,department text,description text NOT NULL,description_html text NOT NULL DEFAULT '',employment_type text NOT NULL CHECK(employment_type IN('contract','permanent','temporary','part_time','internship','unknown')),employment_evidence text,arrangements jsonb,compensation jsonb,content_hash text NOT NULL,version integer NOT NULL DEFAULT 1,state text NOT NULL DEFAULT 'active' CHECK(state IN('active','closed','stale')),updated_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(source_id,external_id));
CREATE TABLE public.source_sync_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id uuid NOT NULL REFERENCES job_sources(id),task_id uuid UNIQUE REFERENCES background_tasks(id),complete boolean NOT NULL,count integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.job_submissions ADD COLUMN job_id uuid REFERENCES jobs(id);
ALTER TABLE job_sources ENABLE ROW LEVEL SECURITY;ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;ALTER TABLE source_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_reads ON job_sources FOR SELECT TO authenticated USING(get_current_role() IN('recruiter','super_admin'));
CREATE POLICY job_reads ON jobs FOR SELECT TO authenticated USING(get_current_role() IN('client','recruiter','super_admin'));
CREATE POLICY sync_reads ON source_sync_runs FOR SELECT TO authenticated USING(get_current_role() IN('recruiter','super_admin'));
GRANT SELECT ON job_sources,jobs,source_sync_runs TO authenticated;GRANT ALL ON job_sources,jobs,source_sync_runs TO service_role;
CREATE FUNCTION public.enqueue_source_sync(p_actor uuid,p_source uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND status='active' AND role IN('recruiter','super_admin')) THEN RAISE EXCEPTION 'Source access denied';END IF;
 PERFORM 1 FROM job_sources WHERE id=p_source AND enabled FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Source is disabled or missing';END IF;
 SELECT id INTO target FROM background_tasks WHERE kind='source_sync' AND payload->>'sourceId'=p_source::text AND status IN('queued','running') LIMIT 1;
 IF target IS NULL THEN target:=enqueue_task(p_actor,'source_sync',jsonb_build_object('sourceId',p_source),'source:'||p_source||':'||gen_random_uuid());END IF;
 RETURN target;END;$$;
CREATE FUNCTION public.save_job_snapshot(p_task uuid,p_lease uuid,p_source uuid,p_jobs jsonb,p_complete boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
 RETURN jsonb_build_object('count',total,'complete',p_complete);END;$$;
REVOKE ALL ON FUNCTION enqueue_source_sync(uuid,uuid),save_job_snapshot(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION enqueue_source_sync(uuid,uuid),save_job_snapshot(uuid,uuid,uuid,jsonb,boolean) TO service_role;
COMMIT;