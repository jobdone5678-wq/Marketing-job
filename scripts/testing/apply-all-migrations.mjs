import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';

const root=new URL('../../supabase/migrations/',import.meta.url);
const files=(await readdir(root)).filter(n=>n.endsWith('.sql')).sort();
const db=new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION public.digest(text,text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT convert_to(md5($1),'utf8') $$;`);
let failed=0;
for(const name of files){
  const sql=await readFile(new URL(name,root),'utf8');
  try{await db.exec(sql.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',''));console.log('ok  '+name);}
  catch(e){failed++;console.log('FAIL '+name+' :: '+String(e.message).split('\n')[0]);}
}
console.log(failed?`\n${failed} file(s) failed`:'\nall migrations applied');
await db.close();
