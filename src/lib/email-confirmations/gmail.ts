import type { ReceivedEmail } from './types';

export interface GmailPart {
  mimeType?: string; filename?: string; headers?: {name:string;value:string}[];
  body?: {data?:string}; parts?:GmailPart[];
}
export interface GmailMessage { id:string; internalDate:string; labelIds?:string[]; payload?:GmailPart }
export class MailboxRequestError extends Error {
  status: number;
  constructor(status:number) { super(status===401 || status===403 ? 'Mailbox access must be reconnected.' : 'Mailbox provider could not complete the request.'); this.status=status; }
}

export async function gmailJson<T>(path:string,accessToken:string):Promise<T> {
  const response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{
    headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(10000),cache:'no-store',
  });
  if(!response.ok) throw new MailboxRequestError(response.status);
  return await response.json() as T;
}

function messageText(part:GmailPart):string {
  if(part.filename) return ''; // Never decode attachments or resumes as receipt evidence.
  if(part.mimeType==='text/plain' && part.body?.data) return Buffer.from(part.body.data,'base64url').toString('utf8');
  if(part.parts?.length) {
    const plain=part.parts.filter(child=>child.mimeType==='text/plain').map(messageText).join('\n');
    return plain || part.parts.map(messageText).join('\n');
  }
  if(part.mimeType==='text/html' && part.body?.data) {
    return Buffer.from(part.body.data,'base64url').toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi,'')
      .replace(/<(?:br|\/p|\/div)\b[^>]*>/gi,'\n')
      .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  }
  return '';
}

export function gmailMessageToEmail(message:GmailMessage,allowedDomains:string[]):ReceivedEmail {
  const headers=message.payload?.headers || [];
  const header=(name:string)=>headers.find(value=>value.name.toLowerCase()===name.toLowerCase())?.value || '';
  const from=header('From');
  const sender=from.match(/@([a-z0-9.-]+)>?\s*$/i)?.[1]?.toLowerCase() || '';
  // Use Gmail's own authentication result, not a sender-supplied lower Authentication-Results header.
  const authentication=headers.filter(value=>value.name.toLowerCase()==='authentication-results')
    .find(value=>/^mx\.google\.com\s*;/i.test(value.value))?.value || '';
  const authenticated=authentication.split(';').some(value=> {
    if(!/\bdkim=pass\b/i.test(value)) return false;
    const signingIdentity=value.match(/\bheader\.(?:i|d)=([^\s;]+)/i)?.[1]?.toLowerCase();
    const signingDomain=signingIdentity?.split('@').pop();
    return !!sender && signingDomain===sender;
  });
  const date=Number(message.internalDate);
  if(!Number.isFinite(date) || date<=0) throw new MailboxRequestError(502);
  const to=[header('To'),header('Delivered-To')].flatMap(value=>value.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]);
  return {messageId:message.id,from,to,subject:header('Subject'),text:messageText(message.payload||{}).slice(0,50000),
    receivedAt:new Date(date).toISOString(),source:'connected_mailbox',direction:message.labelIds?.includes('SENT')?'sent':'received',
    senderAuthenticated:!!sender && authenticated,senderAllowed:allowedDomains.some(domain=>sender===domain.toLowerCase())};
}
