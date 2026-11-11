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
for(const name of files){
  const sql=await readFile(new URL(name,root),'utf8');
  try{await db.exec(sql.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',''));}
  catch(e){console.log('FAIL '+name+' :: '+String(e.message).split('\n')[0]);}
}

const {rows:enumRows}=await db.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='app_role'`);
console.log('app_role values:', enumRows.map(r=>r.enumlabel).join(', '));

const {rows:tables}=await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN
  ('candidate_staff_assignments','staff_employments','staff_compensation_terms','staff_salary_periods','technical_recruiter_commissions','external_payments','oauth_registration_intents','job_briefs','jd_shortlists','earning_payment_balances','vendors','vendor_contacts','workspace_settings','placements','service_enrollments','outside_jobs','candidates','job_submissions') ORDER BY 1`);
console.log('\nTables present:', tables.map(r=>r.tablename).join(', '));

const {rows:cols}=await db.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
  AND column_name IN ('role','assigned_recruiter_id','assigned_technical_recruiter_id','recruiter_id','technical_recruiter_id','commission_amount','brief_id','assignment_role')
  ORDER BY table_name,column_name`);
console.log('\nRole-related columns remaining:');
for(const c of cols) console.log(`  ${c.table_name}.${c.column_name}`);

const {rows:pols}=await db.query(`SELECT tablename,policyname,qual FROM pg_policies WHERE schemaname='public' AND qual LIKE '%role%' ORDER BY 1,2`);
console.log('\nPolicies still mentioning a role:');
for(const p of pols) console.log(`  ${p.tablename}.${p.policyname}`);

const {rows:src}=await db.query(`SELECT p.proname, pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE '%role%' OR p.proname LIKE '%staff%' OR p.proname LIKE '%recruiter%' OR p.proname LIKE '%admin%')`);
console.log('\nStaff/role-named functions still present:');
for(const s of src) console.log(`  ${s.proname}`);

const {rows:defs}=await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_language l ON l.oid=p.prolang
  WHERE n.nspname='public' AND l.lanname='plpgsql' AND p.prosrc ~ 'super_admin|technical_recruiter'`);
console.log('\nFunctions still referencing a staff role literal:');
for(const d of defs) console.log(`  ${d.proname}`);

await db.close();
