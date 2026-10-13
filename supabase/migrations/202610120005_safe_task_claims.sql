BEGIN;
-- Targeted notifications share the durable worker lease contract. Duplicate calls are no-ops.
CREATE OR REPLACE FUNCTION public.claim_specific_task(p_task uuid,p_lease uuid)
RETURNS SETOF public.background_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 IF p_lease IS NULL THEN RAISE EXCEPTION 'Lease token required'; END IF;
 SELECT task.id INTO target FROM public.background_tasks task JOIN public.profiles profile ON profile.id=task.actor_id
 WHERE task.id=p_task AND profile.status='active' AND task.attempts<3
 AND ((task.status='queued' AND task.available_at<=now()) OR (task.status='running' AND task.lease_until<now()))
 FOR UPDATE OF task SKIP LOCKED LIMIT 1;
 RETURN QUERY UPDATE public.background_tasks SET status='running',attempts=attempts+1,lease_token=p_lease,
 lease_until=now()+interval '3 minutes',updated_at=now() WHERE id=target RETURNING *;
END; $$;
REVOKE ALL ON FUNCTION public.claim_specific_task(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_specific_task(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
