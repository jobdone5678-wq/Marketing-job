-- Metadata only: no business records, credentials, destructive changes or query resets.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT jsonb_build_object(
  'checked_at', now(),
  'statistics_reset', (SELECT stats_reset FROM pg_stat_database WHERE datname=current_database()),
  'batch_refresh_installed', to_regprocedure('public.sync_recruiting_periods(uuid[],uuid[])') IS NOT NULL,
  'salary_refresh_optimized', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='sync_staff_salary_periods' AND p.prosrc ILIKE '%p.status IS DISTINCT FROM s.status%'),
  'cron_installed', to_regclass('cron.job') IS NOT NULL,
  'tables', (SELECT jsonb_agg(t) FROM (SELECT relname,n_live_tup,n_dead_tup,seq_scan,idx_scan,last_autoanalyze,last_autovacuum FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC LIMIT 12) t),
  'indexes', (SELECT jsonb_agg(t) FROM (SELECT tablename,indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('jobs','background_tasks','job_submissions','candidate_staff_assignments') ORDER BY tablename,indexname) t),
  'query_totals', (SELECT jsonb_agg(t) FROM (
    SELECT queryid,calls,round(total_exec_time::numeric,2) total_ms,round(mean_exec_time::numeric,3) mean_ms,round(max_exec_time::numeric,3) max_ms,
      COALESCE((regexp_match(query,'"public"\."([^"]+)"'))[1],(regexp_match(query,'(?i)public\.([a-z_]+)'))[1],
        CASE WHEN query ILIKE '%pg_available_extensions%' THEN 'Studio extension metadata' WHEN query ILIKE '%pg_proc%' THEN 'Studio function metadata' ELSE 'system/other' END) label
    FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query NOT ILIKE '%pg_stat_statements%'
    ORDER BY total_exec_time DESC LIMIT 15
  ) t)
) AS performance_audit;
COMMIT;

-- Run separately only when cron_installed is true. Do not select command: it may contain secrets.
-- SELECT jobid,jobname,schedule,active,md5(command) AS command_hash FROM cron.job ORDER BY jobid;
