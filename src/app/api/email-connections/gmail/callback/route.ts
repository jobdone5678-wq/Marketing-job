import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {emailConfig} from '@/lib/email-confirmations/config';
import {decryptToken,encryptToken,equalSecret} from '@/lib/email-confirmations/crypto';
import {gmailJson} from '@/lib/email-confirmations/gmail';
import {adminClient,checkDb,requireCaptureStaff} from '@/lib/email-confirmations/server';

export async function GET(request:Request) {
  // Redirect only to the configured application origin, never to a caller-provided URL.
  let appOrigin:string;
  try {appOrigin=emailConfig().appOrigin;} catch {return Response.json({error:'Gmail is not configured.'},{status:503});}
  try {
    const config=emailConfig();const jar=await cookies(); const cookie=jar.get('mail_oauth')?.value;
    jar.set('mail_oauth','',{path:'/api/email-connections/gmail',maxAge:0,httpOnly:true,sameSite:'lax',secure:appOrigin.startsWith('https:')});
    const {profile}=await requireCaptureStaff(); const params=new URL(request.url).searchParams;
    if(!cookie || params.has('error')) throw new Error('Consent incomplete.');
    const saved=JSON.parse(decryptToken(cookie,config.encryptionKey)) as {state:string;verifier:string;userId:string;expires:number};
    if(saved.userId!==profile.id || saved.expires<Date.now() || !equalSecret(params.get('state')||'',saved.state)) throw new Error('Invalid OAuth state.');
    const code=params.get('code'); if(!code) throw new Error('Missing code.');
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,code,code_verifier:saved.verifier,grant_type:'authorization_code'}),
      signal:AbortSignal.timeout(20000),cache:'no-store'});
    if(!response.ok) throw new Error('Token exchange failed.');
    const tokens=await response.json() as {access_token?:string;refresh_token?:string;scope?:string};
    if(!tokens.access_token || !tokens.refresh_token || !tokens.scope?.split(' ').includes('https://www.googleapis.com/auth/gmail.readonly')) throw new Error('Required access not granted.');
    const mailbox=await gmailJson<{emailAddress:string}>('profile',tokens.access_token);
    const {error}=await adminClient().from('email_connections').upsert({owner_id:profile.id,provider:'gmail',mailbox_email:mailbox.emailAddress.toLowerCase(),
      refresh_token_encrypted:encryptToken(tokens.refresh_token,config.encryptionKey),status:'connected',last_error:null,sync_lease_until:null,sync_lease_token:null},
      {onConflict:'owner_id,provider,mailbox_email'});
    checkDb(error);
    return NextResponse.redirect(`${appOrigin}/dashboard/email-confirmations?mail=connected`);
  } catch {
    return NextResponse.redirect(`${appOrigin}/dashboard/email-confirmations?mail=connection_failed`);
  }
}
