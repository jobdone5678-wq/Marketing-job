import {
  GET as handleGET,
  POST as handlePOST,
  PATCH as handlePATCH,
} from '@/lib/v1/me/experience';

export const runtime = 'nodejs';

export function GET(request: Request) {
  return handleGET(request);
}

export function POST(request: Request) {
  return handlePOST(request);
}

export function PATCH(request: Request) {
  return handlePATCH(request);
}
