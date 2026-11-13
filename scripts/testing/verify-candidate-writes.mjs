import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';

// Verifies the candidate write repair against a minimal schema.
//
// The live database carries a trigger on public.candidates that raises
// "COALESCE types text and jsonb cannot be matched" on every write, so no
// candidate profile can be created or edited. This reproduces the defect,
// applies the repair migration, and checks that a profile can be saved.

const repairUrl=new URL('../../supabase/migrations/20261113000100_repair_candidate_writes.sql',import.meta.url);
const db=new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE TABLE public.profiles(id uuid PRIMARY KEY,email text,full_name text,role text,status text);
  CREATE TABLE public.audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid,action text,subject_id uuid,created_at timestamptz DEFAULT now(),metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
  CREATE TABLE public.candidate_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid,candidate_id uuid,candidate_version integer,object_path text UNIQUE,filename text,content_hash text,consent_at timestamptz,status text DEFAULT 'queued',task_id uuid,error text,created_at timestamptz DEFAULT now());
  CREATE TABLE public.resume_extractions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid UNIQUE,data jsonb NOT NULL,model text NOT NULL,prompt_version text NOT NULL,created_at timestamptz DEFAULT now());
  CREATE TABLE public.candidates(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    full_name text NOT NULL, phone text, email text, linkedin_url text, current_city text, current_state text,
    full_address text, visa_status text, authorized_in_usa boolean, need_sponsorship_now boolean,
    need_sponsorship_future boolean, current_employer text, current_job_title text, employment_status text,
    total_experience_years text, relevant_experience_years text, notice_period text, available_to_join text,
    interview_availability text, open_to_relocation boolean, preferred_work_type text, preferred_locations text,
    current_salary text, expected_salary text, employment_types text[], highest_qualification text,
    university_name text, graduation_year text, target_job_titles text, primary_skills text, secondary_skills text,
    certifications text, resume_url text, is_active_bench boolean NOT NULL DEFAULT false, notes text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1, provenance_status text NOT NULL DEFAULT 'legacy_unconfirmed',
    confirmed_facts jsonb NOT NULL DEFAULT '{}'::jsonb, employment_history jsonb NOT NULL DEFAULT '[]'::jsonb,
    education_history jsonb NOT NULL DEFAULT '[]'::jsonb, evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_by uuid REFERENCES public.profiles(id));

  CREATE OR REPLACE FUNCTION public.save_candidate_profile(p_actor uuid,p_id uuid,p_expected integer,p_fields jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DECLARE actor public.profiles; prior public.candidates; incoming public.candidates; result uuid;
  BEGIN
    SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'Active account required'; END IF;
    SELECT * INTO incoming FROM jsonb_populate_record(NULL::public.candidates,p_fields);
    IF incoming.full_name IS NULL OR length(trim(incoming.full_name)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Full name is required'; END IF;
    IF p_id IS NOT NULL THEN
      SELECT * INTO prior FROM public.candidates WHERE id=p_id FOR UPDATE;
      IF NOT FOUND OR prior.user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
      IF p_expected IS DISTINCT FROM prior.version THEN RAISE EXCEPTION 'Profile changed; reload before saving'; END IF;
      result:=p_id;
    ELSE
      IF EXISTS(SELECT 1 FROM public.candidates WHERE user_id=p_actor) THEN RAISE EXCEPTION 'Your profile already exists; edit it instead'; END IF;
      INSERT INTO public.candidates(full_name,user_id,created_by) VALUES(trim(incoming.full_name),p_actor,p_actor) RETURNING id INTO result;
    END IF;
    UPDATE public.candidates SET full_name=trim(incoming.full_name),email=incoming.email,phone=incoming.phone,linkedin_url=incoming.linkedin_url,
      current_city=incoming.current_city,current_state=incoming.current_state,full_address=incoming.full_address,visa_status=incoming.visa_status,
      authorized_in_usa=incoming.authorized_in_usa,need_sponsorship_now=incoming.need_sponsorship_now,need_sponsorship_future=incoming.need_sponsorship_future,
      current_employer=incoming.current_employer,current_job_title=incoming.current_job_title,employment_status=incoming.employment_status,
      total_experience_years=incoming.total_experience_years,relevant_experience_years=incoming.relevant_experience_years,
      notice_period=incoming.notice_period,available_to_join=incoming.available_to_join,interview_availability=incoming.interview_availability,
      open_to_relocation=incoming.open_to_relocation,preferred_work_type=incoming.preferred_work_type,preferred_locations=incoming.preferred_locations,
      current_salary=incoming.current_salary,expected_salary=incoming.expected_salary,employment_types=incoming.employment_types,
      highest_qualification=incoming.highest_qualification,university_name=incoming.university_name,graduation_year=incoming.graduation_year,
      target_job_titles=incoming.target_job_titles,primary_skills=incoming.primary_skills,secondary_skills=incoming.secondary_skills,
      certifications=incoming.certifications,is_active_bench=COALESCE(incoming.is_active_bench,false),notes=incoming.notes,provenance_status='confirmed',
      employment_history=COALESCE(incoming.employment_history,'[]'::jsonb),education_history=COALESCE(incoming.education_history,'[]'::jsonb),
      evidence=COALESCE(incoming.evidence,'[]'::jsonb),confirmed_facts=p_fields-'user_id'-'created_by'-'version'-'id'-'resume_url',
      version=version+1 WHERE id=result;
    RETURN result;
  END; $$;

  INSERT INTO public.profiles(id,email,full_name,role,status) VALUES('11111111-1111-1111-1111-111111111111','verify@example.com','Verify User','candidate','active');

  -- The defect carried by the live database.
  CREATE OR REPLACE FUNCTION public.broken_candidate_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    NEW.confirmed_facts:=COALESCE(NEW.notes::text,'{}'::jsonb);
    RETURN NEW;
  END; $$;
  CREATE TRIGGER broken_candidate_trigger BEFORE INSERT OR UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.broken_candidate_trigger();`);

const actor='11111111-1111-1111-1111-111111111111';
const fields={full_name:'Verify User',email:'verify@example.com',phone:'(512) 555-0187',current_job_title:'Senior Software Engineer',
  current_employer:'BluePeak Digital Solutions',current_city:'Austin',current_state:'TX',target_job_titles:'FULL STACK DEVELOPER',
  primary_skills:'React, TypeScript, Java',total_experience_years:'9.3',highest_qualification:'Bachelor of Technology',
  university_name:'Jawaharlal Nehru Technological University',graduation_year:'2017',certifications:'AWS Certified Solutions Architect',
  is_active_bench:true,notes:null,
  employment_history:[{employer:'BluePeak Digital Solutions',title:'Senior Software Engineer',start:'2022-03',end:'2026-11',location:'Austin, TX',evidence:'Senior Software Engineer'}],
  education_history:[{degree:'Bachelor of Technology',institution:'Jawaharlal Nehru Technological University',start:null,end:'2017',evidence:'Bachelor of Technology'}],
  evidence:[{field:'full_name',snippet:'Verify User',page:1}]};

async function trySave(){
  try{
    const {rows}=await db.query(`SELECT public.save_candidate_profile($1::uuid,NULL::uuid,NULL::integer,$2::jsonb) AS id`,[actor,JSON.stringify(fields)]);
    return {ok:true,id:rows[0].id};
  }catch(e){return {ok:false,error:String(e.message).split('\n')[0]};}
}

console.log('Before the repair:',JSON.stringify(await trySave()));

const repairSql=await readFile(repairUrl,'utf8');
try{await db.exec(repairSql);console.log('Repair migration applied');}
catch(e){console.log('REPAIR FAILED :: '+String(e.message).split('\n')[0]);}

const after=await trySave();
console.log('After the repair:',JSON.stringify(after));
if(after.ok){
  const {rows}=await db.query(`SELECT full_name,current_job_title,current_employer,current_city,primary_skills,total_experience_years,
    graduation_year,version,provenance_status,jsonb_array_length(employment_history) AS jobs,
    jsonb_array_length(education_history) AS schools,jsonb_array_length(evidence) AS cites
    FROM public.candidates WHERE id=$1`,[after.id]);
  console.log('Saved profile:',JSON.stringify(rows[0]));
}
const {rows:triggers}=await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.candidates'::regclass AND NOT tgisinternal ORDER BY tgname`);
console.log('Triggers on public.candidates:',triggers.map(t=>t.tgname).join(', '));
await db.close();
