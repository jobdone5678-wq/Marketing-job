import {setTimeout as delay} from 'node:timers/promises';
const origin=process.env.APP_URL;
const secret=process.env.EMAIL_SYNC_SECRET;
if(!origin || !secret || secret.length<32) throw new Error('Set APP_URL and EMAIL_SYNC_SECRET (at least 32 characters) to run email sync.');
const url=new URL(origin);
if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('APP_URL must use HTTPS or localhost.');
let stopped=false;
process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
console.log('Email confirmation worker started. Checking connected mailboxes every 5 minutes.');
while(!stopped) {
  try {
    const response=await fetch(`${url.origin}/api/email-confirmations/sync`,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(300000)});
    if(!response.ok) console.error(`Email synchronization returned HTTP ${response.status}.`);
    else {
      const {results}=await response.json();
      console.log(`Email sync completed: ${(results||[]).length} mailbox checks, ${(results||[]).filter(item=>item.error).length} requiring attention.`);
    }
  } catch {console.error('Email synchronization was unavailable; it will retry.');}
  for(let seconds=0;seconds<300 && !stopped;seconds++) await delay(1000);
}
