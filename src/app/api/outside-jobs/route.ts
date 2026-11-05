import { NextResponse } from 'next/server';
import { database, checkDb } from '@/lib/db/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.toLowerCase() || '';

    let query = database()
      .from('outside_jobs')
      .select(`
        *,
        candidate:candidates(id, full_name, email, current_city)
      `)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`company.ilike.%${search}%,title.ilike.%${search}%,portal_source.ilike.%${search}%,location.ilike.%${search}%`);
    }

    const { data, error } = await query;
    checkDb(error);

    return NextResponse.json({ success: true, outsideJobs: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
