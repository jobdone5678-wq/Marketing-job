-- Rerunnable update for public directory import and exclusive AI task claims.
-- Requires the existing recruiting operations schema.

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

BEGIN;
-- Server-only, insert-only import. Serialize imports to make concurrent retries
-- idempotent without changing or deduplicating existing CRM records.
CREATE OR REPLACE FUNCTION public.import_public_vendors(p_entries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE entry jsonb; imported integer := 0; skipped integer := 0; host text;
BEGIN
  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' OR jsonb_array_length(p_entries) > 50 THEN
    RAISE EXCEPTION 'Expected at most 50 public company entries';
  END IF;
  PERFORM pg_advisory_xact_lock(20261014, 3);
  FOR entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    IF nullif(trim(entry->>'name'),'') IS NULL OR nullif(entry->>'public_directory_id','') IS NULL OR coalesce(entry->>'website','') !~ '^https://' THEN
      RAISE EXCEPTION 'Invalid public company entry';
    END IF;
    host := split_part(regexp_replace(lower(entry->>'website'), '^https?://(www\.)?', ''), '/', 1);
    IF EXISTS (SELECT 1 FROM public.vendors v WHERE
      v.data->>'public_directory_id' = entry->>'public_directory_id'
      OR lower(trim(v.name)) = lower(trim(entry->>'name'))
      OR split_part(regexp_replace(lower(v.data->>'website'), '^https?://(www\.)?', ''), '/', 1) = host
    ) THEN skipped := skipped + 1;
    ELSE
      INSERT INTO public.vendors(name,data) VALUES(trim(entry->>'name'), entry-'id'-'contacts');
      imported := imported + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('imported', imported, 'skipped', skipped);
END; $$;
REVOKE ALL ON FUNCTION public.import_public_vendors(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_public_vendors(jsonb) TO service_role;
COMMIT;

NOTIFY pgrst,'reload schema';
