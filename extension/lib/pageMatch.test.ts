import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('wxt/browser', () => ({ browser: {} }));
import { matchPage } from './pageMatch';
import { HIRE_ORIGIN } from './auth';

describe('matchPage lookup URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('skips the catalog on a real ATS page in a NextKinHR build', async () => {
    vi.stubEnv('WXT_ENABLE_JOB_CATALOG', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await matchPage('https://jobs.example.com/acme/123', 't', () => false)).toEqual({
      status: 'empty',
      canAddJob: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'chrome://newtab/',
    'edge://settings/',
    'about:blank',
    'chrome-extension://example/page.html',
    'moz-extension://example/page.html',
    'file:///C:/resume.pdf',
    'https://freehire.me/jobs/example',
    new URL('/dashboard', HIRE_ORIGIN).href,
  ])('skips %s even when the catalog is enabled', async (url) => {
    vi.stubEnv('WXT_ENABLE_JOB_CATALOG', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await matchPage(url, 't', () => false)).toEqual({ status: 'empty', canAddJob: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops credentials and fragment but keeps the query', async () => {
    vi.stubEnv('WXT_ENABLE_JOB_CATALOG', 'true');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: null, meta: { ats_board: true } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await matchPage('https://u:p@jobs.example.com/acme/123?for=acme&token=9#sso=SECRET', 't', () => false);

    const [requested] = fetchMock.mock.calls[0] as unknown as [string];
    const sent = new URL(requested).searchParams.get('url');
    expect(new URL(requested).pathname).toBe('/api/v1/jobs/find');
    expect(sent).toBe('https://jobs.example.com/acme/123?for=acme&token=9');
  });
});
