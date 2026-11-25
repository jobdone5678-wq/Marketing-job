-- ==============================================================================
-- 20261125000100_freehire_profile_experience_screening.sql
-- Freehire Data Model:
--   1. public.user_profiles (search preferences, exclusions, location_preferences, derived_location)
--   2. public.profiles / public.users + Storage buckets (resumes/<userID>, photos/<userID>, resume_structured, contacts)
--   3. public.experience_employments & public.experience_evidence_atoms (append-only Experience Bank)
--   4. public.screening_answers & public.screening_answer_bank (typed screening facts + topic-keyed Q&A bank)
-- ==============================================================================

BEGIN;

-- Ensure updated_at helper exists in standalone/test environments
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 1. Search Preferences & Location (public.user_profiles)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id              uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  specializations      text[] NOT NULL
    CHECK (cardinality(specializations) BETWEEN 1 AND 10),
  skills               text[] NOT NULL
    CHECK (cardinality(skills) BETWEEN 1 AND 200),
  seniorities          text[] NOT NULL DEFAULT '{}'
    CHECK (seniorities <@ ARRAY[
      'intern', 'junior', 'middle', 'senior', 'lead', 'staff', 'principal', 'c-level'
    ]::text[]),
  excluded_skills      text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(excluded_skills) <= 200),
  excluded_sources     text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(excluded_sources) <= 200),
  excluded_companies   text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(excluded_companies) <= 200),
  location_preferences jsonb NOT NULL DEFAULT jsonb_build_object(
    'work_modes', '[]'::jsonb,
    'remote', jsonb_build_object('regions', '[]'::jsonb, 'countries', '[]'::jsonb),
    'base', jsonb_build_object('country', NULL, 'city', NULL),
    'relocation', jsonb_build_object('open', false, 'regions', '[]'::jsonb, 'countries', '[]'::jsonb, 'cities', '[]'::jsonb)
  )
    CHECK (jsonb_typeof(location_preferences) = 'object'),
  derived_location     jsonb NOT NULL DEFAULT jsonb_build_object(
    'countries', '[]'::jsonb,
    'regions', '[]'::jsonb,
    'cities', '[]'::jsonb
  )
    CHECK (jsonb_typeof(derived_location) = 'object'),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Enforce normalized lowercase skills (<= 64 chars) & strip excluded_skills present in skills
CREATE OR REPLACE FUNCTION public.normalize_user_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_skills text[];
  normalized_excluded text[];
  s text;
BEGIN
  normalized_skills := ARRAY(
    SELECT slug FROM (
      SELECT DISTINCT ON (lower(trim(x))) lower(trim(x)) AS slug, ord
      FROM unnest(COALESCE(NEW.skills, '{}'::text[])) WITH ORDINALITY AS t(x, ord)
      WHERE length(trim(x)) BETWEEN 1 AND 64
      ORDER BY lower(trim(x)), ord
    ) sub
    ORDER BY ord
  );
  IF cardinality(normalized_skills) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'skills must contain between 1 and 200 normalized slugs (max 64 chars each)';
  END IF;
  NEW.skills := normalized_skills;

  normalized_excluded := ARRAY(
    SELECT slug FROM (
      SELECT DISTINCT ON (lower(trim(x))) lower(trim(x)) AS slug, ord
      FROM unnest(COALESCE(NEW.excluded_skills, '{}'::text[])) WITH ORDINALITY AS t(x, ord)
      WHERE length(trim(x)) BETWEEN 1 AND 64
        AND NOT (lower(trim(x)) = ANY (normalized_skills))
      ORDER BY lower(trim(x)), ord
    ) sub
    ORDER BY ord
  );
  NEW.excluded_skills := normalized_excluded;

  FOREACH s IN ARRAY COALESCE(NEW.excluded_sources, '{}'::text[]) LOOP
    IF length(trim(s)) > 100 THEN
      RAISE EXCEPTION 'excluded_sources items must be at most 100 chars';
    END IF;
  END LOOP;

  FOREACH s IN ARRAY COALESCE(NEW.excluded_companies, '{}'::text[]) LOOP
    IF length(trim(s)) > 100 THEN
      RAISE EXCEPTION 'excluded_companies items must be at most 100 chars';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_normalize ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_normalize
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_user_profile_fields();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS user_profiles_insert ON public.user_profiles;
CREATE POLICY user_profiles_insert ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS user_profiles_update ON public.user_profiles;
CREATE POLICY user_profiles_update ON public.user_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS user_profiles_delete ON public.user_profiles;
CREATE POLICY user_profiles_delete ON public.user_profiles
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.user_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;

