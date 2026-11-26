import {
  PUT as handlePUT,
  DELETE as handleDELETE,
} from '@/lib/v1/me/employment-item';

export const runtime = 'nodejs';

export function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlePUT(request, context);
}

export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleDELETE(request, context);
}
