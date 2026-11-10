BEGIN;

ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Keep trusted candidate writes valid for both individual JWT claims and JSON claims.
CREATE OR REPLACE FUNCTION public.guard_candidate_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role',true)='service_role'
    OR COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND (NEW.version<>1 OR NEW.provenance_status<>'legacy_unconfirmed' OR NEW.confirmed_facts<>'{}'::jsonb
    OR NEW.created_by IS NOT NULL OR NEW.assigned_technical_recruiter_id IS NOT NULL
    OR (public.get_current_role()='client' AND (NEW.user_id IS DISTINCT FROM auth.uid() OR NEW.assigned_recruiter_id IS NOT NULL))) THEN
    RAISE EXCEPTION 'Candidate protected fields require a trusted review operation';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.assigned_recruiter_id IS DISTINCT FROM OLD.assigned_recruiter_id
    OR NEW.assigned_technical_recruiter_id IS DISTINCT FROM OLD.assigned_technical_recruiter_id
    OR NEW.version IS DISTINCT FROM OLD.version OR NEW.provenance_status IS DISTINCT FROM OLD.provenance_status
    OR NEW.confirmed_facts IS DISTINCT FROM OLD.confirmed_facts OR NEW.employment_history IS DISTINCT FROM OLD.employment_history
    OR NEW.education_history IS DISTINCT FROM OLD.education_history OR NEW.evidence IS DISTINCT FROM OLD.evidence OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'Candidate protected fields require a trusted review operation';
  END IF;
  RETURN NEW;
END; $$;

ALTER TABLE public.staff_salary_periods DROP CONSTRAINT staff_salary_periods_status_check;
ALTER TABLE public.staff_salary_periods ADD CONSTRAINT staff_salary_periods_status_check
  CHECK(status IN ('awaiting_adjustment','accruing','due','partially_paid','paid','overdue','cancelled'));
ALTER TABLE public.staff_salary_periods ADD COLUMN compensation_term_id uuid REFERENCES public.staff_compensation_terms(id);
ALTER TABLE public.staff_salary_periods ADD COLUMN monthly_amount numeric(14,2) CHECK(monthly_amount>=0);
ALTER TABLE public.staff_salary_periods ADD COLUMN adjusted_at timestamptz;
ALTER TABLE public.staff_salary_periods ADD COLUMN adjusted_by uuid REFERENCES public.profiles(id);
UPDATE public.staff_salary_periods p SET compensation_term_id=t.id,monthly_amount=t.monthly_amount
FROM public.staff_compensation_terms t WHERE t.employment_id=p.employment_id AND t.effective_from<=p.start_date
  AND (t.effective_to IS NULL OR t.effective_to>=p.start_date);

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
    UPDATE public.staff_salary_periods SET status='cancelled' WHERE employment_id=p_employment AND start_date>employment.end_date;
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
  UPDATE public.staff_salary_periods p SET status=CASE WHEN p.amount-COALESCE((SELECT sum(x.amount) FROM public.external_payments x WHERE x.salary_period_id=p.id),0)<=0 THEN 'paid'
    WHEN COALESCE((SELECT sum(x.amount) FROM public.external_payments x WHERE x.salary_period_id=p.id),0)>0 THEN 'partially_paid'
    WHEN p.due_date<current_date THEN 'overdue' WHEN p.due_date=current_date THEN 'due' ELSE 'accruing' END
    WHERE p.employment_id=p_employment AND p.status NOT IN ('awaiting_adjustment','cancelled');
END; $$;

