-- Migration: Add Rate Fields to RTR Documents for Automatic Price Extraction
-- This migration adds fields to store rate information extracted from RTR documents

BEGIN;

-- Add rate columns to rtr_documents table
ALTER TABLE public.rtr_documents ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2);
ALTER TABLE public.rtr_documents ADD COLUMN IF NOT EXISTS daily_rate numeric(10,2);
ALTER TABLE public.rtr_documents ADD COLUMN IF NOT EXISTS weekly_rate numeric(10,2);
ALTER TABLE public.rtr_documents ADD COLUMN IF NOT EXISTS monthly_rate numeric(10,2);
ALTER TABLE public.rtr_documents ADD COLUMN IF NOT EXISTS annual_rate numeric(12,2);
ALTER TABLE public.rtr_documents ADD COLUMN IF NOT EXISTS currency char(3) DEFAULT 'USD';

-- Update the rtr_document reference in job_submissions to include rate info
-- Note: The save_rtr_document function will need to be updated to include these fields

-- Add rate columns to rtr_document JSON reference fields
-- The JSONB reference in job_submissions.rtr_document can now include rate info

-- Grant permissions
GRANT SELECT ON public.rtr_documents TO authenticated;

-- Update function to include rate extraction
CREATE OR REPLACE FUNCTION public.save_rtr_document_extended(
    p_actor uuid,
    p_submission uuid,
    p_candidate uuid,
    p_filename text,
    p_mime_type text,
    p_base64 text DEFAULT NULL,
    p_vendor_id uuid DEFAULT NULL,
    p_vendor_name text DEFAULT NULL,
    p_vendor_contact_name text DEFAULT NULL,
    p_vendor_contact_email text DEFAULT NULL,
    p_vendor_contact_phone text DEFAULT NULL,
    p_rtr_type text DEFAULT 'vendor_rtr',
    p_rtr_status text DEFAULT 'received',
    p_rtr_date date DEFAULT CURRENT_DATE,
    p_expiration_date date DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_hourly_rate numeric DEFAULT NULL,
    p_daily_rate numeric DEFAULT NULL,
    p_weekly_rate numeric DEFAULT NULL,
    p_monthly_rate numeric DEFAULT NULL,
    p_annual_rate numeric DEFAULT NULL,
    p_currency char(3) DEFAULT 'USD'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
    actor public.profiles;
    submission public.job_submissions;
    candidate public.candidates;
    rtr public.rtr_documents;
    primary_rate text;
    rate_type text;
BEGIN
    -- Verify actor is active staff
    SELECT * INTO actor FROM public.profiles WHERE id = p_actor AND status = 'active';
    IF actor.id IS NULL OR actor.role NOT IN ('recruiter', 'technical_recruiter', 'super_admin') THEN
        RAISE EXCEPTION 'Active recruiting staff required';
    END IF;

    -- Verify submission exists and matches candidate
    SELECT * INTO submission FROM public.job_submissions WHERE id = p_submission FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Submission not found';
    END IF;

    IF submission.candidate_id IS DISTINCT FROM p_candidate THEN
        RAISE EXCEPTION 'Submission candidate mismatch';
    END IF;

    -- Verify candidate access
    IF NOT public.candidate_actor_can_access(p_actor, p_candidate) THEN
        RAISE EXCEPTION 'Candidate access denied';
    END IF;

    -- Determine primary rate and type
    IF p_hourly_rate IS NOT NULL THEN
        primary_rate := p_hourly_rate::text;
        rate_type := 'hourly';
    ELSIF p_daily_rate IS NOT NULL THEN
        primary_rate := p_daily_rate::text;
        rate_type := 'daily';
    ELSIF p_weekly_rate IS NOT NULL THEN
        primary_rate := p_weekly_rate::text;
        rate_type := 'weekly';
    ELSIF p_monthly_rate IS NOT NULL THEN
        primary_rate := p_monthly_rate::text;
        rate_type := 'monthly';
    ELSIF p_annual_rate IS NOT NULL THEN
        primary_rate := p_annual_rate::text;
        rate_type := 'annual';
    END IF;

    -- Insert RTR document
    INSERT INTO public.rtr_documents (
        submission_id, candidate_id,
        filename, mime_type, base64,
        vendor_id, vendor_name, vendor_contact_name, vendor_contact_email, vendor_contact_phone,
        rtr_type, rtr_status, rtr_date, expiration_date, notes, uploaded_by,
        hourly_rate, daily_rate, weekly_rate, monthly_rate, annual_rate, currency
    ) VALUES (
        p_submission, p_candidate,
        left(p_filename, 255), left(p_mime_type, 100), p_base64,
        p_vendor_id, left(p_vendor_name, 200), left(p_vendor_contact_name, 200),
        left(p_vendor_contact_email, 255), left(p_vendor_contact_phone, 50),
        p_rtr_type, p_rtr_status, p_rtr_date, p_expiration_date, left(p_notes, 2000), p_actor,
        p_hourly_rate, p_daily_rate, p_weekly_rate, p_monthly_rate, p_annual_rate, p_currency
    ) RETURNING * INTO rtr;

    -- Update the job_submissions with the latest RTR document reference
    UPDATE public.job_submissions
    SET rtr_document = jsonb_build_object(
        'id', rtr.id,
        'filename', rtr.filename,
        'mime_type', rtr.mime_type,
        'vendor_name', rtr.vendor_name,
        'rtr_type', rtr.rtr_type,
        'rtr_status', rtr.rtr_status,
        'rtr_date', rtr.rtr_date,
        'expiration_date', rtr.expiration_date,
        'hourly_rate', rtr.hourly_rate,
        'daily_rate', rtr.daily_rate,
        'weekly_rate', rtr.weekly_rate,
        'monthly_rate', rtr.monthly_rate,
        'annual_rate', rtr.annual_rate,
        'currency', rtr.currency,
        'created_at', rtr.created_at
    )
    WHERE id = p_submission;

    -- Also update submitted_rate if it's still empty
    IF submission.submitted_rate IS NULL AND primary_rate IS NOT NULL THEN
        UPDATE public.job_submissions
        SET submitted_rate = primary_rate || CASE WHEN rate_type = 'hourly' THEN '/hr'
               WHEN rate_type = 'daily' THEN '/day'
               WHEN rate_type = 'weekly' THEN '/wk'
               WHEN rate_type = 'monthly' THEN '/mo'
               WHEN rate_type = 'annual' THEN '/yr'
               ELSE '' END
        WHERE id = p_submission;
    END IF;

    -- Audit log
    INSERT INTO public.audit_events (actor_id, action, subject_id, metadata)
    VALUES (p_actor, 'rtr_document_saved', rtr.id,
        jsonb_build_object(
            'submission_id', p_submission,
            'candidate_id', p_candidate,
            'filename', p_filename,
            'vendor_name', p_vendor_name,
            'rtr_type', p_rtr_type,
            'rtr_status', p_rtr_status,
            'rate_type', rate_type,
            'primary_rate', primary_rate
        )
    );

    RETURN jsonb_build_object(
        'id', rtr.id,
        'submission_id', rtr.submission_id,
        'candidate_id', rtr.candidate_id,
        'filename', rtr.filename,
        'mime_type', rtr.mime_type,
        'vendor_name', rtr.vendor_name,
        'rtr_type', rtr.rtr_type,
        'rtr_status', rtr.rtr_status,
        'rtr_date', rtr.rtr_date,
        'expiration_date', rtr.expiration_date,
        'hourly_rate', rtr.hourly_rate,
        'daily_rate', rtr.daily_rate,
        'weekly_rate', rtr.weekly_rate,
        'monthly_rate', rtr.monthly_rate,
        'annual_rate', rtr.annual_rate,
        'currency', rtr.currency,
        'created_at', rtr.created_at
    );
END; $$;

REVOKE ALL ON FUNCTION public.save_rtr_document_extended(uuid, uuid, uuid, text, text, text, uuid, text, text, text, text, text, text, date, date, text, numeric, numeric, numeric, numeric, numeric, char(3)) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_rtr_document_extended(uuid, uuid, uuid, text, text, text, uuid, text, text, text, text, text, text, date, date, text, numeric, numeric, numeric, numeric, numeric, char(3)) TO service_role;

COMMIT;