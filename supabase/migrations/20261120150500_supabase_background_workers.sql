-- 20261120150500_supabase_background_workers.sql
-- Integrates native Supabase background processing via pg_net and pg_cron:
-- 1. Instant task processing trigger on background_tasks -> Next.js /api/webhooks/process-task via pg_net
-- 2. Stalled task lease recovery and re-dispatch sweeper via pg_cron
-- 3. Automatic periodic job source sync scheduler via pg_cron
-- 4. Managed email confirmation sync verification via pg_cron

BEGIN;

-- Ensure pg_net and pg_cron extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA net;
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA cron;

-- Create private schema for worker settings (isolated from PostgREST Data API)
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO postgres, service_role;

-- Worker settings table to store webhook destination and authorization secret
CREATE TABLE IF NOT EXISTS app_private.worker_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  webhook_url text NOT NULL DEFAULT 'https://www.nextkinhr.com/api/webhooks/process-task',
  webhook_secret text NOT NULL DEFAULT '7926d035725a0c8e6cf0896a294cd3697d9f027a7dc99fbbbb82e53c0fc6b824',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE app_private.worker_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE app_private.worker_settings TO postgres, service_role;

-- Seed default settings if not already present
INSERT INTO app_private.worker_settings (id, webhook_url, webhook_secret, enabled)
VALUES (
  true,
  'https://www.nextkinhr.com/api/webhooks/process-task',
  '7926d035725a0c8e6cf0896a294cd3697d9f027a7dc99fbbbb82e53c0fc6b824',
  true
)
ON CONFLICT (id) DO UPDATE SET updated_at = now();

-- Trigger function: dispatches an async HTTP webhook via pg_net when a task is queued
CREATE OR REPLACE FUNCTION public.dispatch_background_task_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, net, pg_temp AS $$
DECLARE
  v_settings app_private.worker_settings;
BEGIN
  SELECT * INTO v_settings FROM app_private.worker_settings WHERE id = true;
  IF NOT FOUND OR NOT v_settings.enabled OR v_settings.webhook_url IS NULL OR v_settings.webhook_url = '' THEN
    RETURN NEW;
  END IF;

  -- Asynchronously invoke Next.js webhook endpoint using pg_net
  PERFORM net.http_post(
    url := v_settings.webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_settings.webhook_secret
    ),
    body := jsonb_build_object(
      'table', 'background_tasks',
      'record', jsonb_build_object(
        'id', NEW.id,
        'kind', NEW.kind
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-fatal warning so task insertion into database never fails even if HTTP queue has a momentary issue
  RAISE WARNING 'Failed to enqueue task webhook via pg_net: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_background_task_webhook() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_background_task_webhook() TO postgres, service_role;

-- Attach trigger to public.background_tasks
DROP TRIGGER IF EXISTS trg_background_task_webhook ON public.background_tasks;
CREATE TRIGGER trg_background_task_webhook
  AFTER INSERT OR UPDATE OF status ON public.background_tasks
  FOR EACH ROW
  WHEN (NEW.status = 'queued' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'queued'))
  EXECUTE FUNCTION public.dispatch_background_task_webhook();

-- Sweeper function: recovers expired task leases and re-dispatches tasks queued for > 3 minutes
CREATE OR REPLACE FUNCTION public.cron_recover_stuck_background_tasks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, net, pg_temp AS $$
DECLARE
  v_task record;
  v_settings app_private.worker_settings;
BEGIN
  SELECT * INTO v_settings FROM app_private.worker_settings WHERE id = true;
  IF NOT FOUND OR NOT v_settings.enabled THEN RETURN; END IF;

  -- 1. Mark as failed if lease expired and attempt limit (3) was reached
  UPDATE background_tasks
  SET status = 'failed',
      error = 'Retry limit reached after worker lease expiration',
      lease_token = NULL,
      lease_until = NULL,
      updated_at = now()
  WHERE status = 'running' AND lease_until < now() AND attempts >= 3;

  -- 2. Re-queue tasks whose worker lease timed out and attempts < 3
  UPDATE background_tasks
  SET status = 'queued',
      lease_token = NULL,
      lease_until = NULL,
      available_at = now(),
      updated_at = now()
  WHERE status = 'running' AND lease_until < now() AND attempts < 3;

  -- 3. Re-dispatch tasks that have stayed in 'queued' status past available_at and updated_at > 3 mins
  FOR v_task IN
    SELECT id, kind
    FROM background_tasks
    WHERE status = 'queued'
      AND available_at <= now()
      AND updated_at < now() - interval '3 minutes'
    ORDER BY available_at ASC
    LIMIT 10
  LOOP
    PERFORM net.http_post(
      url := v_settings.webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_settings.webhook_secret
      ),
      body := jsonb_build_object(
        'table', 'background_tasks',
        'record', jsonb_build_object('id', v_task.id, 'kind', v_task.kind)
      )
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_recover_stuck_background_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_recover_stuck_background_tasks() TO postgres, service_role;

-- Automatic Source Sync Function: enqueues sync tasks for enabled job sources whose check interval elapsed
CREATE OR REPLACE FUNCTION public.cron_enqueue_stale_source_syncs()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_source record;
  v_threshold timestamptz;
  v_interval integer;
BEGIN
  SELECT COALESCE(source_sync_minutes, 60) INTO v_interval FROM workspace_settings WHERE id = true;
  IF v_interval IS NULL THEN v_interval := 60; END IF;
  v_threshold := now() - (v_interval || ' minutes')::interval;

  FOR v_source IN
    SELECT id, created_by
    FROM job_sources
    WHERE enabled = true
      AND (last_checked_at IS NULL OR last_checked_at < v_threshold)
    LIMIT 20
  LOOP
    BEGIN
      PERFORM enqueue_source_sync(v_source.created_by, v_source.id);
    EXCEPTION WHEN OTHERS THEN
      -- Silently skip individual sources if candidate is inactive or already running
      NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_enqueue_stale_source_syncs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_enqueue_stale_source_syncs() TO postgres, service_role;

-- Helper to safely schedule or update pg_cron jobs without failing if unscheduled
CREATE OR REPLACE FUNCTION public.safe_schedule_cron_job(
  p_job_name text,
  p_schedule text,
  p_command text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = p_job_name) THEN
    PERFORM cron.unschedule(p_job_name);
  END IF;
  PERFORM cron.schedule(p_job_name, p_schedule, p_command);
END;
$$;

REVOKE ALL ON FUNCTION public.safe_schedule_cron_job(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_schedule_cron_job(text, text, text) TO postgres, service_role;

-- Schedule cron jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 1. Ensure email confirmation sync runs every 5 minutes
    PERFORM public.safe_schedule_cron_job(
      'sync-recruiting-emails-every-5-mins',
      '*/5 * * * *',
      $cmd$
      SELECT net.http_post(
        url := 'https://www.nextkinhr.com/api/email-confirmations/sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer 7926d035725a0c8e6cf0896a294cd3697d9f027a7dc99fbbbb82e53c0fc6b824'
        )
      );
      $cmd$
    );

    -- 2. Run stuck background tasks recovery every 5 minutes
    PERFORM public.safe_schedule_cron_job(
      'recover-stuck-background-tasks',
      '*/5 * * * *',
      'SELECT public.cron_recover_stuck_background_tasks();'
    );

    -- 3. Stale job source sync check every 30 minutes
    PERFORM public.safe_schedule_cron_job(
      'sync-stale-job-sources',
      '*/30 * * * *',
      'SELECT public.cron_enqueue_stale_source_syncs();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Cron configuration notice: %', SQLERRM;
END $$;

COMMIT;
