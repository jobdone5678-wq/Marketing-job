import 'server-only';
import {requireProfile} from '@/lib/auth/require-profile';
import type {ProfileAccess} from '@/lib/auth/profile-access';
import {requireSameOrigin,errorResponse} from '@/lib/db/admin';
import type {UserProfile} from '@/types/database';
import {ZodError} from 'zod';
export async function protectedRoute(request:Request,access:ProfileAccess,work:(profile:UserProfile)=>Promise<unknown>) {
  const started=performance.now();let authenticated=started;
  const timed=(response:Response)=>{
    const finished=performance.now();
    response.headers.set('Server-Timing',`auth;dur=${(authenticated-started).toFixed(1)}, work;dur=${(finished-authenticated).toFixed(1)}, total;dur=${(finished-started).toFixed(1)}`);
    return response;
  };
  try {
    if(!['GET','HEAD'].includes(request.method))requireSameOrigin(request);
    const profile=await requireProfile(access);
    authenticated=performance.now();
    return timed(Response.json(await work(profile)));
  } catch(error) {if(authenticated===started)authenticated=performance.now();if(error instanceof ZodError||error instanceof SyntaxError)return timed(Response.json({error:'Invalid request. Check required fields and try again.'},{status:400}));return timed(errorResponse(error));}
}
