import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export async function recruitingDatabase(extra=[]) {
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
  const root=new URL('../../supabase/migrations/',import.meta.url);
  const base=await readFile(new URL('20261006_bench_marketing_schema.sql',root),'utf8');
  await db.exec(base.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',''));
  await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;');
  for(const file of ['20261008_email_confirmation_capture.sql','20261009000100_foundation.sql',...extra])await db.exec(await readFile(new URL(file,root),'utf8'));
  return db;
}
