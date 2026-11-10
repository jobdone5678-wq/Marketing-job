import {protectedRoute} from '@/lib/http/protected-route';
import {database, checkDb, CaptureError} from '@/lib/db/admin';
import {PUBLIC_VENDORS, publicVendorRecord} from '@/lib/public-directory';
import {z} from 'zod';

export async function POST(request:Request) {
  return protectedRoute(request, 'staff', async () => {
    const {ids} = z.object({ids:z.array(z.string().max(100)).min(1).max(50)}).parse(await request.json());
    const selected = [...new Set(ids)].map(id => {
      const entry = PUBLIC_VENDORS.find(v => v.id === id);
      if (!entry) throw new CaptureError('Unknown public company. Refresh the directory and try again.');
      return publicVendorRecord(entry);
    });
    const {data,error} = await database().rpc('import_public_vendors', {p_entries:selected});
    checkDb(error);
    return data as {imported:number; skipped:number};
  });
}
