import { GET as handleGET, PUT as handlePUT } from '@/lib/v1/me/contacts';

export const runtime = 'nodejs';

export function GET(request: Request) {
  return handleGET(request);
}

export function PUT(request: Request) {
  return handlePUT(request);
}
