BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_employments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  hire_date date NOT NULL,
  end_date date,
  partial_period_rule text NOT NULL CHECK(partial_period_rule IN ('manual','fixed_monthly')),
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(end_date IS NULL OR end_date>=hire_date)
);
CREATE TABLE IF NOT EXISTS public.staff_compensation_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employment_id uuid NOT NULL REFERENCES public.staff_employments(id) ON DELETE CASCADE,
  monthly_amount numeric(14,2) NOT NULL CHECK(monthly_amount>=0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  effective_from date NOT NULL,
  effective_to date,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(effective_to IS NULL OR effective_to>=effective_from),
  UNIQUE(employment_id,effective_from)
);
CREATE TABLE IF NOT EXISTS public.staff_salary_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employment_id uuid NOT NULL REFERENCES public.staff_employments(id) ON DELETE CASCADE,
  period_index integer NOT NULL CHECK(period_index>=0),
  start_date date NOT NULL,
  end_date_exclusive date NOT NULL,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK(amount>=0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'accruing' CHECK(status IN ('awaiting_adjustment','accruing','due','partially_paid','paid','overdue')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employment_id,period_index),
  CHECK(end_date_exclusive>start_date),
  CHECK(due_date>=start_date)
);

CREATE TABLE IF NOT EXISTS public.placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE RESTRICT,
  submission_id uuid REFERENCES public.job_submissions(id) ON DELETE SET NULL,
  company text NOT NULL CHECK(length(trim(company)) BETWEEN 1 AND 200),
  role_title text NOT NULL CHECK(length(trim(role_title)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'offer_accepted' CHECK(status IN ('offer_accepted','joining_scheduled','active','completed','ended_early','cancelled')),
  recruiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  technical_recruiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  planned_start_date date,
  actual_join_date date,
  expected_end_date date,
  actual_end_date date,
  candidate_monthly_amount numeric(14,2) CHECK(candidate_monthly_amount IS NULL OR candidate_monthly_amount>=0),
  candidate_currency char(3) CHECK(candidate_currency IS NULL OR candidate_currency ~ '^[A-Z]{3}$'),
  candidate_compensation_visible boolean NOT NULL DEFAULT false,
  commission_amount numeric(14,2) CHECK(commission_amount IS NULL OR commission_amount>=0),
  commission_currency char(3) CHECK(commission_currency IS NULL OR commission_currency ~ '^[A-Z]{3}$'),
  commission_milestone text NOT NULL DEFAULT 'candidate_joining' CHECK(commission_milestone IN ('candidate_joining','placement_active')),
  commission_due_days integer NOT NULL DEFAULT 0 CHECK(commission_due_days BETWEEN 0 AND 365),
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expected_end_date IS NULL OR actual_join_date IS NULL OR expected_end_date>=actual_join_date),
  CHECK(actual_end_date IS NULL OR actual_join_date IS NULL OR actual_end_date>=actual_join_date)
);
CREATE INDEX IF NOT EXISTS placements_candidate_dates ON public.placements(candidate_id,actual_join_date DESC);

CREATE TABLE IF NOT EXISTS public.placement_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES public.placements(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  covered_start date NOT NULL,
  covered_end date NOT NULL,
  agreed_amount numeric(14,2) CHECK(agreed_amount IS NULL OR agreed_amount>=0),
  currency char(3) CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','active','completed','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(placement_id,month_start),
  CHECK(covered_end>=covered_start),
  CHECK(extract(day FROM month_start)=1)
);

CREATE TABLE IF NOT EXISTS public.technical_recruiter_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES public.placements(id) ON DELETE RESTRICT,
  technical_recruiter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  milestone text NOT NULL CHECK(milestone IN ('candidate_joining','placement_active')),
  amount numeric(14,2) NOT NULL CHECK(amount>=0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  due_date date,
  status text NOT NULL DEFAULT 'awaiting_eligibility' CHECK(status IN ('awaiting_eligibility','awaiting_approval','approved','rejected','partially_paid','paid')),
  eligible_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(placement_id,technical_recruiter_id,milestone)
);

