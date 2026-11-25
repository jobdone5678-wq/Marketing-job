export const EXTENSION_CONNECT_PATH = '/api/v1/auth/extension/connect';

/** Only the extension connect endpoint can override the portal's sign-in destination. */
export function extensionConnectNext(next: string | null): string | null {
  if (!next?.startsWith(`${EXTENSION_CONNECT_PATH}?`)) return null;
  const url = new URL(next, 'https://portal.invalid');
  if (url.hash || !url.searchParams.has('state') || !url.searchParams.has('redirect_uri')) {
    return null;
  }
  return EXTENSION_CONNECT_PATH + url.search;
}
