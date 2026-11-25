-- ==============================================================================
-- 20261125000300_align_freehire_1to1_schema.sql
-- 1:1 Schema Alignment with strelov1/freehire (adapted for Supabase auth.users UUID)
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. public.user_profiles (0001, 0010, 0039, 0123, 0135, 0167, 0224, 0237, 0238)
-- ==============================================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS job_languages text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_job_languages_cap,
  ADD CONSTRAINT user_profiles_job_languages_cap CHECK (cardinality(job_languages) <= 200);

-- Relax specializations & skills minimum cardinality for progressive autosave (0224)
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_specializations_check,
  DROP CONSTRAINT IF EXISTS user_profiles_specializations_card_chk,
  DROP CONSTRAINT IF EXISTS search_profiles_skills_check,
  DROP CONSTRAINT IF EXISTS user_profiles_skills_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_specializations_card_chk CHECK (cardinality(specializations) <= 10),
  ADD CONSTRAINT user_profiles_skills_cap_chk CHECK (cardinality(skills) <= 200);

-- Migrate 'c-level' -> 'c_level' and pin vocab.SeniorityValues (0123)
UPDATE public.user_profiles
SET seniorities = ARRAY(
  SELECT CASE WHEN x = 'c-level' THEN 'c_level' ELSE x END
  FROM unnest(seniorities) AS t(x)
)
WHERE 'c-level' = ANY(seniorities);

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_seniorities_check,
  ADD CONSTRAINT user_profiles_seniorities_check CHECK (
    seniorities <@ ARRAY[
      'intern', 'junior', 'middle', 'senior', 'lead', 'staff', 'principal', 'c_level'
    ]::text[]
  );

-- Allow NULL for empty location_preferences (0010)
ALTER TABLE public.user_profiles
  ALTER COLUMN location_preferences DROP NOT NULL,
  ALTER COLUMN location_preferences SET DEFAULT NULL;

-- Backfill location_preferences region aliases ('europe'->'eu', 'worldwide'->'global') & lowercase countries
UPDATE public.user_profiles
SET location_preferences = jsonb_strip_nulls(jsonb_build_object(
  'work_modes', COALESCE(location_preferences->'work_modes', '[]'::jsonb),
  'remote', jsonb_build_object(
    'regions', COALESCE((
      SELECT jsonb_agg(CASE WHEN r = 'europe' THEN 'eu' WHEN r = 'worldwide' THEN 'global' ELSE r END)
      FROM jsonb_array_elements_text(COALESCE(location_preferences->'remote'->'regions', '[]'::jsonb)) AS t(r)
    ), '[]'::jsonb),
    'countries', COALESCE((
      SELECT jsonb_agg(lower(c))
      FROM jsonb_array_elements_text(COALESCE(location_preferences->'remote'->'countries', '[]'::jsonb)) AS t(c)
    ), '[]'::jsonb)
  ),
  'base', jsonb_build_object(
    'country', NULLIF(lower(COALESCE(location_preferences->'base'->>'country', '')), ''),
    'city', NULLIF(btrim(COALESCE(location_preferences->'base'->>'city', '')), '')
  ),
  'relocation', jsonb_build_object(
    'open', COALESCE((location_preferences->'relocation'->>'open')::boolean, false),
    'regions', COALESCE((
      SELECT jsonb_agg(CASE WHEN r = 'europe' THEN 'eu' WHEN r = 'worldwide' THEN 'global' ELSE r END)
      FROM jsonb_array_elements_text(COALESCE(location_preferences->'relocation'->'regions', '[]'::jsonb)) AS t(r)
    ), '[]'::jsonb),
    'countries', COALESCE((
      SELECT jsonb_agg(lower(c))
      FROM jsonb_array_elements_text(COALESCE(location_preferences->'relocation'->'countries', '[]'::jsonb)) AS t(c)
    ), '[]'::jsonb),
    'cities', COALESCE(location_preferences->'relocation'->'cities', '[]'::jsonb)
  )
))
WHERE location_preferences IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_user_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_skills text[];
  normalized_excluded text[];
  normalized_seniorities text[];
  normalized_langs text[];
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
  IF cardinality(normalized_skills) > 200 THEN
    RAISE EXCEPTION 'skills must contain at most 200 slugs (max 64 chars each)';
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

  normalized_seniorities := ARRAY(
    SELECT lvl FROM (
      SELECT DISTINCT ON (val) val AS lvl, ord
      FROM (
        SELECT CASE WHEN lower(trim(x)) = 'c-level' THEN 'c_level' ELSE lower(trim(x)) END AS val, ord
        FROM unnest(COALESCE(NEW.seniorities, '{}'::text[])) WITH ORDINALITY AS t(x, ord)
        WHERE trim(x) <> ''
      ) mapped
      ORDER BY val, ord
    ) sub
    ORDER BY ord
  );
  NEW.seniorities := normalized_seniorities;

  normalized_langs := ARRAY(
    SELECT code FROM (
      SELECT DISTINCT ON (lower(trim(x))) lower(trim(x)) AS code, ord
      FROM unnest(COALESCE(NEW.job_languages, '{}'::text[])) WITH ORDINALITY AS t(x, ord)
      WHERE trim(x) ~ '^[A-Za-z]{2}$'
      ORDER BY lower(trim(x)), ord
    ) sub
    ORDER BY ord
  );
  IF cardinality(normalized_langs) > 200 THEN
    RAISE EXCEPTION 'job_languages must contain at most 200 two-letter language codes';
  END IF;
  NEW.job_languages := normalized_langs;

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

