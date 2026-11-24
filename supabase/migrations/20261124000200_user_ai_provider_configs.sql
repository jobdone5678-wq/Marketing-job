-- ==============================================================================
-- 20261124000200_user_ai_provider_configs.sql
-- Two-Table AI Provider Secret Isolation & AAD-Bound Configuration Storage
-- ==============================================================================

BEGIN;

-- 1. Create schema private if not exists
CREATE SCHEMA IF NOT EXISTS private;

-- 2. Create table public.user_ai_provider_configs
CREATE TABLE IF NOT EXISTS public.user_ai_provider_configs (
  user_id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  mode              text NOT NULL DEFAULT 'server',
  provider          text NOT NULL DEFAULT 'server',
  base_url          text DEFAULT NULL,
  model_id          text DEFAULT NULL,
  routing           text DEFAULT 'server',
  credential_source text DEFAULT 'server',
  config_version    integer NOT NULL DEFAULT 1 CHECK (config_version >= 1),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 3. Create table private.user_ai_provider_secrets
CREATE TABLE IF NOT EXISTS private.user_ai_provider_secrets (
  user_id            uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  encrypted_api_key  text NOT NULL,
  iv                 text NOT NULL,
  auth_tag           text NOT NULL,
  key_origin         text NOT NULL,
  encryption_version integer NOT NULL DEFAULT 1 CHECK (encryption_version >= 1),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- 4. Enable Row Level Security
ALTER TABLE public.user_ai_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.user_ai_provider_secrets ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for public.user_ai_provider_configs:
-- Owner (user_id = auth.uid()) can SELECT, INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS user_ai_provider_configs_select ON public.user_ai_provider_configs;
CREATE POLICY user_ai_provider_configs_select ON public.user_ai_provider_configs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_ai_provider_configs_insert ON public.user_ai_provider_configs;
CREATE POLICY user_ai_provider_configs_insert ON public.user_ai_provider_configs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_ai_provider_configs_update ON public.user_ai_provider_configs;
CREATE POLICY user_ai_provider_configs_update ON public.user_ai_provider_configs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_ai_provider_configs_delete ON public.user_ai_provider_configs;
CREATE POLICY user_ai_provider_configs_delete ON public.user_ai_provider_configs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 6. RLS Policy for private.user_ai_provider_secrets
DROP POLICY IF EXISTS user_ai_provider_secrets_service_role ON private.user_ai_provider_secrets;
CREATE POLICY user_ai_provider_secrets_service_role ON private.user_ai_provider_secrets
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 7. Permissions for public.user_ai_provider_configs
REVOKE ALL ON public.user_ai_provider_configs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_provider_configs TO authenticated;
GRANT ALL ON public.user_ai_provider_configs TO service_role;

-- 8. Permissions for private schema and private.user_ai_provider_secrets:
-- Revoke all permissions on private.user_ai_provider_secrets from roles anon and authenticated
REVOKE ALL ON SCHEMA private FROM anon, authenticated, public;
REVOKE ALL ON TABLE private.user_ai_provider_secrets FROM anon, authenticated, public;

-- Grant all permissions on schema private and table private.user_ai_provider_secrets to service_role
GRANT USAGE, CREATE ON SCHEMA private TO service_role;
GRANT ALL ON TABLE private.user_ai_provider_secrets TO service_role;

-- 9. Updated_at triggers (if handle_updated_at function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_user_ai_provider_configs_updated_at ON public.user_ai_provider_configs;
    CREATE TRIGGER trg_user_ai_provider_configs_updated_at
      BEFORE UPDATE ON public.user_ai_provider_configs
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

    DROP TRIGGER IF EXISTS trg_user_ai_provider_secrets_updated_at ON private.user_ai_provider_secrets;
    CREATE TRIGGER trg_user_ai_provider_secrets_updated_at
      BEFORE UPDATE ON private.user_ai_provider_secrets
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

COMMIT;
