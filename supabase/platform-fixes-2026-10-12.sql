-- Apply once after recruiting operations through 202610120001.

-- Apply after the recruiting operations migrations. Preserves historical adjustments and payment checks.
BEGIN;
CREATE OR REPLACE FUNCTION public.sync_staff_salary_periods(p_employment uuid,p_through date DEFAULT (current_date+interval '2 months')::date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE employment public.staff_employments; term public.staff_compensation_terms; existing public.staff_salary_periods;
  month_date date; start_day date; next_month date; finish_day date; full_finish date; i integer;
  anchor integer; partial boolean; paid numeric;
BEGIN
  SELECT * INTO employment FROM public.staff_employments WHERE id=p_employment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employment not found'; END IF;
  anchor:=extract(day FROM employment.hire_date)::integer;
  IF employment.end_date IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.staff_salary_periods p JOIN public.external_payments x ON x.salary_period_id=p.id
      WHERE p.employment_id=p_employment AND p.start_date>employment.end_date GROUP BY p.id HAVING sum(x.amount)>0) THEN
      RAISE EXCEPTION 'Correct payments on periods after the employment end date first';
    END IF;
    UPDATE public.staff_salary_periods SET status='cancelled' WHERE employment_id=p_employment AND start_date>employment.end_date AND status<>'cancelled';
  END IF;
  FOR i IN 0..359 LOOP
    month_date:=(date_trunc('month',employment.hire_date)+make_interval(months=>i))::date;
    start_day:=month_date+least(anchor,extract(day FROM month_date+interval '1 month - 1 day')::integer)-1;
    EXIT WHEN start_day>p_through OR (employment.end_date IS NOT NULL AND start_day>employment.end_date);
    next_month:=(month_date+interval '1 month')::date;
    full_finish:=next_month+least(anchor,extract(day FROM next_month+interval '1 month - 1 day')::integer)-1;
    finish_day:=least(full_finish,COALESCE(employment.end_date+1,full_finish));
    partial:=finish_day<full_finish;
    SELECT * INTO existing FROM public.staff_salary_periods WHERE employment_id=p_employment AND period_index=i FOR UPDATE;
    IF FOUND THEN
      -- Never resnapshot salary terms or erase an explicit final-period adjustment on a read/refresh.
      IF existing.start_date IS DISTINCT FROM start_day THEN RAISE EXCEPTION 'Joining date cannot change after salary periods exist'; END IF;
      IF existing.end_date_exclusive IS DISTINCT FROM finish_day OR existing.status='cancelled' THEN
        SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE salary_period_id=existing.id;
        IF paid>0 THEN RAISE EXCEPTION 'Correct payments before changing the covered salary dates'; END IF;
        UPDATE public.staff_salary_periods SET end_date_exclusive=finish_day,due_date=finish_day,
          amount=CASE WHEN partial AND employment.partial_period_rule='manual' THEN 0 ELSE COALESCE(existing.monthly_amount,existing.amount) END,
          status=CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'awaiting_adjustment' ELSE 'accruing' END,
          adjusted_at=NULL,adjusted_by=NULL,notes=CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'Manual amount required for final partial salary period.' ELSE NULL END
          WHERE id=existing.id;
      END IF;
    ELSE
      SELECT * INTO term FROM public.staff_compensation_terms WHERE employment_id=p_employment AND effective_from<=start_day
        AND (effective_to IS NULL OR effective_to>=start_day) ORDER BY effective_from DESC LIMIT 1;
      IF FOUND THEN
        INSERT INTO public.staff_salary_periods(employment_id,period_index,start_date,end_date_exclusive,due_date,amount,monthly_amount,currency,status,compensation_term_id,notes)
          VALUES(p_employment,i,start_day,finish_day,finish_day,CASE WHEN partial AND employment.partial_period_rule='manual' THEN 0 ELSE term.monthly_amount END,
            term.monthly_amount,term.currency,CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'awaiting_adjustment' ELSE 'accruing' END,
            term.id,CASE WHEN partial AND employment.partial_period_rule='manual' THEN 'Manual amount required for final partial salary period.' ELSE NULL END);
      END IF;
    END IF;
  END LOOP;
  -- Aggregate payments once per period instead of repeating correlated sums.
  WITH balances AS (
    SELECT p.id,p.amount,p.due_date,COALESCE(sum(x.amount),0) paid_total
    FROM public.staff_salary_periods p LEFT JOIN public.external_payments x ON x.salary_period_id=p.id
    WHERE p.employment_id=p_employment AND p.status NOT IN ('awaiting_adjustment','cancelled')
    GROUP BY p.id
  ), statuses AS (
    SELECT b.id,CASE WHEN b.amount-b.paid_total<=0 THEN 'paid' WHEN b.paid_total>0 THEN 'partially_paid'
      WHEN b.due_date<current_date THEN 'overdue' WHEN b.due_date=current_date THEN 'due' ELSE 'accruing' END status
    FROM balances b
  )
  UPDATE public.staff_salary_periods p SET status=s.status FROM statuses s
    WHERE p.id=s.id AND p.status IS DISTINCT FROM s.status;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_placement_months(p_placement uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE placement public.placements; existing public.placement_months; cursor_month date; last_month date;
  first_day date; last_day date; final_date date; month_status text; full_month boolean;
BEGIN
  SELECT * INTO placement FROM public.placements WHERE id=p_placement FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Placement not found'; END IF;
  IF placement.status='cancelled' OR placement.actual_join_date IS NULL THEN
    UPDATE public.placement_months SET status='cancelled' WHERE placement_id=p_placement AND status<>'cancelled'; RETURN;
  END IF;
  final_date:=COALESCE(placement.actual_end_date,current_date);
  cursor_month:=date_trunc('month',placement.actual_join_date)::date;
  last_month:=date_trunc('month',final_date)::date;
  UPDATE public.placement_months SET status='cancelled' WHERE placement_id=p_placement AND status<>'cancelled' AND (month_start<cursor_month OR month_start>last_month);
  WHILE cursor_month<=last_month LOOP
    first_day:=greatest(cursor_month,placement.actual_join_date);
    last_day:=least((cursor_month+interval '1 month - 1 day')::date,COALESCE(placement.actual_end_date,(cursor_month+interval '1 month - 1 day')::date));
    full_month:=first_day=cursor_month AND last_day=(cursor_month+interval '1 month - 1 day')::date;
    month_status:=CASE WHEN placement.actual_end_date IS NOT NULL OR cursor_month<date_trunc('month',current_date)::date THEN 'completed' ELSE 'active' END;
    SELECT * INTO existing FROM public.placement_months WHERE placement_id=p_placement AND month_start=cursor_month FOR UPDATE;
    IF FOUND THEN
      IF existing.covered_start<>first_day OR existing.covered_end<>last_day OR existing.status='cancelled' THEN
        UPDATE public.placement_months SET covered_start=first_day,covered_end=last_day,status=month_status,
          agreed_amount=CASE WHEN full_month THEN placement.candidate_monthly_amount ELSE NULL END,currency=placement.candidate_currency,
          adjusted_at=NULL,adjusted_by=NULL,notes=NULL WHERE id=existing.id;
      ELSE UPDATE public.placement_months SET status=month_status WHERE id=existing.id AND status IS DISTINCT FROM month_status;
      END IF;
    ELSE
      INSERT INTO public.placement_months(placement_id,month_start,covered_start,covered_end,agreed_amount,currency,status)
        VALUES(p_placement,cursor_month,first_day,last_day,CASE WHEN full_month THEN placement.candidate_monthly_amount ELSE NULL END,placement.candidate_currency,month_status);
    END IF;
    cursor_month:=(cursor_month+interval '1 month')::date;
  END LOOP;
END; $$;


CREATE OR REPLACE FUNCTION public.sync_recruiting_periods(p_employments uuid[] DEFAULT '{}',p_placements uuid[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item uuid;
BEGIN
 IF COALESCE(cardinality(p_employments),0)>200 OR COALESCE(cardinality(p_placements),0)>200 THEN
  RAISE EXCEPTION 'Period refresh accepts at most 200 IDs per kind';
 END IF;
 -- Consistent lock order also makes concurrent dashboard refreshes safer.
 FOR item IN SELECT DISTINCT id FROM unnest(p_employments) id WHERE id IS NOT NULL ORDER BY id LOOP
  PERFORM public.sync_staff_salary_periods(item);
 END LOOP;
 FOR item IN SELECT DISTINCT id FROM unnest(p_placements) id WHERE id IS NOT NULL ORDER BY id LOOP
  PERFORM public.sync_placement_months(item);
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.sync_recruiting_periods(uuid[],uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_recruiting_periods(uuid[],uuid[]) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;


BEGIN;
-- Source publication and application deadline are independent of sync timestamps and observed state.
-- Existing rows intentionally remain NULL: no historical dates can be inferred safely.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS closes_at timestamptz;
COMMENT ON COLUMN public.jobs.posted_at IS 'Provider publication timestamp: Greenhouse first publication; Ashby last publication, including republication. NULL when unavailable.';
COMMENT ON COLUMN public.jobs.closes_at IS 'Explicit provider application deadline only. NULL when unavailable. Independent of observed closed state.';
CREATE OR REPLACE FUNCTION public.save_job_snapshot(p_task uuid,p_lease uuid,p_source uuid,p_jobs jsonb,p_complete boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb; total integer;BEGIN
 PERFORM check_task_lease(p_task,p_lease);
 PERFORM 1 FROM job_sources WHERE id=p_source AND enabled FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Source no longer enabled';END IF;
 IF NOT EXISTS(SELECT 1 FROM background_tasks WHERE id=p_task AND kind='source_sync' AND payload->>'sourceId'=p_source::text) THEN RAISE EXCEPTION 'Invalid task source';END IF;
 IF EXISTS(SELECT 1 FROM source_sync_runs WHERE task_id=p_task) THEN RETURN jsonb_build_object('cached',true);END IF;
 IF jsonb_typeof(p_jobs)<>'array' THEN RAISE EXCEPTION 'Invalid jobs snapshot';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_jobs) LOOP
 INSERT INTO jobs(source_id,external_id,title,company,source_url,application_url,location,department,description,description_html,employment_type,employment_evidence,arrangements,compensation,posted_at,closes_at,content_hash)
 VALUES(p_source,item->>'external_id',item->>'title',item->>'company',item->>'source_url',item->>'application_url',item->>'location',item->>'department',item->>'description',item->>'description_html',item->>'employment_type',item->>'employment_evidence',item->'arrangements',item->'compensation',NULLIF(item->>'posted_at','')::timestamptz,NULLIF(item->>'closes_at','')::timestamptz,item->>'content_hash')
 ON CONFLICT(source_id,external_id) DO UPDATE SET title=EXCLUDED.title,company=EXCLUDED.company,source_url=EXCLUDED.source_url,application_url=EXCLUDED.application_url,location=EXCLUDED.location,department=EXCLUDED.department,description=EXCLUDED.description,description_html=EXCLUDED.description_html,employment_type=EXCLUDED.employment_type,employment_evidence=EXCLUDED.employment_evidence,arrangements=EXCLUDED.arrangements,compensation=EXCLUDED.compensation,posted_at=EXCLUDED.posted_at,closes_at=EXCLUDED.closes_at,content_hash=EXCLUDED.content_hash,version=jobs.version+CASE WHEN jobs.content_hash<>EXCLUDED.content_hash THEN 1 ELSE 0 END,state='active',last_seen_at=now(),updated_at=CASE WHEN jobs.content_hash<>EXCLUDED.content_hash THEN now() ELSE jobs.updated_at END;
 END LOOP;
 IF p_complete THEN UPDATE jobs SET state='closed' WHERE source_id=p_source AND external_id NOT IN(SELECT value->>'external_id' FROM jsonb_array_elements(p_jobs));END IF;
 total:=jsonb_array_length(p_jobs);INSERT INTO source_sync_runs(source_id,task_id,complete,count) VALUES(p_source,p_task,p_complete,total);
 UPDATE job_sources SET last_checked_at=now(),last_success_at=CASE WHEN p_complete THEN now() ELSE last_success_at END,health=CASE WHEN p_complete THEN 'healthy' ELSE 'partial' END,error=CASE WHEN p_complete THEN NULL ELSE 'Incomplete snapshot; omitted jobs retained.' END WHERE id=p_source;
 RETURN jsonb_build_object('count',total,'complete',p_complete);END;$$;
COMMIT;


BEGIN;
-- Service fees flow from the candidate/client to the business. Payroll remains separate.
CREATE TABLE public.service_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid NOT NULL REFERENCES public.candidates(id),
 joining_date date NOT NULL, end_date date, monthly_fee numeric(14,2) NOT NULL CHECK(monthly_fee>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(end_date IS NULL OR end_date>=joining_date)
);
CREATE TABLE public.service_bills (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid NOT NULL REFERENCES public.service_enrollments(id),
 start_date date NOT NULL,end_date_exclusive date NOT NULL,due_date date NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>=0),currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(enrollment_id,start_date),CHECK(end_date_exclusive>start_date)
);
CREATE TABLE public.service_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bill_id uuid NOT NULL REFERENCES public.service_bills(id),
 amount numeric(14,2) NOT NULL CHECK(amount<>0),currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),received_on date NOT NULL,
 method text NOT NULL CHECK(length(trim(method))>0),external_reference text UNIQUE,
 correction_of uuid REFERENCES public.service_receipts(id),reason text,recorded_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),CHECK((amount>0 AND correction_of IS NULL) OR (amount<0 AND correction_of IS NOT NULL AND length(trim(reason))>0))
);
CREATE INDEX service_bills_due ON public.service_bills(due_date);
CREATE INDEX service_receipts_bill ON public.service_receipts(bill_id);
CREATE INDEX service_enrollments_candidate ON public.service_enrollments(candidate_id);
ALTER TABLE public.service_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_enrollment_view ON public.service_enrollments FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active' AND (p.role='super_admin' OR (p.role='client' AND EXISTS(SELECT 1 FROM public.candidates c WHERE c.id=candidate_id AND c.user_id=p.id)))));
CREATE POLICY service_bill_view ON public.service_bills FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.service_enrollments e WHERE e.id=enrollment_id));
CREATE POLICY service_receipt_view ON public.service_receipts FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.service_bills b WHERE b.id=bill_id));
REVOKE ALL ON public.service_enrollments,public.service_bills,public.service_receipts FROM anon,authenticated;
GRANT SELECT ON public.service_enrollments,public.service_bills,public.service_receipts TO authenticated;
GRANT SELECT,INSERT ON public.service_enrollments,public.service_bills,public.service_receipts TO service_role;
-- Immutable fee and period snapshots: changes require a new enrollment, receipts require reversals.
CREATE FUNCTION public.service_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='service_enrollments' AND TG_OP='UPDATE' THEN
  IF OLD.end_date IS NULL AND NEW.end_date IS NOT NULL AND (to_jsonb(NEW)-'end_date')=(to_jsonb(OLD)-'end_date') THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Service billing history is immutable'; END $$;
