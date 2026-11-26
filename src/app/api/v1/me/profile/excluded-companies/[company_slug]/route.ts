import {
  DELETE as handleDELETE,
} from '@/lib/v1/me/excluded-company-item';

export const runtime = 'nodejs';

export function DELETE(request: Request, context: { params: Promise<{ company_slug: string }> }) {
  return handleDELETE(request, context);
}
