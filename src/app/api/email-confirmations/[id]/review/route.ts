import { z } from 'zod';
import { confirmReceipt } from '@/lib/email-confirmations/service';
import { adminClient, CaptureError, captureErrorResponse, checkDb, requireCaptureStaff, requireSameOrigin } from '@/lib/email-confirmations/server';

const decisionSchema = z.discriminatedUnion('action',[
  z.object({action:z.literal('dismiss')}),
  z.object({action:z.literal('confirm'),candidateId:z.uuid(),company:z.string().trim().min(1).max(160),jobTitle:z.string().trim().min(1).max(160),submissionId:z.uuid().nullable()}),
]);
export async function POST(request: Request, context: { params: Promise<{id:string}> }) {
  try {
    requireSameOrigin(request);
    const { profile } = await requireCaptureStaff();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new CaptureError('Invalid receipt identifier.');
    const decision = decisionSchema.safeParse(await request.json());
    if (!decision.success) throw new CaptureError('Choose a candidate, company and job title before confirming.');
    const db = adminClient();
    const {data:receipt,error} = await db.from('email_receipts').select('id,disposition').eq('id',id).eq('owner_id',profile.id).maybeSingle();
    checkDb(error);
    if (!receipt) throw new CaptureError('Receipt not found.',404);
    if(decision.data.action === 'dismiss') {
      if(receipt.disposition === 'confirmed') throw new CaptureError('Confirmed evidence cannot be dismissed.',409);
      if(receipt.disposition==='dismissed') return Response.json({dismissed:true});
      const {data:dismissed,error:dismissError} = await db.from('email_receipts').update({disposition:'dismissed',reviewed_at:new Date().toISOString()}).eq('id',id).eq('owner_id',profile.id).eq('disposition','needs_review').select('id');
      checkDb(dismissError);
      if(!dismissed?.length) throw new CaptureError('This receipt changed during review. Refresh before continuing.',409);
      return Response.json({dismissed:true});
    }
    const submissionId = await confirmReceipt(profile.id,id,decision.data);
    return Response.json({submissionId});
  } catch(error) { return captureErrorResponse(error); }
}