CREATE TRIGGER service_enrollment_immutable BEFORE UPDATE OR DELETE ON public.service_enrollments FOR EACH ROW EXECUTE FUNCTION public.service_history_immutable();
CREATE TRIGGER service_bill_immutable BEFORE UPDATE OR DELETE ON public.service_bills FOR EACH ROW EXECUTE FUNCTION public.service_history_immutable();
CREATE TRIGGER service_receipt_immutable BEFORE UPDATE OR DELETE ON public.service_receipts FOR EACH ROW EXECUTE FUNCTION public.service_history_immutable();
CREATE VIEW public.service_bill_balances WITH(security_invoker=true) AS
 SELECT b.*,coalesce(r.received_amount,0)::numeric(14,2) received_amount,(b.amount-coalesce(r.received_amount,0))::numeric(14,2) balance,
 CASE WHEN b.amount-coalesce(r.received_amount,0)<=0 THEN 'paid' WHEN coalesce(r.received_amount,0)>0 THEN 'partially_paid' WHEN b.due_date<current_date THEN 'overdue' WHEN b.due_date=current_date THEN 'due' ELSE 'upcoming' END status
 FROM public.service_bills b LEFT JOIN (SELECT bill_id,sum(amount) received_amount FROM public.service_receipts GROUP BY bill_id) r ON r.bill_id=b.id;
