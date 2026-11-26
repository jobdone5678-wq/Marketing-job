import {
  OPTIONS as handleOPTIONS,
  GET as handleGET,
  PUT as handlePUT,
  DELETE as handleDELETE,
} from '@/lib/v1/me/demographic-preferences';

export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return handleOPTIONS(request);
}

export function GET(request: Request) {
  return handleGET(request);
}

export function PUT(request: Request) {
  return handlePUT(request);
}

export function DELETE(request: Request) {
  return handleDELETE(request);
}
