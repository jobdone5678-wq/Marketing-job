import {z} from 'zod';
import {emailConfig} from '@/lib/email-confirmations/config';
import {decryptToken} from '@/lib/email-confirmations/crypto';
import {adminClient,CaptureError,captureErrorResponse,checkDb,requireCaptureStaff,requireSameOrigin} from '@/lib/email-confirmations/server';
const domains=z.object({senderDomains:z.array(z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/)).max(20)});
async function ownConnection(id:string,owner:string) {
  if(!z.uuid().safeParse(id).success) throw new CaptureError('Invalid mailbox identifier.');
  const {data,error}=await adminClient().from('email_connections').select('*').eq('id',id).eq('owner_id',owner).maybeSingle();
  checkDb(error);if(!data) throw new CaptureError('Mailbox not found.',404);return data;
}
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {
  try {
    requireSameOrigin(request);const {profile}=await requireCaptureStaff();const {id}=await context.params;
    await ownConnection(id,profile.id);const parsed=domains.safeParse(await request.json());
    if(!parsed.success) throw new CaptureError('Enter up to 20 exact sender domains, without URLs or wildcards.');
    const {error}=await adminClient().from('email_connections').update({sender_domains:[...new Set(parsed.data.senderDomains)]}).eq('id',id).eq('owner_id',profile.id);
    checkDb(error);return Response.json({saved:true});
  } catch(error) {return captureErrorResponse(error);}
}
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}) {
  try {
    requireSameOrigin(request);const {profile}=await requireCaptureStaff();const {id}=await context.params;
    const connection=await ownConnection(id,profile.id);let revoked=false;
    // Disconnect locally first so scheduled sync cannot continue, even if Google is unavailable.
    const {error}=await adminClient().from('email_connections').update({status:'disconnected',refresh_token_encrypted:'',sync_lease_token:null,sync_lease_until:null}).eq('id',id).eq('owner_id',profile.id);
    checkDb(error);
    try {
      const token=decryptToken(connection.refresh_token_encrypted,emailConfig().encryptionKey);
      const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({token}),signal:AbortSignal.timeout(20000)});revoked=response.ok;
    } catch { /* Local disconnection is effective; provider revocation result is reported separately. */ }
    return Response.json({disconnected:true,providerRevoked:revoked});
  } catch(error) {return captureErrorResponse(error);}
}
