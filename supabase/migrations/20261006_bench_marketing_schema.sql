-- ==============================================================================
-- BENCH SALES & RECRUITMENT PORTAL - PHASE 1 DATABASE MIGRATION
-- USA Candidate Tracking & Job Submission Excel Replacement System
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CUSTOM ENUMS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE app_role AS ENUM ('super_admin', 'recruiter', 'client');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
        CREATE TYPE account_status AS ENUM ('active', 'pending', 'suspended');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'submission_status') THEN
        CREATE TYPE submission_status AS ENUM (
            'Applied',
            'Vendor_Screening',
            'Submitted_to_Client',
            'Interview_Scheduled',
            'Round_1',
            'Round_2',
            'Offer_Received',
            'Rejected',
            'No_Response'
        );
    END IF;
END $$;

-- 3. PROFILES TABLE (Linked with Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role app_role NOT NULL DEFAULT 'client',
    status account_status NOT NULL DEFAULT 'active',
    phone TEXT,
    company_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. USA CANDIDATES TABLE (USA Candidate Information Form)
CREATE TABLE IF NOT EXISTS public.candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_recruiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    -- Personal Information
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    linkedin_url TEXT,
    current_city TEXT,
    current_state TEXT,
    full_address TEXT,

    -- Work Authorization
    visa_status TEXT NOT NULL DEFAULT 'STEM [EAD]',
    authorized_in_usa BOOLEAN NOT NULL DEFAULT true,
    need_sponsorship_now BOOLEAN NOT NULL DEFAULT false,
    need_sponsorship_future BOOLEAN NOT NULL DEFAULT false,

    -- Employment Information
    current_employer TEXT,
    current_job_title TEXT,
    employment_status TEXT DEFAULT 'STEM [EAD]',
    total_experience_years TEXT,
    relevant_experience_years TEXT,

    -- Availability & Preferences
    notice_period TEXT DEFAULT 'Immediately',
    available_to_join TEXT DEFAULT 'Immediately',
    interview_availability TEXT DEFAULT 'Mon- Thursday 10:00am- 3:00pm',
    open_to_relocation BOOLEAN DEFAULT true,
    preferred_work_type TEXT DEFAULT 'ALL',
    preferred_locations TEXT DEFAULT 'All',

    -- Compensation
    current_salary TEXT DEFAULT '$55/hr (W2)',
    expected_salary TEXT DEFAULT '95k-100k',
    employment_types TEXT[] DEFAULT ARRAY['C2C', 'W2', 'Full time'],

    -- Education & Skills
    highest_qualification TEXT DEFAULT 'Masters',
    university_name TEXT,
    graduation_year TEXT,
    target_job_titles TEXT DEFAULT 'Data Engineer',
    primary_skills TEXT,
    secondary_skills TEXT,
    certifications TEXT,
    resume_url TEXT,

    -- Bench Status
    is_active_bench BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. JOB SUBMISSIONS TABLE (The Direct Excel Sheet Replacement)
CREATE TABLE IF NOT EXISTS public.job_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
    recruiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    submission_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Company & Role Details
    company_name TEXT NOT NULL, -- End Client: e.g. Cloudflare, Capital One
    job_title TEXT NOT NULL,    -- e.g. Data Engineer
    job_url TEXT,
    portal_source TEXT DEFAULT 'Greenhouse', -- Greenhouse, Ashby, LinkedIn, Dice, Direct
    job_location TEXT DEFAULT 'Remote',

    -- Vendor & Rates
    vendor_company TEXT,        -- Implementation Partner / Prime Vendor (e.g. Apex, TEKsystems)
    vendor_contact_name TEXT,
    vendor_contact_email TEXT,
    vendor_contact_phone TEXT,
    submitted_rate TEXT,        -- e.g. $65/hr C2C or $55/hr W2
    client_pay_rate TEXT,

    -- Status & Lifecycle
    status submission_status NOT NULL DEFAULT 'Applied',
    interview_time TIMESTAMPTZ,
    interview_mode TEXT,        -- Zoom, Google Meet, Teams, Phone
    interview_meeting_link TEXT,
    notes TEXT,

    -- Safeguards
    duplicate_flag BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. INDEXES FOR HIGH-SPEED FILTERING & REPORTING
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON public.candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_assigned_recruiter ON public.candidates(assigned_recruiter_id);
CREATE INDEX IF NOT EXISTS idx_candidates_is_active_bench ON public.candidates(is_active_bench);

CREATE INDEX IF NOT EXISTS idx_job_submissions_candidate_id ON public.job_submissions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_submissions_recruiter_id ON public.job_submissions(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_job_submissions_submission_date ON public.job_submissions(submission_date DESC);
CREATE INDEX IF NOT EXISTS idx_job_submissions_company_name ON public.job_submissions(company_name);
CREATE INDEX IF NOT EXISTS idx_job_submissions_status ON public.job_submissions(status);

-- 7. AUTO-UPDATE TIMESTAMPS TRIGGER
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_candidates_updated_at
BEFORE UPDATE ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_job_submissions_updated_at
BEFORE UPDATE ON public.job_submissions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 8. AUTOMATIC PROFILE CREATION TRIGGER ON AUTH SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    assigned_role public.app_role;
    user_role_input TEXT;
    user_full_name TEXT;
    user_phone TEXT;
BEGIN
    user_role_input := lower(COALESCE(NEW.raw_user_meta_data->>'role', ''));
    user_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );
    user_phone := NEW.raw_user_meta_data->>'phone';

    -- Security safeguard: Never allow direct signup to acquire 'super_admin' role
    IF user_role_input = 'recruiter' THEN
        assigned_role := 'recruiter'::public.app_role;
    ELSE
        assigned_role := 'client'::public.app_role;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role, status, phone)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        user_full_name,
        assigned_role,
        'active'::public.account_status,
        user_phone
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Fallback safeguard: prevent trigger exception from blocking OAuth signup
    RAISE WARNING 'handle_new_user error for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. DUPLICATE SUBMISSION DETECTION TRIGGER (Warns if applied to same client within 30 days)
