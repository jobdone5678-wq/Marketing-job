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
