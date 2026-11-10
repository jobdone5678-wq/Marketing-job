-- Migration: Add RTR (Right to Represent) Document Support
-- Stores RTR documents when a vendor/company sends RTR for a candidate's job application

BEGIN;

-- 1. Add RTR document column to public.job_submissions
ALTER TABLE public.job_submissions ADD COLUMN IF NOT EXISTS rtr_document jsonb DEFAULT NULL;

-- 2. Create a separate RTR documents table for multiple RTRs per submission
CREATE TABLE IF NOT EXISTS public.rtr_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES public.job_submissions(id) ON DELETE CASCADE,
    candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,

    -- RTR Document Details
    filename text NOT NULL,
    mime_type text NOT NULL,
    base64 text,
    document_url text,

    -- RTR Metadata
    vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
    vendor_name text,
    vendor_contact_name text,
    vendor_contact_email text,
    vendor_contact_phone text,

    -- RTR Specific Fields
    rtr_type text CHECK (rtr_type IN ('vendor_rtr', 'client_rtr', 'direct_rtr')) DEFAULT 'vendor_rtr',
    rtr_status text CHECK (rtr_status IN ('received', 'signed', 'expired', 'rejected')) DEFAULT 'received',
    rtr_date date DEFAULT CURRENT_DATE,
    expiration_date date,

    -- Rate Information (extracted from RTR document)
    hourly_rate numeric(10,2),
    daily_rate numeric(10,2),
    weekly_rate numeric(10,2),
    monthly_rate numeric(10,2),
    annual_rate numeric(12,2),
    currency char(3) DEFAULT 'USD',

    -- Notes and tracking
    notes text,
    uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rtr_documents_submission ON public.rtr_documents(submission_id);
CREATE INDEX IF NOT EXISTS idx_rtr_documents_candidate ON public.rtr_documents(candidate_id);
CREATE INDEX IF NOT EXISTS idx_rtr_documents_vendor ON public.rtr_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_rtr_documents_status ON public.rtr_documents(rtr_status);

ALTER TABLE public.rtr_documents ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for RTR Documents
DROP POLICY IF EXISTS rtr_staff_read ON public.rtr_documents;
CREATE POLICY rtr_staff_read ON public.rtr_documents FOR SELECT TO authenticated
USING (
    public.get_current_role() IN ('super_admin', 'recruiter', 'technical_recruiter')
);

DROP POLICY IF EXISTS rtr_candidate_read ON public.rtr_documents;
CREATE POLICY rtr_candidate_read ON public.rtr_documents FOR SELECT TO authenticated
USING (
    public.get_current_role() = 'client'
    AND candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
);

-- 4. Grant permissions
REVOKE ALL ON public.rtr_documents FROM anon, authenticated;
GRANT SELECT ON public.rtr_documents TO authenticated;
GRANT ALL ON public.rtr_documents TO service_role;

-- 5. Function to save RTR document
CREATE OR REPLACE FUNCTION public.save_rtr_document(
    p_actor uuid,
    p_submission uuid,
    p_candidate uuid,
    p_filename text,
    p_mime_type text,
    p_base64 text,
    p_vendor_id uuid DEFAULT NULL,
    p_vendor_name text DEFAULT NULL,
    p_vendor_contact_name text DEFAULT NULL,
    p_vendor_contact_email text DEFAULT NULL,
    p_vendor_contact_phone text DEFAULT NULL,
    p_rtr_type text DEFAULT 'vendor_rtr',
    p_rtr_status text DEFAULT 'received',
    p_rtr_date date DEFAULT CURRENT_DATE,
    p_expiration_date date DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
    actor public.profiles;
    submission public.job_submissions;
    candidate public.candidates;
    rtr public.rtr_documents;
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

    -- Also update the job_submissions with the latest RTR document reference
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
        'created_at', rtr.created_at
    )
    WHERE id = p_submission;

    -- Audit log
    INSERT INTO public.audit_events (actor_id, action, subject_id, metadata)
    VALUES (p_actor, 'rtr_document_saved', rtr.id,
        jsonb_build_object(
            'submission_id', p_submission,
            'candidate_id', p_candidate,
            'filename', p_filename,
            'vendor_name', p_vendor_name,
            'rtr_type', p_rtr_type,
            'rtr_status', p_rtr_status
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
        'created_at', rtr.created_at
    );
END; $$;

REVOKE ALL ON FUNCTION public.save_rtr_document(uuid, uuid, uuid, text, text, text, uuid, text, text, text, text, text, text, date, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_rtr_document(uuid, uuid, uuid, text, text, text, uuid, text, text, text, text, text, text, date, date, text) TO service_role;

-- 6. Function to update RTR document status
CREATE OR REPLACE FUNCTION public.update_rtr_status(
    p_actor uuid,
    p_rtr_id uuid,
    p_rtr_status text,
    p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
    actor public.profiles;
    rtr public.rtr_documents;
BEGIN
    SELECT * INTO actor FROM public.profiles WHERE id = p_actor AND status = 'active';
    IF actor.id IS NULL OR actor.role NOT IN ('recruiter', 'technical_recruiter', 'super_admin') THEN
        RAISE EXCEPTION 'Active recruiting staff required';
    END IF;

    SELECT * INTO rtr FROM public.rtr_documents WHERE id = p_rtr_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'RTR document not found';
    END IF;

    IF NOT public.candidate_actor_can_access(p_actor, rtr.candidate_id) THEN
        RAISE EXCEPTION 'Candidate access denied';
    END IF;

    UPDATE public.rtr_documents
    SET rtr_status = p_rtr_status,
        notes = COALESCE(left(p_notes, 2000), rtr.notes),
        updated_at = now()
    WHERE id = p_rtr_id
    RETURNING * INTO rtr;

    -- Update the job_submissions reference
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
        'created_at', rtr.created_at
    )
    WHERE id = rtr.submission_id;

    INSERT INTO public.audit_events (actor_id, action, subject_id, metadata)
    VALUES (p_actor, 'rtr_status_updated', rtr.id,
        jsonb_build_object('old_status', rtr.rtr_status, 'new_status', p_rtr_status, 'notes', p_notes)
    );

    RETURN jsonb_build_object('id', rtr.id, 'rtr_status', rtr.rtr_status, 'updated_at', rtr.updated_at);
END; $$;

REVOKE ALL ON FUNCTION public.update_rtr_status(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_rtr_status(uuid, uuid, text, text) TO service_role;

-- 7. Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trg_rtr_documents_updated_at ON public.rtr_documents;
CREATE TRIGGER trg_rtr_documents_updated_at
BEFORE UPDATE ON public.rtr_documents
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMIT;