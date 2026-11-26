import {
  POST as handlePOST,
} from '@/lib/v1/me/experience-atoms-merge';

export const runtime = 'nodejs';

export function POST(request: Request) {
  return handlePOST(request);
}
