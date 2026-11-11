import {readFile,readdir} from 'node:fs/promises';
import {recruitingDatabase} from '../../tests/helpers/recruiting-db.mjs';

const migrations=new URL('../../supabase/migrations/',import.meta.url);
const bundle=new URL('../../supabase/recruiting-operations-update.sql',import.meta.url);

const prior=(await readdir(migrations)).filter(name=>/^20261009\d{6}_/.test(name)&&!name.includes('foundation')).sort();
const db=await recruitingDatabase(prior);
await db.exec(await readFile(bundle,'utf8'));

const {rows}=await db.query(`
  SELECT table_name, string_agg(column_name, ', ' ORDER BY column_name) AS cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name IN ('jobs','job_submissions','candidates','profiles')
  GROUP BY table_name ORDER BY table_name`);
for(const r of rows) console.log(`\n${r.table_name}:\n  ${r.cols}`);

const {rows:fn}=await db.query(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('record_extension_submission','candidate_actor_can_access','save_candidate_profile','workspace_metrics','save_recruiting_artifact','create_application_intent','record_browser_event')`);
console.log('\nfunctions:');
for(const r of fn) console.log(`  ${r.proname}(${r.args})`);
await db.close();