CREATE OR REPLACE FUNCTION public.save_staff_employment(p_actor uuid,p_profile uuid,p_hire date,p_end date,p_partial_rule text,p_amount numeric,p_currency text,p_effective date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE employment public.staff_employments; prior public.staff_employments; term public.staff_compensation_terms; next_effective date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=p_profile AND role IN ('recruiter','technical_recruiter') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a recruiter or technical recruiter'; END IF;
  IF p_amount IS NULL OR p_amount<0 OR p_amount<>round(p_amount,2) OR p_currency !~ '^[A-Z]{3}$'
    OR p_hire IS NULL OR p_effective IS NULL OR p_effective<p_hire OR (p_end IS NOT NULL AND (p_end<p_hire OR p_effective>p_end))
    OR p_partial_rule NOT IN ('manual','fixed_monthly') THEN RAISE EXCEPTION 'Invalid employment dates or salary terms'; END IF;
  SELECT * INTO prior FROM public.staff_employments WHERE profile_id=p_profile FOR UPDATE;
  IF FOUND THEN
    IF prior.hire_date<>p_hire AND EXISTS(SELECT 1 FROM public.staff_salary_periods WHERE employment_id=prior.id) THEN
      RAISE EXCEPTION 'Joining date cannot change after salary periods exist';
    END IF;
    UPDATE public.staff_employments SET hire_date=p_hire,end_date=p_end,partial_period_rule=p_partial_rule,updated_at=now()
      WHERE id=prior.id RETURNING * INTO employment;
  ELSE
    IF p_effective<>p_hire THEN RAISE EXCEPTION 'Initial salary terms must begin on the joining date'; END IF;
    INSERT INTO public.staff_employments(profile_id,hire_date,end_date,partial_period_rule,created_by)
      VALUES(p_profile,p_hire,p_end,p_partial_rule,p_actor) RETURNING * INTO employment;
  END IF;
  SELECT * INTO term FROM public.staff_compensation_terms WHERE employment_id=employment.id AND effective_from=p_effective;
  IF FOUND THEN
    IF term.monthly_amount<>p_amount OR trim(term.currency)<>p_currency THEN
      RAISE EXCEPTION 'Existing compensation terms are immutable; record a new effective date';
    END IF;
  ELSE
    SELECT min(effective_from) INTO next_effective FROM public.staff_compensation_terms WHERE employment_id=employment.id AND effective_from>p_effective;
    UPDATE public.staff_compensation_terms SET effective_to=p_effective-1 WHERE employment_id=employment.id
      AND effective_from<p_effective AND (effective_to IS NULL OR effective_to>=p_effective);
    INSERT INTO public.staff_compensation_terms(employment_id,monthly_amount,currency,effective_from,effective_to,created_by)
      VALUES(employment.id,p_amount,p_currency,p_effective,next_effective-1,p_actor);
  END IF;
  PERFORM public.sync_staff_salary_periods(employment.id);
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'staff_employment_terms_saved',employment.id,
    jsonb_build_object('before',to_jsonb(prior),'after',to_jsonb(employment),'monthly_amount',p_amount,'currency',p_currency,'effective_from',p_effective));
  RETURN to_jsonb(employment);
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_staff_salary_period(p_actor uuid,p_period uuid,p_amount numeric,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE period public.staff_salary_periods;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  SELECT * INTO period FROM public.staff_salary_periods WHERE id=p_period FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Salary period not found'; END IF;
  IF period.status<>'awaiting_adjustment' THEN RAISE EXCEPTION 'Only a period awaiting adjustment can be set'; END IF;
  IF p_amount IS NULL OR p_amount<0 OR p_amount<>round(p_amount,2) OR length(trim(COALESCE(p_reason,'')))=0 THEN RAISE EXCEPTION 'A valid final amount and adjustment reason are required'; END IF;
  UPDATE public.staff_salary_periods SET amount=p_amount,status=CASE WHEN p_amount=0 THEN 'paid' WHEN due_date<current_date THEN 'overdue' WHEN due_date=current_date THEN 'due' ELSE 'accruing' END,
    notes=p_reason,adjusted_at=now(),adjusted_by=p_actor WHERE id=p_period;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'salary_period_adjusted',p_period,
    jsonb_build_object('before_amount',period.amount,'amount',p_amount,'currency',period.currency,'reason',p_reason));
END; $$;

-- Cancellation is an employment correction, not permission to pay a non-existent period.
CREATE OR REPLACE FUNCTION public.guard_salary_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.salary_period_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.staff_salary_periods WHERE id=NEW.salary_period_id AND status='cancelled') THEN
    RAISE EXCEPTION 'Cancelled salary periods cannot receive payments';
  END IF;
  IF NEW.amount<>round(NEW.amount,2) THEN RAISE EXCEPTION 'Payment amount must use at most two decimal places'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER enforce_salary_payment BEFORE INSERT ON public.external_payments FOR EACH ROW EXECUTE FUNCTION public.guard_salary_payment();

REVOKE ALL ON FUNCTION public.sync_staff_salary_periods(uuid,date),public.save_staff_employment(uuid,uuid,date,date,text,numeric,text,date),public.adjust_staff_salary_period(uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_staff_salary_periods(uuid,date),public.save_staff_employment(uuid,uuid,date,date,text,numeric,text,date),public.adjust_staff_salary_period(uuid,uuid,numeric,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