-- ==============================================================================
-- 2. Contacts, Files & Structured CV (public.profiles + public.users + storage)
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contacts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resume_object_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_uploaded_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS photo_object_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS photo_uploaded_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_structured jsonb DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_contacts_object_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_contacts_object_check
      CHECK (jsonb_typeof(contacts) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_resume_structured_object_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_resume_structured_object_check
      CHECK (resume_structured IS NULL OR jsonb_typeof(resume_structured) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_resume_object_key_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_resume_object_key_check
      CHECK (resume_object_key IS NULL OR resume_object_key = 'resumes/' || id::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_photo_object_key_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_photo_object_key_check
      CHECK (photo_object_key IS NULL OR photo_object_key = 'photos/' || id::text);
  END IF;
END $$;

-- Security-invoker view exposing users.resume_structured and file pointers cleanly
CREATE OR REPLACE VIEW public.users
WITH (security_invoker = true) AS
SELECT
  id,
  email,
  full_name,
  phone,
  role,
  status,
  contacts,
  resume_object_key,
  resume_uploaded_at,
  photo_object_key,
  photo_uploaded_at,
  resume_structured,
  created_at,
  updated_at
FROM public.profiles;

REVOKE ALL ON public.users FROM anon;
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

-- Storage buckets for raw CVs (resumes/<userID>) and headshots (photos/<userID>)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes',
  'resumes',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS user_resume_files_select ON storage.objects;
CREATE POLICY user_resume_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resumes' AND name = 'resumes/' || (SELECT auth.uid())::text);

DROP POLICY IF EXISTS user_resume_files_insert ON storage.objects;
CREATE POLICY user_resume_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND name = 'resumes/' || (SELECT auth.uid())::text);

DROP POLICY IF EXISTS user_resume_files_update ON storage.objects;
CREATE POLICY user_resume_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes' AND name = 'resumes/' || (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'resumes' AND name = 'resumes/' || (SELECT auth.uid())::text);

DROP POLICY IF EXISTS user_resume_files_delete ON storage.objects;
CREATE POLICY user_resume_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND name = 'resumes/' || (SELECT auth.uid())::text);

DROP POLICY IF EXISTS user_photo_files_select ON storage.objects;
CREATE POLICY user_photo_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'photos' AND name = 'photos/' || (SELECT auth.uid())::text);

DROP POLICY IF EXISTS user_photo_files_insert ON storage.objects;
CREATE POLICY user_photo_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos' AND name = 'photos/' || (SELECT auth.uid())::text);

DROP POLICY IF EXISTS user_photo_files_update ON storage.objects;
CREATE POLICY user_photo_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'photos' AND name = 'photos/' || (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'photos' AND name = 'photos/' || (SELECT auth.uid())::text);

DROP POLICY IF EXISTS user_photo_files_delete ON storage.objects;
CREATE POLICY user_photo_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND name = 'photos/' || (SELECT auth.uid())::text);

