import {cookies} from 'next/headers';
import {createHash,randomBytes} from 'node:crypto';
import {emailConfig} from '@/lib/email-confirmations/config';
import {encryptToken} from '@/lib/email-confirmations/crypto';
import {captureErrorResponse,requireCaptureStaff,requireSameOrigin} from '@/lib/email-confirmations/server';
export async function POST(request:Request) {
  try {
    requireSameOrigin(request); const {profile}=await requireCaptureStaff(); const config=emailConfig();
    const state=randomBytes(32).toString('base64url');const verifier=randomBytes(32).toString('base64url');
    const cookie=encryptToken(JSON.stringify({state,verifier,userId:profile.id,expires:Date.now()+600000}),config.encryptionKey);
    (await cookies()).set('mail_oauth',cookie,{httpOnly:true,secure:config.appOrigin.startsWith('https:'),sameSite:'lax',path:'/api/email-connections/gmail',maxAge:600});
    const params=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',
      scope:'https://www.googleapis.com/auth/gmail.readonly',access_type:'offline',prompt:'consent',state,
      code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    return Response.json({url:`https://accounts.google.com/o/oauth2/v2/auth?${params}`});
  } catch(error) {return captureErrorResponse(error);}
}
