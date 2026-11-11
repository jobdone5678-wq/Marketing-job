import {readFile,readdir} from 'node:fs/promises';
import {recruitingDatabase} from '../../tests/helpers/recruiting-db.mjs';

const migrations=new URL('../../supabase/migrations/',import.meta.url);
const bundle=new URL('../../supabase/recruiting-operations-update.sql',import.meta.url);
const transition=new URL('../../supabase/migrations/20261111000100_candidate_only_roles.sql',import.meta.url);

const prior=(await readdir(migrations)).filter(name=>/^20261009\d{6}_/.test(name)&&!name.includes('foundation')).sort();
const db=await recruitingDatabase(prior);
try{
  await db.exec(await readFile(bundle,'utf8'));
  console.log('bundle applied');
}catch(e){console.log('bundle FAILED: '+String(e.message).split('\n')[0]);}

try{
  await db.exec(await readFile(transition,'utf8'));
  console.log('candidate-only transition applied on top of the bundle');
}catch(e){console.log('transition FAILED: '+String(e.message).split('\n')[0]);}

const {rows}=await db.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='app_role'`);
console.log('app_role values:', rows.map(r=>r.enumlabel).join(', '));
const {rows:t2}=await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN
  ('candidate_staff_assignments','staff_employments','staff_compensation_terms','staff_salary_periods','technical_recruiter_commissions','external_payments','oauth_registration_intents')`);
console.log('staff tables remaining:', t2.length ? t2.map(r=>r.tablename).join(', ') : 'none');
const {rows:f2}=await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosrc ~ 'super_admin|technical_recruiter'`);
console.log('functions still referencing a staff role:', f2.length ? f2.map(r=>r.proname).join(', ') : 'none');
await db.close();
