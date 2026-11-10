import 'server-only';import {normalizeSnapshot} from '../normalize';import {CaptureError} from '@/lib/db/admin';
export function validateBoard(value:string){if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value))throw new CaptureError('Use the exact public board slug, without a URL.');return value;}
export function getProviderUrl(provider: string, board_slug: string): string {
  switch (provider) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${board_slug}/jobs?content=true`;
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${board_slug}?includeCompensation=true`;
    case 'lever':
      return `https://api.lever.co/v0/postings/${board_slug}?mode=json`;
    case 'smartrecruiters':
      return `https://api.smartrecruiters.com/v1/companies/${board_slug}/postings?limit=100`;
    case 'breezy':
      return `https://${board_slug}.breezy.hr/json`;
    case 'remoteok':
      return `https://remoteok.com/api`;
    default:
      throw new CaptureError('Unsupported public job provider.');
  }
}

export async function fetchSnapshot(source:{provider:string;board_slug:string;company:string}){
  if (source.provider !== 'remoteok') {
    validateBoard(source.board_slug);
  }
  const url = getProviderUrl(source.provider, source.board_slug);
  const response=await fetch(url,{
    redirect:'error',
    signal:AbortSignal.timeout(30000),
    cache:'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NextKinHR/2.0 JobCrawler'
    }
  });
  if(!response.ok)throw new CaptureError('Public job provider returned '+response.status+'. Previous jobs are retained.',response.status===429?502:422);
  const reader=response.body?.getReader();if(!reader)throw new CaptureError('Empty provider response.');const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>20*1024*1024)throw new CaptureError('Provider snapshot exceeds 20 MiB. Previous jobs are retained.');chunks.push(value);}}finally{await reader.cancel();}
  return normalizeSnapshot(source,JSON.parse(Buffer.concat(chunks).toString('utf8')));
}