GRANT SELECT ON public.service_bill_balances TO authenticated,service_role;
CREATE FUNCTION public.sync_service_bills(p_today date DEFAULT current_date,p_candidates uuid[] DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.service_enrollments; i integer; s date; n date;
BEGIN
 FOR e IN SELECT * FROM public.service_enrollments WHERE joining_date<=p_today AND (p_candidates IS NULL OR candidate_id=ANY(p_candidates)) ORDER BY id FOR UPDATE LOOP
  SELECT coalesce(max((extract(year FROM start_date)::int-extract(year FROM e.joining_date)::int)*12+extract(month FROM start_date)::int-extract(month FROM e.joining_date)::int),0) INTO i FROM public.service_bills WHERE enrollment_id=e.id;
  LOOP
   -- Add each interval to the ORIGINAL anchor so February never shifts March's day.
   s:=(e.joining_date+make_interval(months=>i))::date;n:=(e.joining_date+make_interval(months=>i+1))::date;
   EXIT WHEN s>p_today OR (e.end_date IS NOT NULL AND s>e.end_date);
   INSERT INTO public.service_bills(enrollment_id,start_date,end_date_exclusive,due_date,amount,currency)
    VALUES(e.id,s,least(n,coalesce(e.end_date+1,n)),n,e.monthly_fee,e.currency) ON CONFLICT(enrollment_id,start_date) DO NOTHING;
   i:=i+1;
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION public.create_service_enrollment(p_actor uuid,p_candidate uuid,p_join date,p_end date,p_fee numeric,p_currency text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.service_enrollments;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 IF p_join IS NULL OR p_fee IS NULL OR p_fee<0 OR p_fee<>round(p_fee,2) OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR p_end<p_join OR p_join<current_date-interval '20 years' THEN RAISE EXCEPTION 'Invalid service enrollment'; END IF;
 -- Serialize per candidate to prohibit overlapping fee agreements.
 PERFORM 1 FROM public.candidates WHERE id=p_candidate FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_enrollments WHERE candidate_id=p_candidate AND daterange(joining_date,coalesce(end_date+1,'infinity'::date),'[)') && daterange(p_join,coalesce(p_end+1,'infinity'::date),'[)')) THEN RAISE EXCEPTION 'Service enrollment overlaps an existing agreement'; END IF;
 INSERT INTO public.service_enrollments(candidate_id,joining_date,end_date,monthly_fee,currency,created_by) VALUES(p_candidate,p_join,p_end,p_fee,p_currency,p_actor) RETURNING * INTO e;
 PERFORM public.sync_service_bills();
 INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'service_enrollment_created',e.id,to_jsonb(e));
 RETURN to_jsonb(e);
