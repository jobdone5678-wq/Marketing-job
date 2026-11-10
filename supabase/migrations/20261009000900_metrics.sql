BEGIN;
CREATE FUNCTION public.workspace_metrics(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor profiles;result jsonb;BEGIN
 SELECT * INTO actor FROM profiles WHERE id=p_actor AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'Account access denied';END IF;
 SELECT jsonb_build_object('candidates',(SELECT count(*) FROM candidates WHERE actor.role IN('recruiter','super_admin') OR user_id=p_actor),
 'submissions',(SELECT count(*) FROM job_submissions s WHERE actor.role IN('recruiter','super_admin') OR EXISTS(SELECT 1 FROM candidates c WHERE c.id=s.candidate_id AND c.user_id=p_actor)),
 'confirmed',(SELECT count(*) FROM job_submissions s WHERE capture_status='confirmed' AND (actor.role IN('recruiter','super_admin') OR EXISTS(SELECT 1 FROM candidates c WHERE c.id=s.candidate_id AND c.user_id=p_actor))),
 'contractJobs',(SELECT count(*) FROM jobs WHERE state<>'closed' AND employment_type='contract'),
 'vendors',CASE WHEN actor.role IN('recruiter','super_admin') THEN (SELECT count(*) FROM vendors) ELSE NULL END,
 'activity',COALESCE((SELECT jsonb_agg(row_to_json(activity)) FROM (SELECT submission_date::text AS date,count(*) AS submissions FROM job_submissions s WHERE submission_date>=current_date-30 AND (actor.role IN('recruiter','super_admin') OR EXISTS(SELECT 1 FROM candidates c WHERE c.id=s.candidate_id AND c.user_id=p_actor)) GROUP BY submission_date ORDER BY submission_date) activity),'[]'::jsonb)) INTO result;RETURN result;END;$$;
REVOKE ALL ON FUNCTION workspace_metrics(uuid) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION workspace_metrics(uuid) TO service_role;
COMMIT;