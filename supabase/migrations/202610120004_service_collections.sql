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
