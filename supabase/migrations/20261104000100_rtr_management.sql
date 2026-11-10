-- Migration: 20261104000100_rtr_management.sql
-- Description: Add rtr_document column to job_submissions and create dedicated rtr_documents table

-- 1. Ensure rtr_document jsonb column exists on job_submissions
ALTER TABLE public.job_submissions ADD COLUMN IF NOT EXISTS rtr_document jsonb DEFAULT NULL;

-- 2. Create dedicated rtr_documents table for full document tracking & OCR history
CREATE TABLE IF NOT EXISTS public.rtr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES public.job_submissions(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  document_url TEXT,
  base64 TEXT,
  rtr_type TEXT NOT NULL DEFAULT 'vendor_rtr', -- 'vendor_rtr' | 'client_rtr' | 'direct_rtr'
  rtr_status TEXT NOT NULL DEFAULT 'received', -- 'received' | 'signed' | 'expired' | 'rejected'
  rtr_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date DATE,
  company_name TEXT,
  job_title TEXT,
  vendor_name TEXT,
  vendor_contact_name TEXT,
  vendor_contact_email TEXT,
  vendor_contact_phone TEXT,
  hourly_rate TEXT,
  daily_rate TEXT,
  monthly_rate TEXT,
  annual_rate TEXT,
  currency TEXT DEFAULT 'USD',
  ocr_raw_text TEXT,
  ocr_extracted_data JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_rtr_documents_candidate_id ON public.rtr_documents(candidate_id);
CREATE INDEX IF NOT EXISTS idx_rtr_documents_submission_id ON public.rtr_documents(submission_id);
CREATE INDEX IF NOT EXISTS idx_rtr_documents_rtr_status ON public.rtr_documents(rtr_status);
CREATE INDEX IF NOT EXISTS idx_rtr_documents_rtr_date ON public.rtr_documents(rtr_date DESC);

-- Enable RLS
ALTER TABLE public.rtr_documents ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "rtr_documents_staff_access" ON public.rtr_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'recruiter', 'technical_recruiter')
      AND profiles.status = 'active'
    )
  );

CREATE POLICY "rtr_documents_candidate_access" ON public.rtr_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.candidates
      WHERE candidates.id = rtr_documents.candidate_id
      AND candidates.user_id = auth.uid()
    )
  );
