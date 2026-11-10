BEGIN;

-- A one-time active-placement milestone remains earned after normal employment ends.
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
  eligible:=NEW.status<>'cancelled' AND CASE NEW.commission_milestone WHEN 'candidate_joining' THEN NEW.actual_join_date IS NOT NULL ELSE NEW.status IN ('active','completed','ended_early') AND NEW.actual_join_date IS NOT NULL END;
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

NOTIFY pgrst,'reload schema';
COMMIT;

