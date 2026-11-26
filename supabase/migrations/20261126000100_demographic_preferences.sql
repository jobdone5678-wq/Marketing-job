-- ==============================================================================
-- 20261126000100_demographic_preferences.sql
-- Candidate-configured demographic & EEO autofill preferences.
-- Stored per user in Supabase with strict owner-only RLS so the dashboard
-- profile page persists selections and the extension autofills job portals.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.demographic_preferences (
  user_id     uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT false,
  answers     jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(answers) = 'object'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_demographic_preferences_updated_at ON public.demographic_preferences;
CREATE TRIGGER trg_demographic_preferences_updated_at
  BEFORE UPDATE ON public.demographic_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.demographic_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demographic_preferences_select ON public.demographic_preferences;
CREATE POLICY demographic_preferences_select ON public.demographic_preferences
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS demographic_preferences_insert ON public.demographic_preferences;
CREATE POLICY demographic_preferences_insert ON public.demographic_preferences
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS demographic_preferences_update ON public.demographic_preferences;
CREATE POLICY demographic_preferences_update ON public.demographic_preferences
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS demographic_preferences_delete ON public.demographic_preferences;
CREATE POLICY demographic_preferences_delete ON public.demographic_preferences
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.demographic_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demographic_preferences TO authenticated;
GRANT ALL ON public.demographic_preferences TO service_role;

COMMIT;
