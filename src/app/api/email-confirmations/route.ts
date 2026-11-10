import { CaptureError, captureErrorResponse, checkDb, requireCaptureStaff } from '@/lib/email-confirmations/server';

export async function GET(request:Request) {
  try {
    const { client } = await requireCaptureStaff();
    const params=new URL(request.url).searchParams;
    const disposition=params.get('disposition') || 'needs_review';
    const page=Number(params.get('page') || 0);
    if(!['all','needs_review','confirmed','dismissed'].includes(disposition) || !Number.isSafeInteger(page) || page<0 || page>100000) throw new CaptureError('Invalid receipt page.');
    let receiptsQuery=client.from('email_receipts').select('*',{count:'exact'});
    if(disposition!=='all') receiptsQuery=receiptsQuery.eq('disposition',disposition);
    const [{data: receipts,error,count}, {data: candidates, error: candError}, {data: applications, error: appError}] = await Promise.all([
      receiptsQuery.order('created_at',{ascending:false}).order('id').range(page*100,page*100+99),
      client.from('candidates').select('id,full_name,email').order('full_name').limit(500),
      client.from('job_submissions').select('id,candidate_id,company_name,job_title,status').order('id',{ascending:false}).limit(500),
    ]);
    checkDb(error);
    checkDb(candError);
    checkDb(appError);
    return Response.json({ receipts: receipts || [], candidates: candidates || [], applications: applications || [], total:count||0, hasMore:(page+1)*100<(count||0) });
  } catch(error) { return captureErrorResponse(error); }
}
