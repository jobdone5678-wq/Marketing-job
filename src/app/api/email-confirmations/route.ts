import { CaptureError, captureErrorResponse, checkDb, requireCaptureStaff } from '@/lib/email-confirmations/server';
import { readAllRows } from '@/lib/email-confirmations/pagination';

export async function GET(request:Request) {
  try {
    const { client } = await requireCaptureStaff();
    const params=new URL(request.url).searchParams;
    const disposition=params.get('disposition') || 'needs_review';
    const page=Number(params.get('page') || 0);
    if(!['all','needs_review','confirmed','dismissed'].includes(disposition) || !Number.isSafeInteger(page) || page<0 || page>100000) throw new CaptureError('Invalid receipt page.');
    let receiptsQuery=client.from('email_receipts').select('*',{count:'exact'});
    if(disposition!=='all') receiptsQuery=receiptsQuery.eq('disposition',disposition);
    const [{data: receipts,error,count}, candidates, applications] = await Promise.all([
      receiptsQuery.order('created_at',{ascending:false}).order('id').range(page*100,page*100+99),
      readAllRows(async (from,to) => {const {data,error}=await client.from('candidates').select('id,full_name,email').order('id').range(from,to);checkDb(error);return data||[];}),
      readAllRows(async (from,to) => {const {data,error}=await client.from('job_submissions').select('id,candidate_id,company_name,job_title,status').order('id').range(from,to);checkDb(error);return data||[];}),
    ]);
    checkDb(error);
    return Response.json({ receipts, candidates, applications, total:count||0, hasMore:(page+1)*100<(count||0) });
  } catch(error) { return captureErrorResponse(error); }
}
