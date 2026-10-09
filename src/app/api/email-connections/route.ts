import { gmailConfigured } from '@/lib/email-confirmations/config';
import { captureErrorResponse,checkDb,requireCaptureStaff } from '@/lib/email-confirmations/server';
export async function GET() {
  try {
    const {client}=await requireCaptureStaff();
    const {data,error}=await client.from('email_connections').select('id,provider,mailbox_email,status,sender_domains,last_synced_at,last_error').order('created_at',{ascending:false});
    checkDb(error);
    return Response.json({connections:data,gmailConfigured:gmailConfigured()});
  } catch(error) {return captureErrorResponse(error);}
}
