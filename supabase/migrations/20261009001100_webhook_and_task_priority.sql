-- Migration: 20261009001100_webhook_and_task_priority.sql
-- Optimizes background task claiming for instant Supabase Webhook & Serverless execution.
-- 1. Adds claim_specific_task to claim a single task by ID immediately upon webhook receipt.
-- 2. Updates claim_task to prioritize interactive tasks (resume_extract) over batch background jobs (source_sync).

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_specific_task(p_task uuid, p_lease uuid) 
RETURNS SETOF public.background_tasks 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE 
  target uuid;
BEGIN
  -- Mark as failed if retry limit reached and lease expired
  UPDATE background_tasks SET status='failed',error='Retry limit reached after worker interruption',lease_token=NULL,lease_until=NULL
    WHERE id=p_task AND status='running' AND lease_until<now() AND attempts>=3;

  SELECT task.id INTO target 
  FROM background_tasks task 
  JOIN profiles profile ON profile.id=task.actor_id
  WHERE task.id=p_task 
    AND profile.status='active' 
    AND task.attempts<3 
    AND (
      (task.status='queued' AND task.available_at<=now()) 
      OR (task.status='running' AND task.lease_until<now())
      OR (task.status='running' AND task.lease_token=p_lease)
    )
  FOR UPDATE OF task LIMIT 1;

  IF target IS NOT NULL THEN
    RETURN QUERY 
    UPDATE background_tasks 
    SET status='running',attempts=attempts+1,lease_token=p_lease,lease_until=now()+interval '3 minutes',updated_at=now() 
    WHERE id=target 
    RETURNING *;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_task(p_lease uuid) 
RETURNS SETOF public.background_tasks 
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE 
  target uuid; 
BEGIN
  UPDATE background_tasks SET status='failed',error='Retry limit reached after worker interruption',lease_token=NULL,lease_until=NULL
    WHERE status='running' AND lease_until<now() AND attempts>=3;

  SELECT task.id INTO target 
  FROM background_tasks task 
  JOIN profiles profile ON profile.id=task.actor_id
  WHERE profile.status='active' 
    AND task.attempts<3 
    AND ((task.status='queued' AND task.available_at<=now()) OR (task.status='running' AND task.lease_until<now()))
  ORDER BY 
    CASE WHEN task.kind='resume_extract' THEN 0 ELSE 1 END,
    task.available_at,
    task.created_at 
  FOR UPDATE OF task SKIP LOCKED LIMIT 1;

  RETURN QUERY 
  UPDATE background_tasks 
  SET status='running',attempts=attempts+1,lease_token=p_lease,lease_until=now()+interval '3 minutes',updated_at=now() 
  WHERE id=target 
  RETURNING *;
END; $$;

REVOKE ALL ON FUNCTION public.claim_specific_task(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_specific_task(uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_task(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_task(uuid) TO service_role;

COMMIT;
