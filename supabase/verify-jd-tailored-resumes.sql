-- Read-only checks for the JD matching / DOCX workflow migration.
SELECT 'Workflow tables' AS check_name,
 to_regclass('public.job_briefs') IS NOT NULL
 AND to_regclass('public.jd_shortlists') IS NOT NULL
 AND to_regclass('public.tailored_resumes') IS NOT NULL
 AND to_regclass('public.tailored_resume_edits') IS NOT NULL AS passed
UNION ALL
SELECT 'Enqueue and review functions',
 to_regprocedure('public.create_job_brief(uuid,uuid,text,text,text,text,text,text)') IS NOT NULL
 AND to_regprocedure('public.request_tailored_resume(uuid,uuid,uuid,uuid)') IS NOT NULL
 AND to_regprocedure('public.review_tailored_resume(uuid,uuid,integer,text)') IS NOT NULL
 AND to_regprocedure('public.review_job_brief(uuid,uuid,integer,jsonb)') IS NOT NULL
UNION ALL
SELECT 'Worker save functions',
 to_regprocedure('public.save_job_brief_requirements(uuid,uuid,uuid,jsonb,text)') IS NOT NULL
 AND to_regprocedure('public.save_tailored_resume(uuid,uuid,uuid,text,jsonb,text)') IS NOT NULL
UNION ALL
SELECT 'Private tables require server access',
 (SELECT count(*)=4 AND bool_and(relrowsecurity) FROM pg_class WHERE oid IN
  ('public.job_briefs'::regclass,'public.jd_shortlists'::regclass,'public.tailored_resumes'::regclass,'public.tailored_resume_edits'::regclass))
 AND NOT has_table_privilege('authenticated','public.job_briefs','SELECT')
 AND NOT has_table_privilege('authenticated','public.tailored_resumes','SELECT')
 AND NOT has_function_privilege('authenticated','public.request_tailored_resume(uuid,uuid,uuid,uuid)','EXECUTE')
UNION ALL
SELECT 'Private JD file bucket',EXISTS(SELECT 1 FROM storage.buckets WHERE id='recruiting-documents' AND NOT public AND file_size_limit=10485760)
UNION ALL
SELECT 'Job changes invalidate generated versions',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.jobs'::regclass AND tgname='advance_job_content_version' AND NOT tgisinternal);
