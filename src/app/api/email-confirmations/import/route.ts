import { importEmailReceipt } from '@/lib/email-confirmations/service';
import { CaptureError, captureErrorResponse, requireCaptureStaff, requireSameOrigin } from '@/lib/email-confirmations/server';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { profile } = await requireCaptureStaff();
    if (Number(request.headers.get('content-length')) > 2 * 1024 * 1024 + 16384) throw new CaptureError('Receipt files must be smaller than 2 MiB.',413);
    const form = await request.formData();
    const file = form.get('receipt');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.eml')) throw new CaptureError('Choose a downloaded email in .eml format.');
    if (file.size > 2 * 1024 * 1024) throw new CaptureError('Receipt files must be smaller than 2 MiB.',413);
    const result = await importEmailReceipt(profile.id, Buffer.from(await file.arrayBuffer()));
    return Response.json(result);
  } catch(error) { return captureErrorResponse(error); }
}
