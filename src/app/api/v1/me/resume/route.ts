import {
  GET as handleGET,
  POST as handlePOST,
  PUT as handlePUT,
  DELETE as handleDELETE,
} from '@/lib/v1/me/resume';

export const runtime = 'nodejs';
export const maxDuration = 60;

export function GET(request: Request) {
  return handleGET(request);
}

export function POST(request: Request) {
  return handlePOST(request);
}

export function PUT(request: Request) {
  return handlePUT(request);
}

export function DELETE(request: Request) {
  return handleDELETE(request);
}
