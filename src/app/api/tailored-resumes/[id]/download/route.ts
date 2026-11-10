import {protectedRoute} from '@/lib/http/protected-route';
import {CaptureError} from '@/lib/db/admin';
import {getTailoredResume} from '@/lib/tailored-resumes/repository';
import {resumeDocx} from '@/lib/tailored-resumes/docx';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return protectedRoute(request,'candidate_or_staff',async profile=>{
 const {resume,candidate}=await getTailoredResume(profile,(await context.params).id);
 if(resume.stale)throw new CaptureError('Candidate or source changed. Generate and review a new resume.',409);
 if(resume.status!=='ready'||resume.reviewed_revision!==resume.revision)throw new CaptureError('Review and confirm resume accuracy before downloading.',409);
 const name=(candidate.full_name||'candidate').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
 return new Response(new Uint8Array(resumeDocx(resume.content)),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':`attachment; filename="${name}_tailored_resume_v${resume.revision}.docx"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
});}
