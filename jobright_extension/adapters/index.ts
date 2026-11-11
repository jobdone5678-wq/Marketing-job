import { Adapter } from './types';
import { workday } from './workday';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import { ashby } from './ashby';

export * from './types';
export { workday, greenhouse, lever, ashby };

export const defaultAdapter: Adapter = {
  name: 'Generic',
  detect: () => true,
  fieldHint: (el: HTMLElement) => el.getAttribute('autocomplete') || el.getAttribute('name') || '',
  nextButton: () =>
    document.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"], [data-automation-id="pageFooterNextButton"], button:not([type="button"])'
    ),
};

const adapters: Adapter[] = [workday, greenhouse, lever, ashby, defaultAdapter];

export function pickAdapter(loc: Location = window.location, doc: Document = document): Adapter {
  for (const adapter of adapters) {
    try {
      if (adapter.detect(loc, doc)) {
        return adapter;
      }
    } catch {
      // Ignore detection errors and continue
    }
  }
  return defaultAdapter;
}