-- ==============================================================================
-- 3. Experience Bank (append-only employments & evidence atoms)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.experience_employments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind           text NOT NULL DEFAULT 'job'
    CHECK (kind IN ('job', 'project')),
  company        text NOT NULL
    CHECK (length(trim(company)) BETWEEN 1 AND 200),
  role           text NOT NULL
    CHECK (length(trim(role)) BETWEEN 1 AND 200),
  location       text DEFAULT NULL
    CHECK (location IS NULL OR length(location) <= 160),
  start_date     jsonb NOT NULL
    CHECK (
      jsonb_typeof(start_date) = 'object'
      AND (start_date->>'year') ~ '^\d{4}$'
      AND (
        NOT (start_date ? 'month')
        OR start_date->'month' = 'null'::jsonb
        OR ((start_date->>'month')::int BETWEEN 1 AND 12)
      )
    ),
  end_date       jsonb DEFAULT NULL
    CHECK (
      end_date IS NULL OR (
        jsonb_typeof(end_date) = 'object'
        AND (end_date->>'year') ~ '^\d{4}$'
        AND (
          NOT (end_date ? 'month')
          OR end_date->'month' = 'null'::jsonb
          OR ((end_date->>'month')::int BETWEEN 1 AND 12)
        )
      )
    ),
  is_current     boolean NOT NULL DEFAULT false,
  tech_stack     text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(tech_stack) <= 80),
  provenance     text NOT NULL DEFAULT 'manual'
    CHECK (provenance IN ('cv_import', 'stated_in_chat', 'manual', 'agent_inferred')),
  confirmed_at   timestamptz DEFAULT NULL,
  archived_at    timestamptz DEFAULT NULL,
  supersedes_id  uuid DEFAULT NULL REFERENCES public.experience_employments (id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experience_evidence_atoms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  employment_id  uuid NOT NULL REFERENCES public.experience_employments (id) ON DELETE CASCADE,
  claim          text NOT NULL
    CHECK (length(trim(claim)) BETWEEN 1 AND 1000),
  context        text NOT NULL DEFAULT ''
    CHECK (length(context) <= 1000),
  metrics        text NOT NULL DEFAULT ''
    CHECK (length(metrics) <= 500),
  skills         text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(skills) <= 80),
  provenance     text NOT NULL
    CHECK (provenance IN ('cv_import', 'stated_in_chat', 'manual', 'agent_inferred')),
  confirmed_at   timestamptz DEFAULT NULL,
  archived_at    timestamptz DEFAULT NULL,
  supersedes_id  uuid DEFAULT NULL REFERENCES public.experience_evidence_atoms (id),
  dedup_key      text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experience_employments_user_created
  ON public.experience_employments (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_experience_atoms_user_employment
  ON public.experience_evidence_atoms (user_id, employment_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_experience_atoms_provenance
  ON public.experience_evidence_atoms (user_id, provenance)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_experience_atoms_active_dedup
  ON public.experience_evidence_atoms (user_id, employment_id, dedup_key)
  WHERE archived_at IS NULL;

-- Append-only guard: forbid hard deletes and forbid mutating core factual columns.
-- Only archiving (setting archived_at) or confirming an agent_inferred row is allowed.
CREATE OR REPLACE FUNCTION public.guard_experience_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Experience bank tables are append-only; archive or supersede rows instead';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id THEN
      RAISE EXCEPTION 'Experience bank core metadata is immutable';
    END IF;

    IF TG_TABLE_NAME = 'experience_employments' THEN
      IF NEW.kind IS DISTINCT FROM OLD.kind
         OR NEW.company IS DISTINCT FROM OLD.company
         OR NEW.role IS DISTINCT FROM OLD.role
         OR NEW.location IS DISTINCT FROM OLD.location
         OR NEW.start_date IS DISTINCT FROM OLD.start_date
         OR NEW.end_date IS DISTINCT FROM OLD.end_date
         OR NEW.is_current IS DISTINCT FROM OLD.is_current
         OR NEW.tech_stack IS DISTINCT FROM OLD.tech_stack THEN
        RAISE EXCEPTION 'Experience employments are append-only; create a superseding record instead';
      END IF;
    ELSIF TG_TABLE_NAME = 'experience_evidence_atoms' THEN
      IF NEW.employment_id IS DISTINCT FROM OLD.employment_id
         OR NEW.claim IS DISTINCT FROM OLD.claim
         OR NEW.context IS DISTINCT FROM OLD.context
         OR NEW.metrics IS DISTINCT FROM OLD.metrics
         OR NEW.skills IS DISTINCT FROM OLD.skills
         OR NEW.dedup_key IS DISTINCT FROM OLD.dedup_key THEN
        RAISE EXCEPTION 'Evidence atoms are append-only; create a superseding record instead';
      END IF;
    END IF;

    IF NEW.provenance IS DISTINCT FROM OLD.provenance THEN
      IF NOT (OLD.provenance = 'agent_inferred' AND NEW.provenance = 'manual') THEN
        RAISE EXCEPTION 'Provenance can only transition from agent_inferred to manual on candidate confirmation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_experience_employments_append_only ON public.experience_employments;
CREATE TRIGGER trg_experience_employments_append_only
  BEFORE UPDATE OR DELETE ON public.experience_employments
  FOR EACH ROW EXECUTE FUNCTION public.guard_experience_append_only();

DROP TRIGGER IF EXISTS trg_experience_atoms_append_only ON public.experience_evidence_atoms;
CREATE TRIGGER trg_experience_atoms_append_only
  BEFORE UPDATE OR DELETE ON public.experience_evidence_atoms
  FOR EACH ROW EXECUTE FUNCTION public.guard_experience_append_only();

ALTER TABLE public.experience_employments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_evidence_atoms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS experience_employments_select ON public.experience_employments;
CREATE POLICY experience_employments_select ON public.experience_employments
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS experience_employments_insert ON public.experience_employments;
CREATE POLICY experience_employments_insert ON public.experience_employments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS experience_employments_update ON public.experience_employments;
CREATE POLICY experience_employments_update ON public.experience_employments
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS experience_atoms_select ON public.experience_evidence_atoms;
CREATE POLICY experience_atoms_select ON public.experience_evidence_atoms
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS experience_atoms_insert ON public.experience_evidence_atoms;
CREATE POLICY experience_atoms_insert ON public.experience_evidence_atoms
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS experience_atoms_update ON public.experience_evidence_atoms;
CREATE POLICY experience_atoms_update ON public.experience_evidence_atoms
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.experience_employments, public.experience_evidence_atoms FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.experience_employments, public.experience_evidence_atoms TO authenticated;
GRANT ALL ON public.experience_employments, public.experience_evidence_atoms TO service_role;

-- ==============================================================================
-- 4. Screening Answers & Reusable Q&A Bank
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.screening_answers (
  user_id                 uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  authorized_countries    text[] DEFAULT NULL,
  visa_sponsorship_needed boolean DEFAULT NULL,
  desired_salary_amount   numeric(14, 2) DEFAULT NULL
    CHECK (desired_salary_amount IS NULL OR desired_salary_amount > 0),
  desired_salary_currency char(3) DEFAULT NULL
    CHECK (desired_salary_currency IS NULL OR desired_salary_currency ~ '^[A-Z]{3}$'),
  desired_salary_period   text DEFAULT NULL
    CHECK (desired_salary_period IS NULL OR desired_salary_period IN ('year', 'month', 'week', 'day', 'hour')),
  notice_period_days      integer DEFAULT NULL
    CHECK (notice_period_days IS NULL OR notice_period_days >= 0),
  willing_to_relocate     boolean DEFAULT NULL,
  age_18_or_older         boolean DEFAULT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT screening_answers_salary_triple_check CHECK (
    (desired_salary_amount IS NULL AND desired_salary_currency IS NULL AND desired_salary_period IS NULL)
    OR
    (desired_salary_amount IS NOT NULL AND desired_salary_currency IS NOT NULL AND desired_salary_period IS NOT NULL)
  )
);

DROP TRIGGER IF EXISTS trg_screening_answers_updated_at ON public.screening_answers;
CREATE TRIGGER trg_screening_answers_updated_at
  BEFORE UPDATE ON public.screening_answers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.screening_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS screening_answers_select ON public.screening_answers;
CREATE POLICY screening_answers_select ON public.screening_answers
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS screening_answers_insert ON public.screening_answers;
CREATE POLICY screening_answers_insert ON public.screening_answers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS screening_answers_update ON public.screening_answers;
CREATE POLICY screening_answers_update ON public.screening_answers
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS screening_answers_delete ON public.screening_answers;
CREATE POLICY screening_answers_delete ON public.screening_answers
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.screening_answers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screening_answers TO authenticated;
GRANT ALL ON public.screening_answers TO service_role;

CREATE TABLE IF NOT EXISTS public.screening_answer_bank (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  topic        text NOT NULL
    CHECK (length(trim(topic)) BETWEEN 1 AND 500),
  question     text NOT NULL
    CHECK (length(trim(question)) BETWEEN 1 AND 3000),
  answer       text NOT NULL
    CHECK (char_length(answer) BETWEEN 1 AND 2000),
  provenance   text NOT NULL DEFAULT 'candidate'
    CHECK (provenance IN ('candidate', 'agent_inferred')),
  confirmed_at timestamptz DEFAULT NULL,
  use_count    integer NOT NULL DEFAULT 1 CHECK (use_count >= 0),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_screening_answer_bank_user_topic UNIQUE (user_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_screening_answer_bank_user_updated
  ON public.screening_answer_bank (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_screening_answer_bank_user_provenance
  ON public.screening_answer_bank (user_id, provenance);

DROP TRIGGER IF EXISTS trg_screening_answer_bank_updated_at ON public.screening_answer_bank;
CREATE TRIGGER trg_screening_answer_bank_updated_at
  BEFORE UPDATE ON public.screening_answer_bank
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.screening_answer_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS screening_answer_bank_select ON public.screening_answer_bank;
CREATE POLICY screening_answer_bank_select ON public.screening_answer_bank
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS screening_answer_bank_insert ON public.screening_answer_bank;
CREATE POLICY screening_answer_bank_insert ON public.screening_answer_bank
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS screening_answer_bank_update ON public.screening_answer_bank;
CREATE POLICY screening_answer_bank_update ON public.screening_answer_bank
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS screening_answer_bank_delete ON public.screening_answer_bank;
CREATE POLICY screening_answer_bank_delete ON public.screening_answer_bank
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.screening_answer_bank FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screening_answer_bank TO authenticated;
GRANT ALL ON public.screening_answer_bank TO service_role;

COMMIT;
