BEGIN;
CREATE FUNCTION public.register_resume(p_actor uuid,p_document uuid,p_candidate uuid,p_expected integer,p_path text,p_filename text,p_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE task uuid;actor profiles;candidate candidates;BEGIN
 SELECT * INTO actor FROM profiles WHERE id=p_actor AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'Resume access denied';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resume:'||COALESCE(p_candidate::text,p_actor::text),0));
 IF p_candidate IS NOT NULL THEN SELECT * INTO candidate FROM candidates WHERE id=p_candidate FOR UPDATE;IF NOT FOUND OR actor.role='client' AND candidate.user_id IS DISTINCT FROM p_actor OR candidate.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Candidate changed or access denied';END IF;END IF;
 IF split_part(p_path,'/',1)<>p_actor::text THEN RAISE EXCEPTION 'Invalid private object path';END IF;
 INSERT INTO candidate_documents(id,owner_id,candidate_id,candidate_version,object_path,filename,content_hash,consent_at) VALUES(p_document,p_actor,p_candidate,p_expected,p_path,p_filename,p_hash,now());
 task:=enqueue_task(p_actor,'resume_extract',jsonb_build_object('documentId',p_document),'resume:'||p_document||':v1');
 UPDATE candidate_documents SET task_id=task WHERE id=p_document;RETURN task;END;$$;
CREATE FUNCTION public.retry_task(p_actor uuid,p_task uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE task background_tasks;BEGIN
 SELECT * INTO task FROM background_tasks WHERE id=p_task FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND status='active' AND (p_actor=task.actor_id OR role='super_admin')) THEN RAISE EXCEPTION 'Task access denied';END IF;
 IF task.status<>'failed' THEN RAISE EXCEPTION 'Only failed tasks can be retried';END IF;
 IF task.kind='resume_extract' THEN
 PERFORM 1 FROM candidate_documents WHERE task_id=p_task AND status NOT IN('deleted','confirmed') FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Document unavailable';END IF;
 UPDATE candidate_documents SET status='queued',error=NULL WHERE task_id=p_task;
 END IF;
 UPDATE background_tasks SET status='queued',attempts=0,available_at=now(),lease_token=NULL,lease_until=NULL,error=NULL,result=NULL WHERE id=p_task;RETURN p_task;END;$$;
CREATE FUNCTION public.record_task_failure(p_task uuid,p_lease uuid,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE task background_tasks;BEGIN
 PERFORM check_task_lease(p_task,p_lease);SELECT * INTO task FROM background_tasks WHERE id=p_task;
 IF task.kind='resume_extract' THEN UPDATE candidate_documents SET status='failed',error=p_error WHERE task_id=p_task AND status IN('queued','processing','failed');END IF;
 IF task.kind='source_sync' THEN UPDATE job_sources SET health='stale',error=p_error,last_checked_at=now() WHERE id=(task.payload->>'sourceId')::uuid;
 UPDATE jobs SET state='stale' WHERE source_id=(task.payload->>'sourceId')::uuid AND state='active';END IF;
 END;$$;
REVOKE ALL ON FUNCTION register_resume(uuid,uuid,uuid,integer,text,text,text),retry_task(uuid,uuid),record_task_failure(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION register_resume(uuid,uuid,uuid,integer,text,text,text),retry_task(uuid,uuid),record_task_failure(uuid,uuid,text) TO service_role;
COMMIT;