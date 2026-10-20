// Isolated visual QA server. Uses synthetic records; it never forwards API requests.
import {createServer} from 'node:http';
import {browserBundle,browserStyles} from '../tests/helpers/browser-bundle.mjs';
const profile={id:'fixture',full_name:'Casey Bennett',email:'casey@example.test',role:'recruiter',status:'active'};
const candidates=[
 {id:'candidate-1',full_name:'Arjun Mehta',email:'arjun@example.test',phone:'+1 (512) 555-0148',target_job_titles:'Senior Java Engineer',current_job_title:'Senior Software Engineer',visa_status:'H-1B',primary_skills:'Java, Spring Boot, AWS, PostgreSQL',secondary_skills:'Kafka, Docker, Terraform',current_city:'Austin',current_state:'TX',preferred_locations:'Austin, TX · Remote',expected_salary:'$85/hr C2C',total_experience_years:'8',authorized_in_usa:true,need_sponsorship_now:true,is_active_bench:true,available_to_join:'2 weeks',provenance_status:'confirmed',version:4,employment_history:[{employer:'Cedarline Financial',title:'Senior Software Engineer',start:'2022-04',end:'2026-08',description:'Developed Java services and AWS infrastructure for transaction reporting.'},{employer:'Harbor Data Systems',title:'Software Engineer',start:'2018-06',end:'2022-03'}],education_history:[{degree:'MS Computer Science',institution:'State University',end:'2018'}],evidence:[{field:'primary_skills',snippet:'Java, Spring Boot and AWS experience recorded in the reviewed resume.',page:1}],created_at:'2026-09-18T09:00:00Z'},
 {id:'candidate-2',full_name:'Marisol Vega',target_job_titles:'Cloud Data Engineer',visa_status:'Green Card',primary_skills:'Python, SQL, Snowflake, dbt',secondary_skills:'Airflow, Azure',preferred_locations:'Chicago, IL · Hybrid',expected_salary:'$92/hr',is_active_bench:true,available_to_join:'Immediately',provenance_status:'confirmed',version:2,created_at:'2026-09-12T09:00:00Z'},
 {id:'candidate-3',full_name:'Nikhil Rao',target_job_titles:'Platform Engineer',visa_status:null,primary_skills:'Kubernetes, Go, Terraform',preferred_locations:'Seattle, WA',expected_salary:null,is_active_bench:false,provenance_status:'legacy_unconfirmed',version:1,created_at:'2026-09-10T09:00:00Z'},
];
const jobs=[{id:'job-1',title:'Senior Java Engineer',company:'Cedarline Financial',location:'Austin, TX',employment_type:'contract',arrangements:['hybrid'],state:'active',source:{provider:'greenhouse'},posted_at:'2026-10-17T08:00:00Z',closes_at:null,description:'Required: Java, Spring Boot and AWS. Design and maintain reliable backend services. PostgreSQL and Kafka experience preferred.',application_url:'https://jobs.example.test/1'},{id:'job-2',title:'Cloud Data Engineer',company:'Harbor Data Systems',location:'Chicago, IL',employment_type:'contract',state:'active',source:{provider:'ashby'},posted_at:'2026-10-18T08:00:00Z',closes_at:null,arrangements:['remote']}];
const submissions=[{id:'submission-1',candidate_id:candidates[0].id,candidate:candidates[0],company_name:jobs[0].company,job_title:jobs[0].title,portal_source:'Greenhouse',submission_date:'2026-10-19',status:'Interview_Scheduled',capture_status:'confirmed',email_confirmed_at:'2026-10-19T09:15:00Z',duplicate_flag:false,submitted_rate:'$85/hr',vendor_company:'Cedarline Talent Partners',applied_resume:{filename:'Arjun_Mehta_Java_Engineer.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',markdown:'# Arjun Mehta\n\nSenior Java Engineer\n\nJava · Spring Boot · AWS',isTailored:true,matchScore:78,appliedAt:'2026-10-19T09:00:00Z'}},{id:'submission-2',candidate_id:candidates[1].id,candidate:candidates[1],company_name:jobs[1].company,job_title:jobs[1].title,portal_source:'Ashby',submission_date:'2026-10-18',status:'Applied',capture_status:'submit_attempted',duplicate_flag:true,submitted_rate:'$92/hr'},{id:'submission-3',candidate_id:candidates[0].id,candidate:candidates[0],company_name:'Rivermark Technology',job_title:'Backend Engineer',portal_source:'Workday',submission_date:'2026-10-17',status:'Vendor_Screening',capture_status:'submitted',duplicate_flag:false}];
const intents=submissions.map((submission,index)=>({id:'intent-'+index,submission_id:submission.id,attempt:1,candidate:submission.candidate,job:{title:submission.job_title,company:submission.company_name,application_url:'https://jobs.example.test/'+index},submission}));
const metrics={candidates:3,submissions:3,confirmed:1,vendors:2,activity:[{date:'2026-10-13',submissions:2},{date:'2026-10-14',submissions:4},{date:'2026-10-15',submissions:3},{date:'2026-10-16',submissions:6},{date:'2026-10-17',submissions:3},{date:'2026-10-18',submissions:5},{date:'2026-10-19',submissions:3}]};
const stubs={
 '@/lib/client':`export function createClient(){const profile=${JSON.stringify(profile)};return {auth:{getUser:async()=>({data:{user:profile}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:profile})})}}`,
 '@/hooks/use-user-profile':`export function useUserProfile(){return {profile:${JSON.stringify(profile)},isRecruiter:true,isTechnicalRecruiter:false,isClient:false,loading:false}}`,
 '@/lib/candidates':`export async function getCandidates(){return ${JSON.stringify(candidates)}};export async function getCandidateById(id){return (${JSON.stringify(candidates)}).find(candidate=>candidate.id===id)};`,
 '@/lib/submissions':`export async function getSubmissions(){return ${JSON.stringify(submissions)}};export async function deleteSubmission(){throw new Error('Visual fixture is read-only')};export async function updateSubmissionStatus(){throw new Error('Visual fixture is read-only')}`,
};
const [script,css]=await Promise.all([browserBundle('./tests/fixtures/frontend-phase-preview.tsx','createRoot(document.getElementById("root")).render(<Component.default/>);',stubs),browserStyles()]);
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic recruiting UI validation</title><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet"><style>'+css+'</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const server=createServer((request,response)=>{
 const url=new URL(request.url,'http://127.0.0.1:4173');
 if(request.method!=='GET'){response.writeHead(405,{'Content-Type':'application/json'});response.end(JSON.stringify({error:'This synthetic preview is read-only.'}));return;}
 if(url.pathname==='/fixture.js'){response.writeHead(200,{'Content-Type':'application/javascript'});response.end(script);return;}
 if(!url.pathname.startsWith('/api/')){response.writeHead(200,{'Content-Type':'text/html'});response.end(html);return;}
 let result={};const path=url.pathname;
 if(path==='/api/candidates')result={candidates,total:candidates.length,hasMore:false,role:profile.role};
 else if(path.endsWith('/documents'))result={documents:[]};
 else if(path==='/api/dashboard')result={role:profile.role,metrics};
 else if(path==='/api/settings')result={profile,settings:{company_name:'Nextkinlife LLC',ai_daily_limit:150,source_sync_minutes:30},ai:{configured:true,model:'Configured provider'}};
 else if(path==='/api/application-intents')result={intents};
 else if(path.endsWith('/events'))result={events:[{id:'event-1',status:'submit_attempted',source:'extension_observation',evidence:'Final submit interaction observed for this application.',attempt:1,observed_at:'2026-10-19T09:00:00Z'}]};
 else if(path==='/api/extension/credentials')result={credentials:[]};
 else if(path==='/api/email-connections')result={connections:[{id:'mailbox',provider:'gmail',mailbox_email:'recruiting@example.test',status:'connected',last_synced_at:'2026-10-19T09:45:00Z',last_error:null}],gmailConfigured:true};
 else if(path==='/api/jobs')result={jobs,total:jobs.length,hasMore:false,recommendation:{enabled:false,requiresProfile:false,candidateId:null,candidateName:null}};
 else if(path==='/api/jobs/job-1')result={job:jobs[0]};
 else if(path==='/api/job-sources')result={sources:[]};
 else if(path==='/api/tailored-resumes')result={resumes:[]};
 else if(path==='/api/admin/job-briefs')result={briefs:[]};
 else if(path.endsWith('/answers'))result={snapshots:[]};
 response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify(result));
});
server.listen(4173,'127.0.0.1',()=>process.stdout.write('Read-only synthetic frontend preview: http://127.0.0.1:4173/dashboard/candidates\n'));
