import {protectedRoute} from '@/lib/http/protected-route';
import {database,CaptureError} from '@/lib/db/admin';
import {getJobBrief,checkWorkflowDb} from '@/lib/job-briefs/repository';
import {validateBriefRequirements,briefRequirementsSchema} from '@/lib/job-briefs/matching';
import {z} from 'zod';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return protectedRoute(request,'admin',async()=>({brief:await getJobBrief((await context.params).id)}));}
export async function PATCH(request:Request,context:Context){return protectedRoute(request,'admin',async profile=>{
 const brief=await getJobBrief((await context.params).id);
 const body=z.object({version:z.number().int().min(1),requirements:briefRequirementsSchema,confirmRequirements:z.literal(true)}).parse(await request.json());
 let requirements;try{requirements=validateBriefRequirements(body.requirements,brief.description);}catch(error){throw new CaptureError((error as Error).message);}
 if(!requirements.requirements.length)throw new CaptureError('Add at least one requirement quoted in the JD.');
 const {error}=await database().rpc('review_job_brief',{p_actor:profile.id,p_brief:brief.id,p_expected:body.version,p_data:requirements});
 if(error?.message?.includes('changed'))throw new CaptureError('JD changed. Reload before reviewing.',409);checkWorkflowDb(error);
 return {brief:await getJobBrief(brief.id)};
});}
