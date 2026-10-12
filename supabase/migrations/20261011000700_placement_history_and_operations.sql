BEGIN;

ALTER TABLE public.placement_months ADD COLUMN adjusted_at timestamptz;
ALTER TABLE public.placement_months ADD COLUMN adjusted_by uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.validate_placement_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.actual_join_date>current_date OR NEW.actual_end_date>current_date THEN RAISE EXCEPTION 'Actual employment dates cannot be in the future'; END IF;
  IF NEW.actual_end_date IS NOT NULL AND NEW.actual_join_date IS NULL THEN RAISE EXCEPTION 'Record actual joining before the employment end'; END IF;
  IF NEW.actual_end_date IS NOT NULL AND NEW.status NOT IN ('completed','ended_early') THEN NEW.status:='completed'; END IF;
  IF NEW.actual_join_date IS NOT NULL AND NEW.status IN ('offer_accepted','joining_scheduled') THEN NEW.status:='active'; END IF;
  IF NEW.status='active' AND (NEW.actual_join_date IS NULL OR NEW.actual_end_date IS NOT NULL) THEN RAISE EXCEPTION 'Active placement requires actual joining and no actual end date'; END IF;
  IF NEW.status IN ('completed','ended_early') AND NEW.actual_end_date IS NULL THEN RAISE EXCEPTION 'Completed placement requires an actual end date'; END IF;
  IF NEW.status='cancelled' AND NEW.actual_join_date IS NOT NULL THEN RAISE EXCEPTION 'A joined placement must be ended instead of cancelled'; END IF;
  IF NEW.candidate_monthly_amount IS NOT NULL AND NEW.candidate_currency IS NULL THEN RAISE EXCEPTION 'Candidate compensation requires a currency'; END IF;
  IF NEW.commission_amount IS NOT NULL AND (NEW.commission_currency IS NULL OR NEW.technical_recruiter_id IS NULL) THEN RAISE EXCEPTION 'Commission requires a credited technical recruiter and currency'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER enforce_placement_lifecycle BEFORE INSERT OR UPDATE ON public.placements FOR EACH ROW EXECUTE FUNCTION public.validate_placement_lifecycle();

CREATE OR REPLACE FUNCTION public.sync_placement_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE commission public.technical_recruiter_commissions; eligible boolean; milestone_date date;
BEGIN
  SELECT * INTO commission FROM public.technical_recruiter_commissions WHERE placement_id=NEW.id FOR UPDATE;
  IF FOUND THEN
    IF commission.status IN ('approved','partially_paid','paid') AND
      (NEW.commission_amount IS DISTINCT FROM OLD.commission_amount OR NEW.commission_currency IS DISTINCT FROM OLD.commission_currency
       OR NEW.technical_recruiter_id IS DISTINCT FROM OLD.technical_recruiter_id OR NEW.commission_milestone IS DISTINCT FROM OLD.commission_milestone
       OR NEW.actual_join_date IS NULL) THEN RAISE EXCEPTION 'An approved commission agreement and its credited recruiter cannot be rewritten'; END IF;
    IF NEW.technical_recruiter_id IS DISTINCT FROM commission.technical_recruiter_id OR NEW.commission_milestone<>commission.milestone THEN
      RAISE EXCEPTION 'Commission credit and milestone are preserved; record an explicit agreement correction';
    END IF;
    IF commission.status NOT IN ('awaiting_eligibility','awaiting_approval') THEN RETURN NEW; END IF;
    IF NEW.commission_amount IS NULL THEN RAISE EXCEPTION 'Keep the existing commission terms or reject the commission'; END IF;
  ELSIF NEW.commission_amount IS NULL OR NEW.technical_recruiter_id IS NULL THEN RETURN NEW;
  END IF;
  eligible:=NEW.status<>'cancelled' AND CASE NEW.commission_milestone WHEN 'candidate_joining' THEN NEW.actual_join_date IS NOT NULL ELSE NEW.status='active' END;
  milestone_date:=NEW.actual_join_date;
  IF commission.id IS NULL THEN
    INSERT INTO public.technical_recruiter_commissions(placement_id,technical_recruiter_id,milestone,amount,currency,due_date,status,eligible_at)
      VALUES(NEW.id,NEW.technical_recruiter_id,NEW.commission_milestone,NEW.commission_amount,NEW.commission_currency,
        CASE WHEN eligible THEN milestone_date+NEW.commission_due_days ELSE NULL END,
        CASE WHEN eligible THEN 'awaiting_approval' ELSE 'awaiting_eligibility' END,CASE WHEN eligible THEN now() ELSE NULL END);
  ELSE
    UPDATE public.technical_recruiter_commissions SET amount=NEW.commission_amount,currency=NEW.commission_currency,
      due_date=CASE WHEN eligible THEN milestone_date+NEW.commission_due_days ELSE NULL END,
      status=CASE WHEN eligible THEN 'awaiting_approval' ELSE 'awaiting_eligibility' END,
      eligible_at=CASE WHEN eligible THEN COALESCE(eligible_at,now()) ELSE NULL END WHERE id=commission.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER maintain_placement_commission AFTER INSERT OR UPDATE ON public.placements FOR EACH ROW EXECUTE FUNCTION public.sync_placement_commission();