CREATE TABLE IF NOT EXISTS public.external_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  salary_period_id uuid REFERENCES public.staff_salary_periods(id) ON DELETE RESTRICT,
  commission_id uuid REFERENCES public.technical_recruiter_commissions(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK(amount<>0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  paid_on date NOT NULL,
  method text NOT NULL CHECK(length(trim(method)) BETWEEN 1 AND 100),
  external_reference text,
  notes text,
  correction_of uuid REFERENCES public.external_payments(id) ON DELETE RESTRICT,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((salary_period_id IS NOT NULL)::integer+(commission_id IS NOT NULL)::integer=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS external_payment_reference_unique ON public.external_payments(lower(external_reference)) WHERE external_reference IS NOT NULL AND correction_of IS NULL;
CREATE INDEX IF NOT EXISTS external_payment_salary_period ON public.external_payments(salary_period_id);
CREATE INDEX IF NOT EXISTS external_payment_commission ON public.external_payments(commission_id);

ALTER TABLE public.staff_employments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_compensation_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_salary_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_recruiter_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_payments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.placement_profile_can_read(p_candidate uuid,p_recruiter uuid,p_technical uuid,p_visible boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.candidates c ON c.id=p_candidate WHERE p.id=auth.uid() AND p.status='active' AND (
   p.role='super_admin' OR p.role='client' AND c.user_id=p.id AND p_visible
   OR p.role='recruiter' AND c.assigned_recruiter_id=p.id AND c.id=p_candidate
   OR p.role='technical_recruiter' AND c.assigned_technical_recruiter_id=p.id AND c.id=p_candidate))
$$;
CREATE POLICY staff_employment_reads ON public.staff_employments FOR SELECT TO authenticated
 USING(profile_id=auth.uid() AND public.get_current_role() IN ('recruiter','technical_recruiter') OR public.get_current_role()='super_admin');
CREATE POLICY staff_terms_reads ON public.staff_compensation_terms FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.staff_employments e WHERE e.id=employment_id AND (e.profile_id=auth.uid() AND public.get_current_role() IN ('recruiter','technical_recruiter') OR public.get_current_role()='super_admin')));
CREATE POLICY staff_salary_period_reads ON public.staff_salary_periods FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.staff_employments e WHERE e.id=employment_id AND (e.profile_id=auth.uid() AND public.get_current_role() IN ('recruiter','technical_recruiter') OR public.get_current_role()='super_admin')));
CREATE POLICY placement_reads ON public.placements FOR SELECT TO authenticated
 USING(public.placement_profile_can_read(candidate_id,recruiter_id,technical_recruiter_id,candidate_compensation_visible));
CREATE POLICY placement_month_reads ON public.placement_months FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.placements p WHERE p.id=placement_id AND public.placement_profile_can_read(p.candidate_id,p.recruiter_id,p.technical_recruiter_id,p.candidate_compensation_visible)));
CREATE POLICY commission_reads ON public.technical_recruiter_commissions FOR SELECT TO authenticated
 USING(technical_recruiter_id=auth.uid() AND public.get_current_role()='technical_recruiter' OR public.get_current_role()='super_admin');
CREATE POLICY external_payment_reads ON public.external_payments FOR SELECT TO authenticated
 USING(payee_profile_id=auth.uid() AND public.get_current_role() IN ('recruiter','technical_recruiter') OR public.get_current_role()='super_admin');
REVOKE INSERT,UPDATE,DELETE ON public.staff_employments,public.staff_compensation_terms,public.staff_salary_periods,public.placements,public.placement_months,public.technical_recruiter_commissions,public.external_payments FROM anon,authenticated;
GRANT SELECT ON public.staff_employments,public.staff_compensation_terms,public.staff_salary_periods,public.placements,public.placement_months,public.technical_recruiter_commissions,public.external_payments TO authenticated;
GRANT ALL ON public.staff_employments,public.staff_compensation_terms,public.staff_salary_periods,public.placements,public.placement_months,public.technical_recruiter_commissions,public.external_payments TO service_role;
-- Placement financial columns have candidate-specific visibility, which row-level policies cannot enforce column by column.
-- Route these reads through the role-checked API, which removes hidden compensation and other recruiters' commission data.
REVOKE SELECT ON public.placements,public.placement_months FROM authenticated;

