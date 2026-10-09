import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { z } from 'zod';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return protectedRoute(request, 'staff', async () => {
    const { id } = await context.params;
    z.uuid().parse(id);
    const { data, error } = await database()
      .from('vendors')
      .select('*,contacts:vendor_contacts(*)')
      .eq('id', id)
      .maybeSingle();
    checkDb(error);
    if (!data) throw new CaptureError('Vendor not found.', 404);
    return {
      vendor: {
        ...data.data,
        id: data.id,
        name: data.name,
        created_at: data.created_at,
        updated_at: data.updated_at,
        contacts: data.contacts.map((c: { id: string; data: object }) => ({
          ...c.data,
          id: c.id,
        })),
      },
    };
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return protectedRoute(request, 'staff', async () => {
    const { id } = await context.params;
    z.uuid().parse(id);
    const { data, error } = await database()
      .from('vendors')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    checkDb(error);
    if (!data) throw new CaptureError('Vendor not found.', 404);
    return { success: true };
  });
}