CREATE OR REPLACE FUNCTION public.sync_placement_months(p_placement uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE placement public.placements; existing public.placement_months; cursor_month date; last_month date;
  first_day date; last_day date; final_date date; month_status text; full_month boolean;
BEGIN
  SELECT * INTO placement FROM public.placements WHERE id=p_placement FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Placement not found'; END IF;
  IF placement.status='cancelled' OR placement.actual_join_date IS NULL THEN
    UPDATE public.placement_months SET status='cancelled' WHERE placement_id=p_placement; RETURN;
  END IF;
  final_date:=COALESCE(placement.actual_end_date,current_date);
  cursor_month:=date_trunc('month',placement.actual_join_date)::date;
  last_month:=date_trunc('month',final_date)::date;
  UPDATE public.placement_months SET status='cancelled' WHERE placement_id=p_placement AND (month_start<cursor_month OR month_start>last_month);
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
      ELSE UPDATE public.placement_months SET status=month_status WHERE id=existing.id;
      END IF;
    ELSE
      INSERT INTO public.placement_months(placement_id,month_start,covered_start,covered_end,agreed_amount,currency,status)
        VALUES(p_placement,cursor_month,first_day,last_day,CASE WHEN full_month THEN placement.candidate_monthly_amount ELSE NULL END,placement.candidate_currency,month_status);
    END IF;
    cursor_month:=(cursor_month+interval '1 month')::date;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_placement_month(p_actor uuid,p_placement uuid,p_month uuid,p_amount numeric,p_currency text,p_notes text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE month public.placement_months;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  SELECT * INTO month FROM public.placement_months WHERE id=p_month AND placement_id=p_placement FOR UPDATE;
  IF NOT FOUND OR month.status='cancelled' THEN RAISE EXCEPTION 'Active placement month not found'; END IF;
  IF p_amount IS NULL OR p_amount<0 OR p_amount<>round(p_amount,2) OR p_currency !~ '^[A-Z]{3}$' OR length(trim(COALESCE(p_reason,'')))=0 THEN RAISE EXCEPTION 'A valid agreed amount, currency and reason are required'; END IF;
  UPDATE public.placement_months SET agreed_amount=p_amount,currency=p_currency,notes=p_notes,adjusted_at=now(),adjusted_by=p_actor WHERE id=p_month;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'placement_month_adjusted',p_placement,
    jsonb_build_object('month_id',p_month,'before_amount',month.agreed_amount,'amount',p_amount,'currency',p_currency,'reason',p_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.decide_placement_commission(p_actor uuid,p_commission uuid,p_status text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE commission public.technical_recruiter_commissions;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  SELECT * INTO commission FROM public.technical_recruiter_commissions WHERE id=p_commission FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found'; END IF;
  IF p_status NOT IN ('approved','rejected') OR commission.status<>'awaiting_approval' OR commission.eligible_at IS NULL THEN RAISE EXCEPTION 'Only eligible commissions awaiting approval can be decided'; END IF;
  UPDATE public.technical_recruiter_commissions SET status=p_status,approved_by=p_actor,approved_at=now(),notes=p_reason WHERE id=p_commission;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'commission_'||p_status,p_commission,
    jsonb_build_object('placement_id',commission.placement_id,'amount',commission.amount,'currency',commission.currency,'reason',p_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.recruiting_operations_totals(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 RETURN jsonb_build_object('counts',jsonb_build_object(
  'activePlacements',(SELECT count(*) FROM public.placements WHERE status='active'),
  'joinsNext30Days',(SELECT count(*) FROM public.placements WHERE actual_join_date IS NULL AND planned_start_date BETWEEN current_date AND current_date+30 AND status IN ('offer_accepted','joining_scheduled')),
  'endsNext30Days',(SELECT count(*) FROM public.placements WHERE actual_end_date IS NULL AND expected_end_date BETWEEN current_date AND current_date+30 AND status<>'cancelled'),
  'captureIssues',(SELECT count(*) FROM public.job_submissions WHERE capture_status IN ('failed','submit_attempted','started','in_progress'))),
 'money',jsonb_build_object(
  'salaryOutstanding',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT trim(p.currency) currency,sum(p.amount-COALESCE(x.paid,0)) amount FROM public.staff_salary_periods p LEFT JOIN (SELECT salary_period_id,sum(amount) paid FROM public.external_payments GROUP BY salary_period_id) x ON x.salary_period_id=p.id WHERE p.status NOT IN ('cancelled','awaiting_adjustment') GROUP BY p.currency) t),'[]'::jsonb),
  'salaryPaid',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT trim(currency) currency,sum(amount) amount FROM public.external_payments WHERE salary_period_id IS NOT NULL GROUP BY currency) t),'[]'::jsonb),
  'commissionOutstanding',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT trim(c.currency) currency,sum(c.amount-COALESCE(x.paid,0)) amount FROM public.technical_recruiter_commissions c LEFT JOIN (SELECT commission_id,sum(amount) paid FROM public.external_payments GROUP BY commission_id) x ON x.commission_id=c.id WHERE c.status<>'rejected' GROUP BY c.currency) t),'[]'::jsonb),
  'commissionPaid',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT trim(currency) currency,sum(amount) amount FROM public.external_payments WHERE commission_id IS NOT NULL GROUP BY currency) t),'[]'::jsonb)));
