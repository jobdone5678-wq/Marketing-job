-- Preserve the existing authorization header and schedule. Only bypass the domain redirect.
BEGIN;
DO $fix$
DECLARE job record;
BEGIN
  FOR job IN SELECT jobid,command FROM cron.job
    WHERE jobname='sync-recruiting-emails-every-5-mins'
  LOOP
    IF position('https://nextkinhr.com/api/email-confirmations/sync' IN job.command)>0 THEN
      PERFORM cron.alter_job(job.jobid,command := replace(job.command,
        'https://nextkinhr.com/api/email-confirmations/sync',
        'https://www.nextkinhr.com/api/email-confirmations/sync'));
    END IF;
  END LOOP;
END $fix$;
SELECT jobid,jobname,schedule,active,
  position('https://www.nextkinhr.com/api/email-confirmations/sync' IN command)>0 AS uses_direct_url
FROM cron.job WHERE jobname='sync-recruiting-emails-every-5-mins';
COMMIT;
