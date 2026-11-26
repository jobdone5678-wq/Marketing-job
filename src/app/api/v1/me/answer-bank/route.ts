import {
  OPTIONS as handleOPTIONS,
  GET as handleGET,
  POST as handlePOST,
  PUT as handlePUT,
  PATCH as handlePATCH,
  DELETE as handleDELETE,
} from '@/lib/v1/me/answer-bank';

export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return handleOPTIONS(request);
}

export function GET(request: Request) {
  return handleGET(request);
}

export function POST(request: Request) {
  return handlePOST(request);
}

export function PUT(request: Request) {
  return handlePUT(request);
}

export function PATCH(request: Request) {
  return handlePATCH(request);
}

export function DELETE(request: Request) {
  return handleDELETE(request);
}