-- ==============================================================================
-- 2. public.profiles & public.users view (0001, 0011, 0059, 0068, 0079)
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS candidate_contacts jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_ats_analysis jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_structured_model text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_structured_uploaded_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_countries text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_regions text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_cities text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_extract_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_extract_detail text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resume_extract_for timestamptz DEFAULT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_candidate_contacts_object_check,
  ADD CONSTRAINT profiles_candidate_contacts_object_check
    CHECK (candidate_contacts IS NULL OR jsonb_typeof(candidate_contacts) = 'object');

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_resume_extract_status_check,
  ADD CONSTRAINT profiles_resume_extract_status_check
    CHECK (resume_extract_status IS NULL OR resume_extract_status IN ('pending', 'ok', 'failed'));

-- Backfill candidate_contacts from existing contacts column
UPDATE public.profiles
SET candidate_contacts = NULLIF(contacts, '{}'::jsonb)
WHERE candidate_contacts IS NULL
  AND contacts IS NOT NULL
  AND contacts <> '{}'::jsonb;

-- Backfill extract status & timestamps
UPDATE public.profiles
SET resume_structured_uploaded_at = COALESCE(resume_structured_uploaded_at, resume_uploaded_at),
    resume_extract_for = COALESCE(resume_extract_for, resume_uploaded_at),
    resume_extract_status = COALESCE(resume_extract_status, 'ok')
WHERE resume_structured IS NOT NULL;

-- Backfill derived resume geography from user_profiles.derived_location
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'derived_location'
  ) THEN
    UPDATE public.profiles p
    SET
      resume_countries = CASE
        WHEN p.resume_countries IS NULL AND jsonb_array_length(COALESCE(up.derived_location->'countries', '[]'::jsonb)) > 0
          THEN ARRAY(SELECT lower(x) FROM jsonb_array_elements_text(up.derived_location->'countries') AS t(x))
        ELSE p.resume_countries
      END,
      resume_regions = CASE
        WHEN p.resume_regions IS NULL AND jsonb_array_length(COALESCE(up.derived_location->'regions', '[]'::jsonb)) > 0
          THEN ARRAY(
            SELECT CASE WHEN x = 'europe' THEN 'eu' WHEN x = 'worldwide' THEN 'global' ELSE x END
            FROM jsonb_array_elements_text(up.derived_location->'regions') AS t(x)
          )
        ELSE p.resume_regions
      END,
      resume_cities = CASE
        WHEN p.resume_cities IS NULL AND jsonb_array_length(COALESCE(up.derived_location->'cities', '[]'::jsonb)) > 0
          THEN ARRAY(SELECT x FROM jsonb_array_elements_text(up.derived_location->'cities') AS t(x))
        ELSE p.resume_cities
      END
    FROM public.user_profiles up
    WHERE up.user_id = p.id;
  END IF;
END $$;

ALTER TABLE public.user_profiles
  DROP COLUMN IF EXISTS derived_location;

-- Align photo storage bucket max file size with Freehire 8 MiB
UPDATE storage.buckets
SET file_size_limit = 8388608
WHERE id = 'photos';

DROP VIEW IF EXISTS public.users;
CREATE VIEW public.users
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
  updated_at,
  candidate_contacts,
  resume_ats_analysis,
  resume_structured_model,
  resume_structured_uploaded_at,
  resume_countries,
  resume_regions,
  resume_cities,
  resume_extract_status,
  resume_extract_detail,
  resume_extract_for
FROM public.profiles;

REVOKE ALL ON public.users FROM anon;
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

