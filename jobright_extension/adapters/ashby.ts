import { Adapter } from './types';

export const ashby: Adapter = {
  name: 'Ashby',
  detect: (loc: Location = window.location) => /(^|\.)ashbyhq\.com$/i.test(loc.hostname),
  fieldHint: (el: HTMLElement) => {
    const name = el.getAttribute('name') || '';
    if (name === '_systemfield_name') return 'full_name';
    if (name === '_systemfield_email') return 'email';
    if (name === '_systemfield_location') return 'current_city';
    if (name === '_systemfield_phone') return 'phone';
    if (/urls\[([^\]]+)\]/i.test(name)) {
      const match = name.match(/urls\[([^\]]+)\]/i);
      const key = match ? match[1].toLowerCase() : '';
      if (/linkedin/.test(key)) return 'linkedin_url';
      if (/github/.test(key)) return 'github_url';
      if (/twitter|portfolio|website|other|url/.test(key)) return 'website';
    }
    return el.getAttribute('data-testid') || '';
  },
  nextButton: () =>
    document.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"], button[data-testid="application-form-submit-button"]'
    ),
};

