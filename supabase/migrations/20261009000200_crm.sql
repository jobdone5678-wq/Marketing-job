ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'Draft';
BEGIN;
ALTER TABLE public.job_submissions ALTER COLUMN status DROP DEFAULT,ALTER COLUMN portal_source DROP DEFAULT,ALTER COLUMN job_location DROP DEFAULT;
CREATE TABLE public.vendors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(trim(name))>0),data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.vendor_contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,data jsonb NOT NULL);
CREATE TABLE public.workspace_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),ai_daily_limit integer NOT NULL DEFAULT 100 CHECK(ai_daily_limit BETWEEN 1 AND 10000),
  source_sync_minutes integer NOT NULL DEFAULT 30 CHECK(source_sync_minutes IN(15,30,60)),company_name text,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.workspace_settings(id) VALUES(true);
ALTER TABLE public.job_submissions ADD COLUMN vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_vendors ON public.vendors FOR SELECT TO authenticated USING(public.get_current_role() IN('recruiter','super_admin'));
CREATE POLICY staff_contacts ON public.vendor_contacts FOR SELECT TO authenticated USING(public.get_current_role() IN('recruiter','super_admin'));
CREATE POLICY staff_settings ON public.workspace_settings FOR SELECT TO authenticated USING(public.get_current_role() IN('recruiter','super_admin'));
REVOKE ALL ON public.vendors,public.vendor_contacts,public.workspace_settings FROM anon,authenticated;
GRANT SELECT ON public.vendors,public.vendor_contacts,public.workspace_settings TO authenticated;
GRANT ALL ON public.vendors,public.vendor_contacts,public.workspace_settings TO service_role;
CREATE FUNCTION public.save_vendor(p_id uuid,p_data jsonb,p_contacts jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;contact jsonb;
BEGIN
  IF p_id IS NULL THEN INSERT INTO vendors(name,data) VALUES(trim(p_data->>'name'),p_data-'contacts'-'id') RETURNING id INTO target;
  ELSE UPDATE vendors SET name=trim(p_data->>'name'),data=p_data-'contacts'-'id',updated_at=now() WHERE id=p_id RETURNING id INTO target;
    IF target IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF; END IF;
  DELETE FROM vendor_contacts WHERE vendor_id=target;
  FOR contact IN SELECT * FROM jsonb_array_elements(p_contacts) LOOP INSERT INTO vendor_contacts(vendor_id,data) VALUES(target,contact-'id');END LOOP;
  RETURN target;
END; $$;
REVOKE ALL ON FUNCTION public.save_vendor(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.save_vendor(uuid,jsonb,jsonb) TO service_role;
COMMIT;
