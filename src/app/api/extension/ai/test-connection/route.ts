import { testAiConnection } from '@/lib/ai/test-connection';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return testAiConnection(request);
}