-- ==============================================================================
-- 3. Experience Bank: public.experience_employments & public.experience_atoms
--    (0047, 0078, 0135, 0317)
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_experience_employments_append_only ON public.experience_employments;
DROP TRIGGER IF EXISTS trg_experience_atoms_append_only ON public.experience_evidence_atoms;

ALTER TABLE public.experience_employments
  ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stack text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS period_start_year integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS period_start_month smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS period_end_year integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS period_end_month smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill structured dates and stack from legacy start_date/end_date/tech_stack
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'experience_employments' AND column_name = 'start_date'
  ) THEN
    UPDATE public.experience_employments
    SET
      period_start_year = COALESCE(period_start_year, NULLIF(start_date->>'year', '')::integer),
      period_start_month = COALESCE(period_start_month, NULLIF(start_date->>'month', '')::smallint),
      period_end_year = COALESCE(period_end_year, NULLIF(end_date->>'year', '')::integer),
      period_end_month = COALESCE(period_end_month, NULLIF(end_date->>'month', '')::smallint),
      location = COALESCE(location, '');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'experience_employments' AND column_name = 'tech_stack'
  ) THEN
    UPDATE public.experience_employments
    SET stack = tech_stack
    WHERE cardinality(stack) = 0 AND cardinality(tech_stack) > 0;
  END IF;
END $$;

ALTER TABLE public.experience_employments
  ALTER COLUMN location SET DEFAULT '',
  ALTER COLUMN location SET NOT NULL;

ALTER TABLE public.experience_employments
  DROP COLUMN IF EXISTS start_date,
  DROP COLUMN IF EXISTS end_date,
  DROP COLUMN IF EXISTS tech_stack,
  DROP COLUMN IF EXISTS provenance,
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS supersedes_id;

ALTER TABLE public.experience_employments
  DROP CONSTRAINT IF EXISTS experience_employments_company_check,
  DROP CONSTRAINT IF EXISTS experience_employments_role_check,
  DROP CONSTRAINT IF EXISTS experience_employments_location_check,
  DROP CONSTRAINT IF EXISTS experience_employments_tech_stack_check,
  DROP CONSTRAINT IF EXISTS experience_employments_provenance_check,
  DROP CONSTRAINT IF EXISTS experience_employments_company_or_role_check,
  DROP CONSTRAINT IF EXISTS experience_employments_period_start_year_check,
  DROP CONSTRAINT IF EXISTS experience_employments_period_end_year_check,
  DROP CONSTRAINT IF EXISTS experience_employments_period_start_month_check,
  DROP CONSTRAINT IF EXISTS experience_employments_period_end_month_check,
  DROP CONSTRAINT IF EXISTS experience_employments_period_start_month_needs_year_check,
  DROP CONSTRAINT IF EXISTS experience_employments_period_end_month_needs_year_check,
  DROP CONSTRAINT IF EXISTS experience_employments_stack_cap_check,
  ADD CONSTRAINT experience_employments_period_start_year_check
    CHECK (period_start_year IS NULL OR period_start_year BETWEEN 1900 AND 2100),
  ADD CONSTRAINT experience_employments_period_end_year_check
    CHECK (period_end_year IS NULL OR period_end_year BETWEEN 1900 AND 2100),
  ADD CONSTRAINT experience_employments_period_start_month_check
    CHECK (period_start_month IS NULL OR period_start_month BETWEEN 1 AND 12),
  ADD CONSTRAINT experience_employments_period_end_month_check
    CHECK (period_end_month IS NULL OR period_end_month BETWEEN 1 AND 12),
  ADD CONSTRAINT experience_employments_period_start_month_needs_year_check
    CHECK (period_start_month IS NULL OR period_start_year IS NOT NULL),
  ADD CONSTRAINT experience_employments_period_end_month_needs_year_check
    CHECK (period_end_month IS NULL OR period_end_year IS NOT NULL),
  ADD CONSTRAINT experience_employments_stack_cap_check
    CHECK (cardinality(stack) <= 80);

DROP INDEX IF EXISTS public.idx_experience_employments_user_created;
CREATE INDEX IF NOT EXISTS experience_employments_user_idx
  ON public.experience_employments (
    user_id,
    is_current DESC,
    period_start_year DESC NULLS LAST,
    period_start_month DESC NULLS LAST
  );

DROP TRIGGER IF EXISTS trg_experience_employments_updated_at ON public.experience_employments;
CREATE TRIGGER trg_experience_employments_updated_at
  BEFORE UPDATE ON public.experience_employments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP POLICY IF EXISTS experience_employments_delete ON public.experience_employments;
