import 'server-only';
import { randomUUID } from 'node:crypto';
import { emailConfig } from './config';
import { decryptToken } from './crypto';
import { gmailJson, gmailMessageToEmail, MailboxRequestError, type GmailMessage } from './gmail';
import { adminClient, CaptureError, checkDb } from './server';
import { ingestEmailReceipt } from './service';

interface SyncConnection { id:string;owner_id:string;mailbox_email:string;refresh_token_encrypted:string;sender_domains:string[];
  sync_after:string;sync_window_end:string|null;sync_page_token:string|null;sync_lease_token:string; }

export async function syncEmailConnection(ownerId:string,connectionId:string) {
  const db=adminClient(); const lease=randomUUID();
  const {data,error}=await db.rpc('claim_email_sync',{p_connection:connectionId,p_owner:ownerId,p_lease:lease});
  checkDb(error);
  const connection=(data as SyncConnection[]|null)?.[0];
  if(!connection) throw new CaptureError('This mailbox is disconnected, unavailable, or already synchronizing.',409);
  let processed=0;let confirmed=0;let review=0;
  try {
    const config=emailConfig();
    const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'refresh_token',refresh_token:decryptToken(connection.refresh_token_encrypted,config.encryptionKey)}),
      signal:AbortSignal.timeout(20000),cache:'no-store'});
    if(!tokenResponse.ok) throw new MailboxRequestError(tokenResponse.status===400?401:tokenResponse.status);
    const token=await tokenResponse.json() as {access_token?:string};
    if(!token.access_token) throw new MailboxRequestError(502);
    const end=connection.sync_window_end || new Date().toISOString();
    const after=Math.floor(new Date(connection.sync_after).getTime()/1000)-120;
    const before=Math.ceil(new Date(end).getTime()/1000)+1;
    // A fixed window and persistent page cursor prevent busy mailboxes from dropping receipts.
    const query=`after:${after} before:${before} -in:sent {"application" "applying"}`;
    let pageToken=connection.sync_page_token;
    let pages=0;
    do {
      const params=new URLSearchParams({q:query,maxResults:'10'});
      if(pageToken) params.set('pageToken',pageToken);
      const page=await gmailJson<{messages?:{id:string}[];nextPageToken?:string}>(`messages?${params}`,token.access_token);
      for(const reference of page.messages||[]) {
        const {data:active,error:activeError}=await db.from('email_connections').select('id').eq('id',connectionId).eq('sync_lease_token',lease).eq('status','connected').maybeSingle();
        checkDb(activeError);if(!active) throw new CaptureError('Mailbox synchronization was stopped.',409);
        const raw=await gmailJson<GmailMessage>(`messages/${encodeURIComponent(reference.id)}?format=full`,token.access_token);
        const mail=gmailMessageToEmail(raw,connection.sender_domains);
        const result=await ingestEmailReceipt(ownerId,connectionId,`gmail:${connection.mailbox_email.toLowerCase()}:${raw.id}`,mail,lease);
        processed++;
        if(!result.duplicate && result.disposition==='confirmed') confirmed++;
        if(!result.duplicate && result.disposition==='needs_review') review++;
      }
      pageToken=page.nextPageToken||null;pages++;
      const {data:owned,error:saveError}=await db.from('email_connections').update({sync_page_token:pageToken,sync_window_end:pageToken?end:null,
        sync_after:pageToken?connection.sync_after:end,sync_lease_until:new Date(Date.now()+300000).toISOString()})
        .eq('id',connectionId).eq('sync_lease_token',lease).eq('status','connected').select('id');
      checkDb(saveError);
      if(!owned?.length) throw new CaptureError('Mailbox synchronization was stopped.',409);
    } while(pageToken && pages<1);
    const {error:finishError}=await db.from('email_connections').update({last_synced_at:new Date().toISOString(),last_error:null,sync_lease_until:null,sync_lease_token:null})
      .eq('id',connectionId).eq('sync_lease_token',lease);
    checkDb(finishError);
    return {processed,confirmed,review,hasMore:!!pageToken};
  } catch(error) {
    const reconnect=error instanceof MailboxRequestError && [401,403].includes(error.status);
    await db.from('email_connections').update({last_error:reconnect?'Mailbox access expired. Reconnect to continue.':'Last synchronization failed. Saved receipts are retained; retry is safe.',
      ...(reconnect?{status:'reconnect_required'}:{}),sync_lease_until:null,sync_lease_token:null}).eq('id',connectionId).eq('sync_lease_token',lease);
    throw error instanceof CaptureError ? error : new CaptureError(reconnect?'Reconnect this mailbox to continue.':'Mailbox synchronization failed. Saved receipts are retained.',reconnect?409:502);
  }
}