END $$;
CREATE FUNCTION public.record_service_receipt(p_actor uuid,p_bill uuid,p_amount numeric,p_currency text,p_on date,p_method text,p_reference text,p_correction uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.service_bills; original public.service_receipts; r public.service_receipts; received numeric; reversible numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 SELECT * INTO b FROM public.service_bills WHERE id=p_bill FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Service bill not found'; END IF;
 IF p_amount IS NULL OR p_amount=0 OR p_amount<>round(p_amount,2) OR p_on IS NULL OR p_on>current_date OR p_method IS NULL OR length(trim(p_method))=0 THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
 IF p_currency IS DISTINCT FROM b.currency THEN RAISE EXCEPTION 'Receipt currency mismatch'; END IF;
 SELECT coalesce(sum(amount),0) INTO received FROM public.service_receipts WHERE bill_id=p_bill;
 IF p_correction IS NULL THEN
  IF p_amount<0 THEN RAISE EXCEPTION 'Negative receipts require a correction'; END IF;
  IF p_amount>b.amount-received THEN RAISE EXCEPTION 'Receipt exceeds outstanding balance'; END IF;
 ELSE
  SELECT * INTO original FROM public.service_receipts WHERE id=p_correction FOR UPDATE;
  IF NOT FOUND OR original.bill_id<>p_bill OR original.correction_of IS NOT NULL OR p_amount>=0 OR coalesce(length(trim(p_reason)),0)=0 THEN RAISE EXCEPTION 'Invalid receipt correction'; END IF;
  SELECT original.amount+coalesce(sum(amount),0) INTO reversible FROM public.service_receipts WHERE correction_of=p_correction;
  IF -p_amount>reversible THEN RAISE EXCEPTION 'Correction exceeds remaining original receipt'; END IF;
 END IF;
 INSERT INTO public.service_receipts(bill_id,amount,currency,received_on,method,external_reference,correction_of,reason,recorded_by)
 VALUES(p_bill,p_amount,p_currency,p_on,trim(p_method),nullif(trim(p_reference),''),p_correction,p_reason,p_actor) RETURNING * INTO r;
 INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,CASE WHEN p_correction IS NULL THEN 'service_receipt_recorded' ELSE 'service_receipt_corrected' END,p_bill,to_jsonb(r));
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.sync_service_bills(date,uuid[]),public.create_service_enrollment(uuid,uuid,date,date,numeric,text),public.record_service_receipt(uuid,uuid,numeric,text,date,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_service_bills(date,uuid[]),public.create_service_enrollment(uuid,uuid,date,date,numeric,text),public.record_service_receipt(uuid,uuid,numeric,text,date,text,text,uuid,text) TO service_role;
CREATE FUNCTION public.service_collection_totals(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 SELECT jsonb_build_object(
  'received',coalesce((SELECT jsonb_agg(t) FROM (SELECT currency,sum(amount) amount FROM public.service_receipts GROUP BY currency ORDER BY currency)t),'[]'::jsonb),
  'outstanding',coalesce((SELECT jsonb_agg(t) FROM (SELECT currency,sum(balance) amount FROM public.service_bill_balances WHERE balance>0 GROUP BY currency ORDER BY currency)t),'[]'::jsonb),
  'due',coalesce((SELECT jsonb_agg(t) FROM (SELECT currency,sum(balance) amount FROM public.service_bill_balances WHERE balance>0 AND due_date<=current_date GROUP BY currency ORDER BY currency)t),'[]'::jsonb),
  'duePeriods',(SELECT count(*) FROM public.service_bill_balances WHERE balance>0 AND due_date<=current_date)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.service_collection_totals(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_collection_totals(uuid) TO service_role;
CREATE FUNCTION public.end_service_enrollment(p_actor uuid,p_enrollment uuid,p_end date,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.service_enrollments;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 SELECT * INTO e FROM public.service_enrollments WHERE id=p_enrollment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Service enrollment not found'; END IF;
 IF e.end_date IS NOT NULL OR p_end IS NULL OR p_end<e.joining_date OR coalesce(length(trim(p_reason)),0)=0 THEN RAISE EXCEPTION 'Invalid service end date or reason'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_bills WHERE enrollment_id=e.id AND end_date_exclusive-1>p_end) THEN RAISE EXCEPTION 'End date cannot precede the end of existing billed periods'; END IF;
 UPDATE public.service_enrollments SET end_date=p_end WHERE id=e.id;
 INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'service_enrollment_ended',e.id,jsonb_build_object('end_date',p_end,'reason',p_reason,'existing_bills_preserved',true));
END $$;
REVOKE ALL ON FUNCTION public.end_service_enrollment(uuid,uuid,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.end_service_enrollment(uuid,uuid,date,text) TO service_role;
COMMIT;


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

NOTIFY pgrst, 'reload schema';
