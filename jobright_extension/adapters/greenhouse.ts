import { Adapter } from './types';

export const greenhouse: Adapter = {
  name: 'Greenhouse',
  detect: (loc: Location = window.location) => /(^|\.)greenhouse\.io$/i.test(loc.hostname),
  fieldHint: (el: HTMLElement) => {
    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    if (id === 'first_name' || name === 'first_name') return 'first_name';
    if (id === 'last_name' || name === 'last_name') return 'last_name';
    if (id === 'email' || name === 'email') return 'email';
    if (id === 'phone' || name === 'phone') return 'phone';
    if (/job_application\[location\]/i.test(name)) return 'current_city';
    if (/job_application\[answers\]/i.test(name)) return '';
    return '';
  },
  nextButton: () =>
    document.querySelector<HTMLElement>(
      '#submit_app, button[type="submit"], input[type="submit"]'
    ),
};

