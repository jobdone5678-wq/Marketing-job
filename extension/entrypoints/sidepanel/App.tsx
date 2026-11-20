import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { buildPlan, showsApplicationForm, type ApplyPlan } from '../../lib/applyPlan';
import { scopeToApplication } from '../../lib/fillPlan';
import type { RuntimeMessage } from '../../lib/protocol';
import NextKinActions from './NextKinActions';

type FormState = { status: 'loading' | 'empty' | 'unavailable' } | { status: 'found'; plan: ApplyPlan };

async function readActiveForm(): Promise<FormState> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url || !/^https?:\/\//.test(tab.url)) return { status: 'empty' };

  const reply = (await browser.runtime.sendMessage({
    kind: 'GET_FRAMED_FORM',
    tabId: tab.id,
    pageUrl: tab.url,
  } satisfies RuntimeMessage)) as RuntimeMessage | undefined;

  if (reply?.kind !== 'FRAMED_FORM') return { status: 'unavailable' };
  if (!showsApplicationForm(reply.fields, reply.uploads)) return { status: 'empty' };
  return { status: 'found', plan: buildPlan(scopeToApplication(reply.fields, reply.uploads)) };
}

export default function App() {
  const [form, setForm] = useState<FormState>({ status: 'loading' });

  useEffect(() => {
    let mounted = true;
    let reading = false;
    let queued = false;

    async function refresh() {
      // Form changes can arrive continuously. Finish the current read and then
      // process any updates that came in while it was in flight.
      if (reading) {
        queued = true;
        return;
      }
      reading = true;
      do {
        queued = false;
        const result = await readActiveForm().catch((): FormState => ({ status: 'unavailable' }));
        if (mounted) setForm(result);
      } while (mounted && queued);
      reading = false;
    }

    const onTabUpdated: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (_, change, tab) => {
      if (tab.active && (change.url || change.status === 'complete')) void refresh();
    };
    const onMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message, sender) => {
      if (message?.kind === 'FORM_CHANGED' && sender.tab?.active) void refresh();
    };

    browser.tabs.onActivated.addListener(refresh);
    browser.tabs.onUpdated.addListener(onTabUpdated);
    browser.windows.onFocusChanged.addListener(refresh);
    browser.runtime.onMessage.addListener(onMessage);
    void refresh();

    return () => {
      mounted = false;
      browser.tabs.onActivated.removeListener(refresh);
      browser.tabs.onUpdated.removeListener(onTabUpdated);
      browser.windows.onFocusChanged.removeListener(refresh);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, []);

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Extension</h1>
      <section className="rounded-lg border border-border p-4" aria-labelledby="form-heading">
        <h2 id="form-heading" className="text-sm font-semibold">Application form</h2>
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {form.status === 'loading' && 'Checking the current tab…'}
          {form.status === 'empty' && 'Open a job application form to see its fields here.'}
          {form.status === 'unavailable' && 'The form could not be read. Reload the application page and try again.'}
          {form.status === 'found' && (form.plan.required
            ? `${form.plan.required.answered} of ${form.plan.required.total} required questions answered.`
            : 'Application form detected.')}
        </p>
        {form.status === 'found' && form.plan.items.length > 0 && (
          <ul className="mt-3 divide-y divide-border text-sm">
            {form.plan.items.map((field) => (
              <li key={field.key} className="flex justify-between gap-3 py-2">
                <span>{field.label}{field.required ? ' *' : ''}</span>
                <span className="shrink-0 text-muted-foreground">{field.answered ? 'Answered' : 'Empty'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <NextKinActions />
    </main>
  );
}
