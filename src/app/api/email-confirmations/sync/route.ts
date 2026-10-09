import {equalSecret} from '@/lib/email-confirmations/crypto';
import {syncEmailConnection} from '@/lib/email-confirmations/sync';
import {adminClient,captureErrorResponse,checkDb} from '@/lib/email-confirmations/server';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:Request) {
  const secret=process.env.EMAIL_SYNC_SECRET;
  if(!secret || secret.length<32 || !equalSecret(request.headers.get('authorization')||'',`Bearer ${secret}`)) return Response.json({error:'Unauthorized'},{status:401});
  try {
    const db=adminClient();
    const {data,error}=await db.rpc('eligible_email_connections');
    checkDb(error);
    const results=[];
    for(const connection of (data||[]) as {id:string;owner_id:string}[]) {
      try {results.push({id:connection.id,...await syncEmailConnection(connection.owner_id,connection.id)});break;}
      catch {results.push({id:connection.id,error:'Mailbox sync failed or another sync holds the lease.'});}
    }
    return Response.json({results});
  } catch(error) {return captureErrorResponse(error);}
}