CREATE POLICY experience_employments_delete ON public.experience_employments
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

GRANT DELETE ON public.experience_employments TO authenticated;

-- Create Freehire's exact public.experience_atoms table (nullable employment_id, metrics text[], claim_key, source_ref)
CREATE TABLE IF NOT EXISTS public.experience_atoms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  employment_id uuid DEFAULT NULL REFERENCES public.experience_employments (id) ON DELETE CASCADE,
  claim         text NOT NULL CHECK (length(trim(claim)) BETWEEN 1 AND 400),
  claim_key     text NOT NULL,
  context       text NOT NULL DEFAULT '' CHECK (length(context) <= 1200),
  metrics       text[] NOT NULL DEFAULT '{}'::text[],
  skills        text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(skills) <= 40),
  provenance    text NOT NULL CHECK (provenance IN ('cv_import', 'stated_in_chat', 'manual', 'agent_inferred')),
  source_ref    text NOT NULL DEFAULT '' CHECK (length(source_ref) <= 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS experience_atoms_user_claim_key
  ON public.experience_atoms (user_id, claim_key);

CREATE INDEX IF NOT EXISTS experience_atoms_user_employment_idx
  ON public.experience_atoms (user_id, employment_id);

DROP TRIGGER IF EXISTS trg_experience_atoms_updated_at ON public.experience_atoms;
CREATE TRIGGER trg_experience_atoms_updated_at
  BEFORE UPDATE ON public.experience_atoms
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.experience_atoms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS experience_atoms_select ON public.experience_atoms;
CREATE POLICY experience_atoms_select ON public.experience_atoms
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS experience_atoms_insert ON public.experience_atoms;
CREATE POLICY experience_atoms_insert ON public.experience_atoms
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS experience_atoms_update ON public.experience_atoms;
CREATE POLICY experience_atoms_update ON public.experience_atoms
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS experience_atoms_delete ON public.experience_atoms;
CREATE POLICY experience_atoms_delete ON public.experience_atoms
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.experience_atoms FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experience_atoms TO authenticated;
GRANT ALL ON public.experience_atoms TO service_role;

-- Backfill any existing atoms from experience_evidence_atoms
DO $$
BEGIN
  IF to_regclass('public.experience_evidence_atoms') IS NOT NULL THEN
    INSERT INTO public.experience_atoms (
      id, user_id, employment_id, claim, claim_key, context, metrics, skills, provenance, source_ref, created_at, updated_at
    )
    SELECT
      id,
      user_id,
      employment_id,
      left(claim, 400),
      dedup_key,
      left(COALESCE(context, ''), 1200),
      CASE
        WHEN COALESCE(trim(metrics), '') = '' THEN '{}'::text[]
        ELSE regexp_split_to_array(trim(metrics), '\s*,\s*')
      END,
      (COALESCE(skills, '{}'::text[]))[1:40],
      provenance,
      '',
      created_at,
      now()
    FROM public.experience_evidence_atoms
    WHERE archived_at IS NULL
    ON CONFLICT (user_id, claim_key) DO NOTHING;

    DROP TABLE public.experience_evidence_atoms;
  END IF;
END $$;

-- ==============================================================================
-- 4. Screening Answers & Reusable Q&A Bank (0092, 0155, 0197)
-- ==============================================================================

ALTER TABLE public.screening_answers
  ADD COLUMN IF NOT EXISTS privacy_consent boolean DEFAULT NULL;

-- Lowercase authorized_countries (e.g. 'US' -> 'us')
UPDATE public.screening_answers
SET authorized_countries = ARRAY(SELECT lower(c) FROM unnest(authorized_countries) AS t(c))
WHERE authorized_countries IS NOT NULL;

ALTER TABLE public.screening_answers
  DROP CONSTRAINT IF EXISTS screening_answers_salary_triple_check,
  DROP CONSTRAINT IF EXISTS screening_answers_desired_salary_period_check,
  ADD CONSTRAINT screening_answers_desired_salary_period_check
    CHECK (desired_salary_period IS NULL OR desired_salary_period IN ('year', 'month', 'day', 'hour'));

ALTER TABLE public.screening_answers
  ALTER COLUMN desired_salary_amount TYPE integer USING ROUND(desired_salary_amount)::integer,
  ALTER COLUMN desired_salary_currency TYPE text;

ALTER TABLE public.screening_answer_bank
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS use_count,
  DROP COLUMN IF EXISTS last_used_at;

COMMIT;