END; $$;

CREATE VIEW public.earning_payment_balances AS
 SELECT salary_period_id,commission_id,sum(amount) amount FROM public.external_payments GROUP BY salary_period_id,commission_id;
REVOKE ALL ON public.earning_payment_balances FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.earning_payment_balances TO service_role;

CREATE OR REPLACE FUNCTION public.set_staff_account_status(p_actor uuid,p_profile uuid,p_status public.account_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.profiles;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 SELECT * INTO target FROM public.profiles WHERE id=p_profile FOR UPDATE;
 IF NOT FOUND OR target.role NOT IN ('recruiter','technical_recruiter') THEN RAISE EXCEPTION 'Choose a recruiter or technical recruiter account'; END IF;
 UPDATE public.profiles SET status=p_status WHERE id=p_profile;
 INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'profile_status_changed',p_profile,jsonb_build_object('from',target.status,'to',p_status));
END; $$;
REVOKE ALL ON FUNCTION public.set_staff_account_status(uuid,uuid,public.account_status) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_account_status(uuid,uuid,public.account_status) TO service_role;

REVOKE ALL ON FUNCTION public.sync_placement_months(uuid),public.adjust_placement_month(uuid,uuid,uuid,numeric,text,text,text),public.decide_placement_commission(uuid,uuid,text,text),public.recruiting_operations_totals(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_placement_months(uuid),public.adjust_placement_month(uuid,uuid,uuid,numeric,text,text,text),public.decide_placement_commission(uuid,uuid,text,text),public.recruiting_operations_totals(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
