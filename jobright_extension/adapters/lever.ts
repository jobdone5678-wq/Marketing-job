import { Adapter } from './types';

export const lever: Adapter = {
  name: 'Lever',
  detect: (loc: Location = window.location) => /(^|\.)lever\.co$/i.test(loc.hostname),
  fieldHint: (el: HTMLElement) => {
    const name = el.getAttribute('name') || '';
    if (name === 'name') return 'full_name';
    if (name === 'email') return 'email';
    if (name === 'phone') return 'phone';
    if (name === 'org') return 'current_employer';
    if (name === 'location') return 'current_city';
    if (/urls\[linkedin\]/i.test(name)) return 'linkedin_url';
    if (/urls\[github\]/i.test(name)) return 'github_url';
    if (/urls\[portfolio\]|urls\[website\]|urls\[other\]/i.test(name)) return 'website';
    if (/urls\[twitter\]/i.test(name)) return 'website';
    return '';
  },
  nextButton: () =>
    document.querySelector<HTMLElement>(
      '#btn-submit, button[type="submit"], input[type="submit"]'
    ),
};

