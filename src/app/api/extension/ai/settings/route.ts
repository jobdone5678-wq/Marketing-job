import {
  getExtensionAiSettings,
  putExtensionAiSettings,
  settingsOptions,
} from '@/lib/ai/extension-settings-service';

export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return settingsOptions(request);
}

export async function GET(request: Request) {
  return getExtensionAiSettings(request);
}

export async function PUT(request: Request) {
  return putExtensionAiSettings(request);
}
