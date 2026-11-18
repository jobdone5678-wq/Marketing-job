BEGIN;

GRANT SELECT ON public.outside_jobs TO authenticated;

ALTER POLICY candidate_outside_jobs ON public.outside_jobs
  USING (
    app_private.can_read_candidate_application(candidate_id)
    AND (
      capture_owner_id = (SELECT auth.uid())
      OR (capture_owner_id IS NULL AND EXISTS (
        SELECT 1 FROM public.candidates AS candidate
        WHERE candidate.id = outside_jobs.candidate_id AND candidate.user_id = (SELECT auth.uid())
      ))
    )
  );

COMMIT;
