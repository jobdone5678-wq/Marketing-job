import {z} from 'zod';
import {syncEmailConnection} from '@/lib/email-confirmations/sync';
import {CaptureError,captureErrorResponse,requireCaptureStaff,requireSameOrigin} from '@/lib/email-confirmations/server';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  try {
    requireSameOrigin(request);const {profile}=await requireCaptureStaff();const {id}=await context.params;
    if(!z.uuid().safeParse(id).success) throw new CaptureError('Invalid mailbox identifier.');
    return Response.json(await syncEmailConnection(profile.id,id));
  } catch(error) {return captureErrorResponse(error);}
}