CREATE OR REPLACE FUNCTION public.check_duplicate_submission()
RETURNS TRIGGER AS $$
DECLARE
    prior_count INT;
BEGIN
    SELECT COUNT(*) INTO prior_count
    FROM public.job_submissions
    WHERE candidate_id = NEW.candidate_id
      AND lower(trim(company_name)) = lower(trim(NEW.company_name))
      AND submission_date >= (CURRENT_DATE - INTERVAL '30 days')
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF prior_count > 0 THEN
        NEW.duplicate_flag := true;
    ELSE
        NEW.duplicate_flag := false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_duplicate_submission
BEFORE INSERT OR UPDATE ON public.job_submissions
FOR EACH ROW EXECUTE FUNCTION public.check_duplicate_submission();

-- 10. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_submissions ENABLE ROW LEVEL SECURITY;

-- Helper to fetch current user's role
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS app_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles Policies
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Public profiles are viewable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Candidates Policies
DROP POLICY IF EXISTS "Admins and Recruiters have full candidate access" ON public.candidates;
CREATE POLICY "Admins and Recruiters have full candidate access"
ON public.candidates FOR ALL
TO authenticated
USING (
    public.get_current_role() IN ('super_admin', 'recruiter')
);

DROP POLICY IF EXISTS "Clients can only view their own candidate profile" ON public.candidates;
CREATE POLICY "Clients can only view their own candidate profile"
ON public.candidates FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
);

-- Job Submissions Policies (Excel Replacement Table)
DROP POLICY IF EXISTS "Admins and Recruiters have full submission access" ON public.job_submissions;
CREATE POLICY "Admins and Recruiters have full submission access"
ON public.job_submissions FOR ALL
TO authenticated
USING (
    public.get_current_role() IN ('super_admin', 'recruiter')
);

DROP POLICY IF EXISTS "Clients can view their own submissions" ON public.job_submissions;
CREATE POLICY "Clients can view their own submissions"
ON public.job_submissions FOR SELECT
TO authenticated
USING (
    candidate_id IN (
        SELECT id FROM public.candidates WHERE user_id = auth.uid()
    )
);

-- No demo records are seeded. Existing database records are preserved by later migrations.
