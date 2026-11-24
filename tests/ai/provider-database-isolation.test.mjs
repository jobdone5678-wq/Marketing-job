import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = readFileSync(
  new URL('../../supabase/migrations/20261124000200_user_ai_provider_configs.sql', import.meta.url),
  'utf8'
);

const USER_A = '11111111-1111-4000-8000-111111111111';
const USER_B = '22222222-2222-4000-8000-222222222222';

async function createDbFixture() {
  const db = new PGlite();

  // Initialize Supabase foundation roles and auth schema
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email text,
      created_at timestamptz DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    CREATE OR REPLACE FUNCTION public.handle_updated_at()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Insert test users
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'user-a@example.com')`, [USER_A]);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'user-b@example.com')`, [USER_B]);

  // Execute migration
  await db.exec(migrationSql);

  return db;
}

test('two-table AI provider secret isolation & database migration', async (t) => {
  const db = await createDbFixture();
  t.after(async () => {
    await db.close();
  });

  await t.test('private.user_ai_provider_secrets: permission denied for anon and authenticated roles', async () => {
    // 1. Role 'anon' cannot access private schema / table
    await assert.rejects(
      async () => {
        await db.exec(`
          SET ROLE anon;
          SELECT * FROM private.user_ai_provider_secrets;
        `);
      },
      /permission denied/i,
      'anon role must be blocked from private.user_ai_provider_secrets'
    );

    // Reset role back to postgres/superuser
    await db.exec(`RESET ROLE;`);

    // 2. Role 'authenticated' cannot access private schema / table
    await assert.rejects(
      async () => {
        await db.exec(`
          SET ROLE authenticated;
          SELECT * FROM private.user_ai_provider_secrets;
        `);
      },
      /permission denied/i,
      'authenticated role must be blocked from private.user_ai_provider_secrets'
    );

    await db.exec(`RESET ROLE;`);

    // 3. Role 'authenticated' cannot insert into private table
    await assert.rejects(
      async () => {
        await db.exec(`
          SET ROLE authenticated;
          INSERT INTO private.user_ai_provider_secrets (user_id, encrypted_api_key, iv, auth_tag, key_origin)
          VALUES ('${USER_A}', 'enc', 'iv', 'tag', 'https://api.openai.com/v1');
        `);
      },
      /permission denied/i,
      'authenticated role cannot insert into private.user_ai_provider_secrets'
    );

    await db.exec(`RESET ROLE;`);
  });

  await t.test('private.user_ai_provider_secrets: service_role has full access', async () => {
    await db.exec(`SET ROLE service_role;`);

    await db.query(`
      INSERT INTO private.user_ai_provider_secrets (
        user_id, encrypted_api_key, iv, auth_tag, key_origin
      ) VALUES ($1, $2, $3, $4, $5);
    `, [USER_A, 'encrypted-hex-payload', 'iv-hex-12b', 'tag-hex-16b', 'https://api.openai.com/v1']);

    const res = await db.query(`
      SELECT * FROM private.user_ai_provider_secrets WHERE user_id = $1;
    `, [USER_A]);

    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].encrypted_api_key, 'encrypted-hex-payload');
    assert.equal(res.rows[0].encryption_version, 1); // defaults to 1

    await db.exec(`RESET ROLE;`);
  });

  await t.test('public.user_ai_provider_configs: anon cannot access', async () => {
    await assert.rejects(
      async () => {
        await db.exec(`
          SET ROLE anon;
          SELECT * FROM public.user_ai_provider_configs;
        `);
      },
      /permission denied/i,
      'anon role cannot select from public.user_ai_provider_configs'
    );

    await db.exec(`RESET ROLE;`);
  });

  await t.test('public.user_ai_provider_configs: RLS enforces user isolation for authenticated users', async () => {
    // Authenticated user A inserts config
    await db.exec(`
      SET ROLE authenticated;
      SET "request.jwt.claim.sub" = '${USER_A}';
    `);

    await db.query(`
      INSERT INTO public.user_ai_provider_configs (
        user_id, mode, provider, base_url, model_id, routing, credential_source
      ) VALUES ($1, 'portal_byok', 'openrouter', 'https://openrouter.ai/api/v1', 'deepseek/deepseek-chat', 'proxy', 'portal');
    `, [USER_A]);

    // User A can read their own config
    const resA = await db.query(`SELECT * FROM public.user_ai_provider_configs WHERE user_id = $1;`, [USER_A]);
    assert.equal(resA.rows.length, 1);
    assert.equal(resA.rows[0].config_version, 1);
    assert.equal(resA.rows[0].provider, 'openrouter');

    // User B attempts to read User A's config -> RLS filters to 0 rows
    await db.exec(`SET "request.jwt.claim.sub" = '${USER_B}';`);
    const resB = await db.query(`SELECT * FROM public.user_ai_provider_configs WHERE user_id = $1;`, [USER_A]);
    assert.equal(resB.rows.length, 0, 'User B must not see User A config');

    // User B attempts to update User A's config -> 0 rows updated
    const updateRes = await db.query(
      `UPDATE public.user_ai_provider_configs SET model_id = 'hacked' WHERE user_id = $1 RETURNING *;`,
      [USER_A]
    );
    assert.equal(updateRes.rows.length, 0, 'User B must not be able to update User A config');

    // User B attempts to delete User A's config -> 0 rows deleted
    const deleteRes = await db.query(
      `DELETE FROM public.user_ai_provider_configs WHERE user_id = $1 RETURNING *;`,
      [USER_A]
    );
    assert.equal(deleteRes.rows.length, 0, 'User B must not be able to delete User A config');

    // Switch back to User A to update
    await db.exec(`SET "request.jwt.claim.sub" = '${USER_A}';`);
    const updateOwnRes = await db.query(
      `UPDATE public.user_ai_provider_configs SET config_version = config_version + 1 WHERE user_id = $1 RETURNING *;`,
      [USER_A]
    );
    assert.equal(updateOwnRes.rows.length, 1);
    assert.equal(updateOwnRes.rows[0].config_version, 2);

    await db.exec(`RESET ROLE;`);
  });

  await t.test('cascade deletion when user is deleted from auth.users', async () => {
    // Delete user A
    await db.query(`DELETE FROM auth.users WHERE id = $1;`, [USER_A]);

    const secretRes = await db.query(`SELECT * FROM private.user_ai_provider_secrets WHERE user_id = $1;`, [USER_A]);
    assert.equal(secretRes.rows.length, 0, 'Secret must cascade delete');

    const configRes = await db.query(`SELECT * FROM public.user_ai_provider_configs WHERE user_id = $1;`, [USER_A]);
    assert.equal(configRes.rows.length, 0, 'Config must cascade delete');
  });
});
