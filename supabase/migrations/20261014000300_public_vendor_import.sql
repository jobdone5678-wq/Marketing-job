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
