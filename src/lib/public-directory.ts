import type {VendorFormData} from '@/lib/vendors';

// Curated primary sources, checked 2026-10-14. Jobs are fetched from the public
// ATS API at request time; the catalog itself contains no cached job postings.
export type SupportedJobProvider = 'greenhouse' | 'ashby' | 'lever' | 'smartrecruiters' | 'breezy' | 'remoteok';

export const PUBLIC_JOB_BOARDS: {provider:SupportedJobProvider; board_slug:string; company:string; source_url:string}[] = [
  {provider:'ashby', board_slug:'ramp', company:'Ramp', source_url:'https://jobs.ashbyhq.com/ramp'},
  {provider:'greenhouse', board_slug:'figma', company:'Figma', source_url:'https://job-boards.greenhouse.io/figma'},
  {provider:'ashby', board_slug:'openai', company:'OpenAI', source_url:'https://jobs.ashbyhq.com/openai'},
  {provider:'greenhouse', board_slug:'stripe', company:'Stripe', source_url:'https://job-boards.greenhouse.io/stripe'},
  {provider:'lever', board_slug:'spotify', company:'Spotify', source_url:'https://jobs.lever.co/spotify'},
  {provider:'greenhouse', board_slug:'cloudflare', company:'Cloudflare', source_url:'https://job-boards.greenhouse.io/cloudflare'},
  {provider:'smartrecruiters', board_slug:'BoschGroup', company:'Bosch Group', source_url:'https://careers.smartrecruiters.com/BoschGroup'},
  {provider:'greenhouse', board_slug:'canonical', company:'Canonical', source_url:'https://job-boards.greenhouse.io/canonical'},
  {provider:'ashby', board_slug:'notion', company:'Notion', source_url:'https://jobs.ashbyhq.com/notion'},
  {provider:'ashby', board_slug:'linear', company:'Linear', source_url:'https://jobs.ashbyhq.com/linear'},
  {provider:'ashby', board_slug:'supabase', company:'Supabase', source_url:'https://jobs.ashbyhq.com/supabase'},
  {provider:'breezy', board_slug:'breezy', company:'Breezy HR', source_url:'https://breezy.breezy.hr'},
  {provider:'remoteok', board_slug:'remote', company:'RemoteOK Global Tech', source_url:'https://remoteok.com'},
];


export const PUBLIC_VENDORS = [
  {id:'teksystems', name:'TEKsystems', website:'https://www.teksystems.com', careers_url:'https://www.teksystems.com/en/careers', source_url:'https://www.teksystems.com/en/careers'},
  {id:'robert-half', name:'Robert Half', website:'https://www.roberthalf.com', careers_url:'https://www.roberthalf.com/us/en/jobs', source_url:'https://www.roberthalf.com/us/en/jobs'},
  {id:'kforce', name:'Kforce', website:'https://www.kforce.com', careers_url:'https://www.kforce.com/find-work/', source_url:'https://www.kforce.com/find-work/'},
  {id:'randstad-usa', name:'Randstad USA', website:'https://www.randstadusa.com', careers_url:'https://www.randstadusa.com/jobs/', source_url:'https://www.randstadusa.com/jobs/'},
  {id:'insight-global', name:'Insight Global', website:'https://insightglobal.com', careers_url:'https://insightglobal.com/jobs/', source_url:'https://insightglobal.com/'},
] as const;

export function publicVendorRecord(entry: typeof PUBLIC_VENDORS[number]): VendorFormData {
  return {...entry, public_directory_id:entry.id, source_verified_at:'2026-10-14',
    headquarters:'Not verified', tier:null, payment_terms:null, agreement_status:null,
    responsiveness:null, rating:null, specializations:[], contacts:[], total_submissions:0,
    active_interviews:0, placements_count:0,
    notes:'Imported from the official public company website. Verify partner eligibility, recruiter contacts and commercial terms before outreach or submission.',
  };
}
