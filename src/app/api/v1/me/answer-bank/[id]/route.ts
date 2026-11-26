import {
  DELETE as handleDELETE,
} from '@/lib/v1/me/answer-bank-item';

export const runtime = 'nodejs';

export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleDELETE(request, context);
}