CREATE OR REPLACE FUNCTION public.record_external_payment(
  p_actor uuid,p_salary_period uuid,p_commission uuid,p_amount numeric,p_currency text,p_paid_on date,
  p_method text,p_reference text,p_notes text,p_correction uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; period public.staff_salary_periods; commission public.technical_recruiter_commissions;
  original public.external_payments; payee uuid; expected_currency text; due numeric; paid numeric; payment public.external_payments; today date;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  IF (p_salary_period IS NULL)=(p_commission IS NULL) OR p_amount=0 OR length(trim(p_method))=0 THEN RAISE EXCEPTION 'Invalid payment record'; END IF;
  IF p_salary_period IS NOT NULL THEN
    SELECT * INTO period FROM public.staff_salary_periods WHERE id=p_salary_period FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Salary period not found'; END IF;
    SELECT profile_id INTO payee FROM public.staff_employments WHERE id=period.employment_id;
    expected_currency:=trim(period.currency);due:=period.amount;
    IF period.status='awaiting_adjustment' THEN RAISE EXCEPTION 'Set the manual salary period amount before recording payment'; END IF;
  ELSE
    SELECT * INTO commission FROM public.technical_recruiter_commissions WHERE id=p_commission FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found'; END IF;
    IF commission.status NOT IN ('approved','partially_paid') AND p_correction IS NULL THEN RAISE EXCEPTION 'Commission approval is required before payment'; END IF;
    payee:=commission.technical_recruiter_id;expected_currency:=trim(commission.currency);due:=commission.amount;
  END IF;
  IF p_currency<>expected_currency THEN RAISE EXCEPTION 'Payment currency mismatch'; END IF;
  IF p_correction IS NULL THEN
    IF p_amount<0 THEN RAISE EXCEPTION 'Negative payments must reference the payment being corrected'; END IF;
    IF p_salary_period IS NOT NULL THEN SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE salary_period_id=p_salary_period;
    ELSE SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE commission_id=p_commission; END IF;
    IF p_amount>due-paid THEN RAISE EXCEPTION 'Payment exceeds the outstanding balance'; END IF;
  ELSE
    IF p_amount>=0 OR p_reason IS NULL OR length(trim(p_reason))=0 THEN RAISE EXCEPTION 'A payment correction needs a negative amount and a reason'; END IF;
    SELECT * INTO original FROM public.external_payments WHERE id=p_correction FOR UPDATE;
    IF NOT FOUND OR original.payee_profile_id<>payee OR original.salary_period_id IS DISTINCT FROM p_salary_period OR original.commission_id IS DISTINCT FROM p_commission OR original.correction_of IS NOT NULL THEN
      RAISE EXCEPTION 'Correction must reference a payment on the same earning record';
    END IF;
    SELECT original.amount+COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE correction_of=p_correction;
    IF abs(p_amount)>paid THEN RAISE EXCEPTION 'Correction exceeds the remaining original payment'; END IF;
  END IF;
  INSERT INTO public.external_payments(payee_profile_id,salary_period_id,commission_id,amount,currency,paid_on,method,external_reference,notes,correction_of,recorded_by)
    VALUES(payee,p_salary_period,p_commission,p_amount,p_currency,p_paid_on,trim(p_method),NULLIF(trim(p_reference),''),p_notes,p_correction,p_actor) RETURNING * INTO payment;
  IF p_salary_period IS NOT NULL THEN
    SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE salary_period_id=p_salary_period;
    today:=current_date;
    UPDATE public.staff_salary_periods SET status=CASE WHEN due-paid<=0 THEN 'paid' WHEN paid>0 THEN 'partially_paid' WHEN due_date<today THEN 'overdue' WHEN due_date<=today THEN 'due' ELSE 'accruing' END WHERE id=p_salary_period;
  ELSE
    SELECT COALESCE(sum(amount),0) INTO paid FROM public.external_payments WHERE commission_id=p_commission;
    UPDATE public.technical_recruiter_commissions SET status=CASE WHEN due-paid<=0 THEN 'paid' WHEN paid>0 THEN 'partially_paid' ELSE 'approved' END WHERE id=p_commission;
  END IF;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata)
    VALUES(p_actor,CASE WHEN p_correction IS NULL THEN 'external_payment_recorded' ELSE 'external_payment_corrected' END,payment.id,
      jsonb_build_object('payee_profile_id',payee,'salary_period_id',p_salary_period,'commission_id',p_commission,'amount',p_amount,'currency',p_currency,'paid_on',p_paid_on,'reason',p_reason));
  RETURN jsonb_build_object('id',payment.id,'payee_profile_id',payee,'balance',due-paid,'currency',expected_currency);
END; $$;
REVOKE ALL ON FUNCTION public.record_external_payment(uuid,uuid,uuid,numeric,text,date,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_external_payment(uuid,uuid,uuid,numeric,text,date,text,text,text,uuid,text) TO service_role;

COMMIT;
