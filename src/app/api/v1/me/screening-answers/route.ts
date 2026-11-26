import {
  GET as handleGET,
  PUT as handlePUT,
  DELETE as handleDELETE,
} from '@/lib/v1/me/screening-answers';

export const runtime = 'nodejs';

export function GET(request: Request) {
  return handleGET(request);
}

export function PUT(request: Request) {
  return handlePUT(request);
}

export function DELETE(request: Request) {
  return handleDELETE(request);
}
