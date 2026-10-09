BEGIN;
ALTER TABLE public.job_submissions ALTER COLUMN status SET DEFAULT 'Draft';
CREATE TABLE public.background_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL CHECK(kind IN('resume_extract','source_sync','candidate_match','packet_generate')),payload jsonb NOT NULL,
  idempotency_key text NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','succeeded','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),lease_token uuid,lease_until timestamptz,
  result jsonb,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(kind,idempotency_key));
CREATE INDEX task_ready ON public.background_tasks(status,available_at);
CREATE TABLE public.provider_usage(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid REFERENCES public.background_tasks(id),model text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES public.profiles(id),action text NOT NULL,subject_id uuid,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.background_tasks ENABLE ROW LEVEL SECURITY;ALTER TABLE public.provider_usage ENABLE ROW LEVEL SECURITY;ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_tasks ON public.background_tasks FOR SELECT TO authenticated USING(actor_id=auth.uid() AND public.get_current_role() IS NOT NULL OR public.get_current_role()='super_admin');
CREATE POLICY admin_usage ON public.provider_usage FOR SELECT TO authenticated USING(public.get_current_role()='super_admin');
CREATE POLICY admin_audit ON public.audit_events FOR SELECT TO authenticated USING(public.get_current_role()='super_admin');
REVOKE ALL ON public.background_tasks,public.provider_usage,public.audit_events FROM anon,authenticated;
GRANT SELECT ON public.background_tasks,public.provider_usage,public.audit_events TO authenticated;GRANT ALL ON public.background_tasks,public.provider_usage,public.audit_events TO service_role;
CREATE FUNCTION public.enqueue_task(p_actor uuid,p_kind text,p_payload jsonb,p_key text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid; BEGIN
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND status='active') THEN RAISE EXCEPTION 'Active account required';END IF;
  INSERT INTO background_tasks(actor_id,kind,payload,idempotency_key) VALUES(p_actor,p_kind,p_payload,p_key)
    ON CONFLICT(kind,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id INTO target;
  RETURN target;
END; $$;
CREATE FUNCTION public.claim_task(p_lease uuid) RETURNS SETOF public.background_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid; BEGIN
  UPDATE background_tasks SET status='failed',error='Retry limit reached after worker interruption',lease_token=NULL,lease_until=NULL
    WHERE status='running' AND lease_until<now() AND attempts>=3;
  SELECT task.id INTO target FROM background_tasks task JOIN profiles profile ON profile.id=task.actor_id
    WHERE profile.status='active' AND task.attempts<3 AND (task.status='queued' AND task.available_at<=now() OR task.status='running' AND task.lease_until<now())
    ORDER BY task.available_at,task.created_at FOR UPDATE OF task SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE background_tasks SET status='running',attempts=attempts+1,lease_token=p_lease,lease_until=now()+interval '3 minutes',updated_at=now() WHERE id=target RETURNING *;
END; $$;
CREATE FUNCTION public.check_task_lease(p_task uuid,p_lease uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM background_tasks task JOIN profiles profile ON profile.id=task.actor_id WHERE task.id=p_task AND task.status='running'
    AND task.lease_token=p_lease AND task.lease_until>now() AND profile.status='active' FOR UPDATE OF task;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active task lease required';END IF;
END; $$;
CREATE FUNCTION public.heartbeat_task(p_task uuid,p_lease uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM check_task_lease(p_task,p_lease);UPDATE background_tasks SET lease_until=now()+interval '3 minutes' WHERE id=p_task;END; $$;
CREATE FUNCTION public.finish_task(p_task uuid,p_lease uuid,p_result jsonb,p_error text,p_transient boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM check_task_lease(p_task,p_lease);
  UPDATE background_tasks SET status=CASE WHEN p_error IS NULL THEN 'succeeded' WHEN p_transient AND attempts<3 THEN 'queued' ELSE 'failed' END,
    result=p_result,error=p_error,available_at=now()+make_interval(secs=>30*attempts*attempts),lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=p_task;
END; $$;
CREATE FUNCTION public.reserve_ai_call(p_task uuid,p_lease uuid,p_model text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE quota integer;counted integer;target uuid;BEGIN
  PERFORM check_task_lease(p_task,p_lease);
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-budget:'||(now() AT TIME ZONE 'UTC')::date::text,0));
  SELECT ai_daily_limit INTO quota FROM workspace_settings WHERE id=true;
  SELECT count(*) INTO counted FROM provider_usage WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF counted>=quota THEN RAISE EXCEPTION 'Daily AI budget exhausted';END IF;
  INSERT INTO provider_usage(task_id,model) VALUES(p_task,p_model) RETURNING id INTO target;RETURN target;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_task(uuid,text,jsonb,text),public.claim_task(uuid),public.check_task_lease(uuid,uuid),public.heartbeat_task(uuid,uuid),public.finish_task(uuid,uuid,jsonb,text,boolean),public.reserve_ai_call(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_task(uuid,text,jsonb,text),public.claim_task(uuid),public.check_task_lease(uuid,uuid),public.heartbeat_task(uuid,uuid),public.finish_task(uuid,uuid,jsonb,text,boolean),public.reserve_ai_call(uuid,uuid,text) TO service_role;
COMMIT;
