import 'server-only';
import {requireProfile} from '@/lib/auth/require-profile';
import {requireSameOrigin,errorResponse} from '@/lib/db/admin';
import type {UserProfile} from '@/types/database';
import {ZodError} from 'zod';
export async function protectedRoute(request:Request,access:'candidate_or_staff'|'staff'|'admin',work:(profile:UserProfile)=>Promise<unknown>) {
  try {
    if(!['GET','HEAD'].includes(request.method))requireSameOrigin(request);
    const profile=await requireProfile(access);
    return Response.json(await work(profile));
  } catch(error) {if(error instanceof ZodError||error instanceof SyntaxError)return Response.json({error:'Invalid request. Check required fields and try again.'},{status:400});return errorResponse(error);}
}
