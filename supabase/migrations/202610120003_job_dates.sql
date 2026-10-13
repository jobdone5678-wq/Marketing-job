BEGIN;
-- Source publication and application deadline are independent of sync timestamps and observed state.
-- Existing rows intentionally remain NULL: no historical dates can be inferred safely.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS closes_at timestamptz;
COMMENT ON COLUMN public.jobs.posted_at IS 'Provider publication timestamp: Greenhouse first publication; Ashby last publication, including republication. NULL when unavailable.';
COMMENT ON COLUMN public.jobs.closes_at IS 'Explicit provider application deadline only. NULL when unavailable. Independent of observed closed state.';
CREATE OR REPLACE FUNCTION public.save_job_snapshot(p_task uuid,p_lease uuid,p_source uuid,p_jobs jsonb,p_complete boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb; total integer;BEGIN
 PERFORM check_task_lease(p_task,p_lease);
 PERFORM 1 FROM job_sources WHERE id=p_source AND enabled FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Source no longer enabled';END IF;
 IF NOT EXISTS(SELECT 1 FROM background_tasks WHERE id=p_task AND kind='source_sync' AND payload->>'sourceId'=p_source::text) THEN RAISE EXCEPTION 'Invalid task source';END IF;
 IF EXISTS(SELECT 1 FROM source_sync_runs WHERE task_id=p_task) THEN RETURN jsonb_build_object('cached',true);END IF;
 IF jsonb_typeof(p_jobs)<>'array' THEN RAISE EXCEPTION 'Invalid jobs snapshot';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_jobs) LOOP
 INSERT INTO jobs(source_id,external_id,title,company,source_url,application_url,location,department,description,description_html,employment_type,employment_evidence,arrangements,compensation,posted_at,closes_at,content_hash)
 VALUES(p_source,item->>'external_id',item->>'title',item->>'company',item->>'source_url',item->>'application_url',item->>'location',item->>'department',item->>'description',item->>'description_html',item->>'employment_type',item->>'employment_evidence',item->'arrangements',item->'compensation',NULLIF(item->>'posted_at','')::timestamptz,NULLIF(item->>'closes_at','')::timestamptz,item->>'content_hash')
 ON CONFLICT(source_id,external_id) DO UPDATE SET title=EXCLUDED.title,company=EXCLUDED.company,source_url=EXCLUDED.source_url,application_url=EXCLUDED.application_url,location=EXCLUDED.location,department=EXCLUDED.department,description=EXCLUDED.description,description_html=EXCLUDED.description_html,employment_type=EXCLUDED.employment_type,employment_evidence=EXCLUDED.employment_evidence,arrangements=EXCLUDED.arrangements,compensation=EXCLUDED.compensation,posted_at=EXCLUDED.posted_at,closes_at=EXCLUDED.closes_at,content_hash=EXCLUDED.content_hash,version=jobs.version+CASE WHEN jobs.content_hash<>EXCLUDED.content_hash THEN 1 ELSE 0 END,state='active',last_seen_at=now(),updated_at=CASE WHEN jobs.content_hash<>EXCLUDED.content_hash THEN now() ELSE jobs.updated_at END;
 END LOOP;
 IF p_complete THEN UPDATE jobs SET state='closed' WHERE source_id=p_source AND external_id NOT IN(SELECT value->>'external_id' FROM jsonb_array_elements(p_jobs));END IF;
 total:=jsonb_array_length(p_jobs);INSERT INTO source_sync_runs(source_id,task_id,complete,count) VALUES(p_source,p_task,p_complete,total);
 UPDATE job_sources SET last_checked_at=now(),last_success_at=CASE WHEN p_complete THEN now() ELSE last_success_at END,health=CASE WHEN p_complete THEN 'healthy' ELSE 'partial' END,error=CASE WHEN p_complete THEN NULL ELSE 'Incomplete snapshot; omitted jobs retained.' END WHERE id=p_source;
 RETURN jsonb_build_object('count',total,'complete',p_complete);END;$$;
COMMIT;
