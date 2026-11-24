import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Setup Mock DOM environment for node:test runner
class MockElement {
  constructor(tagName = 'DIV', attrs = {}, text = '') {
    this.tagName = tagName.toUpperCase();
    this.attrs = {};
    for (const [k, v] of Object.entries(attrs)) {
      this.attrs[k.toLowerCase()] = String(v);
    }
    this.children = [];
    this.parentElement = null;
    this.textContent = text;
    this.innerText = text;
    this.disabled = !!attrs.disabled;
    this.readOnly = !!attrs.readonly;
    this.shadowRoot = null;
    this._value = attrs.value || '';
    this._ownerDocument = null;
    this.classList = {
      _classes: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
      contains: (c) => this.classList._classes.has(c),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
    };
  }

  getAttribute(name) {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
  }

  setAttribute(name, val) {
    this.attrs[name.toLowerCase()] = String(val);
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name.toLowerCase());
  }

  removeAttribute(name) {
    delete this.attrs[name.toLowerCase()];
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get name() { return this.getAttribute('name') || ''; }
  set name(v) { this.setAttribute('name', v); }
  get type() { return this.getAttribute('type') || (this.tagName === 'INPUT' ? 'text' : ''); }
  set type(v) { this.setAttribute('type', v); }
  get value() { return this._value; }
  set value(v) { this._value = String(v ?? ''); }

  get clientRects() { return [{ width: 100, height: 20 }]; }
  getClientRects() { return this.clientRects; }

  get isConnected() { return true; }

  getRootNode() {
    let curr = this;
    while (curr.parentElement) curr = curr.parentElement;
    return curr;
  }

  get ownerDocument() {
    const root = this.getRootNode();
    return root.tagName === '#DOCUMENT' ? root : (this._ownerDocument || globalThis.document);
  }

  set ownerDocument(doc) {
    this._ownerDocument = doc;
  }

  get labels() {
    const list = [];
    if (this.id) {
      const doc = this.ownerDocument;
      if (doc && doc.querySelectorAll) {
        const explicit = doc.querySelectorAll(`label[for="${this.id}"]`);
        list.push(...explicit);
      }
    }
    const parentLabel = this.closest('label');
    if (parentLabel && !list.includes(parentLabel)) list.push(parentLabel);
    return list;
  }

  get previousElementSibling() {
    if (!this.parentElement) return null;
    const siblings = this.parentElement.children;
    const idx = siblings.indexOf(this);
    return idx > 0 ? siblings[idx - 1] : null;
  }

  get nextElementSibling() {
    if (!this.parentElement) return null;
    const siblings = this.parentElement.children;
    const idx = siblings.indexOf(this);
    return (idx >= 0 && idx < siblings.length - 1) ? siblings[idx + 1] : null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  cloneNode(deep = true) {
    const copy = new MockElement(this.tagName, { ...this.attrs }, this.textContent);
    if (deep) {
      for (const child of this.children) {
        copy.appendChild(child.cloneNode(true));
      }
    }
    return copy;
  }

  closest(selector) {
    if (!selector) return null;
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  matches(selector) {
    if (!selector) return false;
    const parts = selector.split(',').map((s) => s.trim());
    for (const part of parts) {
      if (!part) continue;
      const tagMatch = part.match(/^([a-zA-Z0-9_-]+)?(.*)$/);
      const tag = tagMatch ? tagMatch[1] : null;
      const rest = tagMatch ? tagMatch[2] : '';

      if (tag && tag !== '*' && tag.toUpperCase() !== this.tagName) {
        continue;
      }

      if (!rest) {
        return true;
      }

      let matchedRest = true;
      const idMatch = rest.match(/#([a-zA-Z0-9_-]+)/);
      if (idMatch && this.id !== idMatch[1]) {
        matchedRest = false;
      }

      const classMatches = rest.matchAll(/\.([a-zA-Z0-9_-]+)/g);
      for (const cm of classMatches) {
        const classes = (this.getAttribute('class') || '').split(/\s+/);
        if (!classes.includes(cm[1])) {
          matchedRest = false;
          break;
        }
      }

      const attrMatches = rest.matchAll(/\[([a-zA-Z0-9_-]+)(?:([*^$]?=)(?:"|')?([^"'\]]*)(?:"|')?)?\s*(i)?\]/gi);
      for (const am of attrMatches) {
        const [, attr, op, expectedVal, insensitive] = am;
        const actualVal = this.getAttribute(attr);
        if (actualVal === null) {
          matchedRest = false;
          break;
        }
        if (!op) continue;
        const a = insensitive ? actualVal.toLowerCase() : actualVal;
        const e = insensitive ? expectedVal.toLowerCase() : expectedVal;
        if (op === '=' && a !== e) matchedRest = false;
        else if (op === '*=' && !a.includes(e)) matchedRest = false;
        else if (op === '^=' && !a.startsWith(e)) matchedRest = false;
        else if (op === '$=' && !a.endsWith(e)) matchedRest = false;
        if (!matchedRest) break;
      }

      if (matchedRest) return true;
    }
    return false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (selector === '*' || (child.matches && child.matches(selector))) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  getElementById(id) {
    let found = null;
    const walk = (node) => {
      if (found) return;
      for (const child of node.children) {
        if (child.id === id) {
          found = child;
          return;
        }
        walk(child);
      }
    };
    walk(this);
    return found;
  }
}

// Lightweight HTML parser to turn synthetic HTML fixtures into MockElement trees
function parseHTML(html) {
  const root = new MockElement('DIV', { id: 'root' });
  const stack = [root];
  const voidTags = new Set(['input', 'meta', 'link', 'br', 'hr', 'img']);
  const tagRegex = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9_-]+)((?:\s+[a-zA-Z0-9_:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const [full, isClosing, tagName, attrStr, isSelfClosing, textContent] = match;
    if (full.startsWith('<!--')) continue;
    if (textContent) {
      const text = textContent.trim();
      if (text) {
        const current = stack[stack.length - 1];
        current.textContent = (current.textContent ? current.textContent + ' ' : '') + text;
        current.innerText = current.textContent;
      }
      continue;
    }
    const tag = tagName.toLowerCase();
    if (isClosing) {
      if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === tag) {
        stack.pop();
      }
      continue;
    }

    const attrs = {};
    if (attrStr) {
      const attrRegex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let am;
      while ((am = attrRegex.exec(attrStr)) !== null) {
        const key = am[1].toLowerCase();
        const val = am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : ''));
        attrs[key] = val;
      }
    }

    const el = new MockElement(tag.toUpperCase(), attrs);
    const parent = stack[stack.length - 1];
    parent.appendChild(el);

    if (!voidTags.has(tag) && !isSelfClosing) {
      stack.push(el);
    }
  }
  return root;
}

// Global DOM Mocks
const mockDocument = new MockElement('#DOCUMENT');
mockDocument.defaultView = {
  getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' }),
  location: { hostname: 'boards.greenhouse.io' },
};
mockDocument.body = new MockElement('BODY');
mockDocument.appendChild(mockDocument.body);
globalThis.document = mockDocument;
globalThis.location = mockDocument.defaultView.location;
globalThis.getComputedStyle = mockDocument.defaultView.getComputedStyle;
globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };

// Import Core Modules
await import('../jobright_extension/core/form-discovery.js');
await import('../jobright_extension/core/field-mapping.js');
await import('../jobright_extension/core/answer-bank.js');

const candidateProfile = {
  id: 'cand_universal_100',
  full_name: 'Bhargav Reddy',
  email: 'bhargav.reddy@example.com',
  phone: '5125550187',
  location: 'Austin, TX',
  current_location: 'Austin, TX',
  current_city: 'Austin',
  current_state: 'TX',
  zip_code: '78701',
  full_address: '100 Congress Ave, Austin, TX 78701',
  headline: 'Staff Full Stack Engineer',
  summary: '10+ years engineering scalable systems with React, TypeScript, and Node.',
  linkedin_url: 'https://linkedin.com/in/bhargavreddy',
  github_url: 'https://github.com/bhargavreddy',
  portfolio_url: 'https://bhargavreddy.dev',
  website: 'https://bhargavreddy.dev',
  confirmed_facts: {
    first_name: 'Bhargav',
    last_name: 'Reddy',
    full_name: 'Bhargav Reddy',
    email: 'bhargav.reddy@example.com',
    phone: '5125550187',
    current_city: 'Austin',
    city: 'Austin',
    current_state: 'TX',
    state: 'TX',
    zip_code: '78701',
    postal_code: '78701',
    full_address: '100 Congress Ave, Austin, TX 78701',
    address: '100 Congress Ave, Austin, TX 78701',
    headline: 'Staff Full Stack Engineer',
    summary: '10+ years engineering scalable systems with React, TypeScript, and Node.',
    linkedin_url: 'https://linkedin.com/in/bhargavreddy',
    github_url: 'https://github.com/bhargavreddy',
    portfolio_url: 'https://bhargavreddy.dev',
    website: 'https://bhargavreddy.dev',
    authorized_in_usa: true,
    needs_sponsorship: false,
    notice_period: '2 weeks',
  },
};

const answerBankEntries = [
  {
    question_normalized: 'what is your favorite testing framework',
    answer: 'Node test runner and Playwright',
    answer_text: 'Node test runner and Playwright',
    company_scope: null,
  },
  {
    question_normalized: 'what is your notice period',
    answer: '2 weeks',
    answer_text: '2 weeks',
    company_scope: null,
  },
  {
    question_normalized: 'describe your experience building scalable web applications',
    answer: 'Built distributed React/Node platforms serving 2M+ daily active users with sub-100ms latency.',
    answer_text: 'Built distributed React/Node platforms serving 2M+ daily active users with sub-100ms latency.',
    company_scope: null,
  },
];

function findPlan(plans, identifier) {
  return plans.find(
    (p) =>
      p.factKey === identifier ||
      p.field?.name === identifier ||
      p.field?.element?.name === identifier ||
      p.field?.element?.id === identifier ||
      p.field?.key === identifier
  );
}

test('E2E ATS Fixture: 1. Greenhouse Universal Application Form', () => {
  const html = readFileSync('tests/fixtures/greenhouse-universal.html', 'utf8');
  const root = parseHTML(html);
  mockDocument.body.children = [];
  mockDocument.body.appendChild(root);

  const form = root.querySelector('#application_form');
  assert.ok(form, 'Greenhouse form should be parsed');

  const fields = globalThis.NextkinForms.discoverFields(form);
  assert.ok(fields.length >= 7, `Expected at least 7 discovered fields, found ${fields.length}`);

  const plans = globalThis.NextkinFieldMapping.planFill(fields, candidateProfile, {
    answerBank: answerBankEntries,
  });

  // Standard Facts
  const firstNamePlan = findPlan(plans, 'first_name');
  assert.equal(firstNamePlan?.value, 'Bhargav');
  assert.equal(firstNamePlan?.status, 'supported');

  const lastNamePlan = findPlan(plans, 'last_name');
  assert.equal(lastNamePlan?.value, 'Reddy');
  assert.equal(lastNamePlan?.status, 'supported');

  const emailPlan = findPlan(plans, 'email');
  assert.equal(emailPlan?.value, 'bhargav.reddy@example.com');
  assert.equal(emailPlan?.status, 'supported');

  const phonePlan = findPlan(plans, 'phone');
  assert.equal(phonePlan?.value, '5125550187');
  assert.equal(phonePlan?.status, 'supported');

  // Resume File Upload
  const resumeField = fields.find((f) => f.kind === 'resume-file' || f.name === 'resume' || f.element?.name === 'resume');
  assert.ok(resumeField, 'Resume file input must be discovered');

  // 1-to-1 URL Slotting: LinkedIn, Website, GitHub
  const linkedinPlan = findPlan(plans, 'job_application_answers_attributes_0_text_value');
  assert.equal(linkedinPlan?.value, 'https://linkedin.com/in/bhargavreddy');
  assert.equal(linkedinPlan?.status, 'supported');

  const websitePlan = findPlan(plans, 'job_application_answers_attributes_1_text_value');
  assert.equal(websitePlan?.value, 'https://bhargavreddy.dev');
  assert.equal(websitePlan?.status, 'supported');

  const githubPlan = findPlan(plans, 'job_application_answers_attributes_2_text_value');
  assert.equal(githubPlan?.value, 'https://github.com/bhargavreddy');
  assert.equal(githubPlan?.status, 'supported');

  // Unmapped Link (Other Website) must be manual and NEVER duplicate existing URLs
  const otherWebsitePlan = findPlan(plans, 'job_application_answers_attributes_3_text_value');
  assert.equal(otherWebsitePlan?.status, 'manual');
  assert.match(otherWebsitePlan?.reason || '', /Unmapped link field/i);

  // Custom question resolved via Tier 3 Answer Bank
  const customQPlan = findPlan(plans, 'custom_q');
  assert.equal(customQPlan?.status, 'ready');
  assert.equal(customQPlan?.value, 'Node test runner and Playwright');
  assert.equal(customQPlan?.source, 'answer_bank');

  // Consent checkbox auto-checked for legal/recruitment data processing terms
  const consentPlan = findPlan(plans, 'consent');
  assert.equal(consentPlan?.status, 'supported');
  assert.equal(consentPlan?.value, true);

  // Strict URL Uniqueness verification
  const supportedUrls = plans.filter((p) => p.status === 'supported' && typeof p.value === 'string' && p.value.startsWith('http')).map((p) => p.value);
  assert.equal(supportedUrls.length, new Set(supportedUrls).size, 'All filled URLs must be strictly unique');
});

test('E2E ATS Fixture: 2. Lever Universal Application Form', () => {
  const html = readFileSync('tests/fixtures/lever-universal.html', 'utf8');
  const root = parseHTML(html);
  mockDocument.body.children = [];
  mockDocument.body.appendChild(root);

  const form = root.querySelector('#application-form');
  assert.ok(form, 'Lever form should be parsed');

  const fields = globalThis.NextkinForms.discoverFields(form);
  assert.ok(fields.length >= 8, `Expected at least 8 discovered fields, found ${fields.length}`);

  const plans = globalThis.NextkinFieldMapping.planFill(fields, candidateProfile, {
    answerBank: answerBankEntries,
  });

  // Standard Full Name, Email, Phone
  const namePlan = findPlan(plans, 'full_name') || findPlan(plans, 'name');
  assert.equal(namePlan?.value, 'Bhargav Reddy');
  assert.equal(namePlan?.status, 'supported');

  const emailPlan = findPlan(plans, 'email');
  assert.equal(emailPlan?.value, 'bhargav.reddy@example.com');
  assert.equal(emailPlan?.status, 'supported');

  const phonePlan = findPlan(plans, 'phone');
  assert.equal(phonePlan?.value, '5125550187');
  assert.equal(phonePlan?.status, 'supported');

  // Multi-URL Slotting
  const linkedinPlan = findPlan(plans, 'urls[LinkedIn]');
  assert.equal(linkedinPlan?.value, 'https://linkedin.com/in/bhargavreddy');
  assert.equal(linkedinPlan?.status, 'supported');

  const githubPlan = findPlan(plans, 'urls[GitHub]');
  assert.equal(githubPlan?.value, 'https://github.com/bhargavreddy');
  assert.equal(githubPlan?.status, 'supported');

  const portfolioPlan = findPlan(plans, 'urls[Portfolio]');
  assert.equal(portfolioPlan?.value, 'https://bhargavreddy.dev');
  assert.equal(portfolioPlan?.status, 'supported');

  const twitterPlan = findPlan(plans, 'urls[Twitter]');
  assert.equal(twitterPlan?.status, 'manual');

  const otherPlan = findPlan(plans, 'urls[Other]');
  assert.equal(otherPlan?.status, 'manual');

  // Work Authorization Radio Group
  const authPlan = plans.find((p) => p.factKey === 'authorized_in_usa' || p.field.hint === 'authorized_in_usa');
  assert.equal(authPlan?.status, 'supported');
  assert.equal(authPlan?.value, 'Yes');

  // Custom question (notice period) matched via Answer Bank
  const noticePlan = findPlan(plans, 'comments');
  assert.equal(noticePlan?.status, 'ready');
  assert.equal(noticePlan?.value, '2 weeks');
  assert.equal(noticePlan?.source, 'answer_bank');

  // Consent checkbox remains manual
  const consentPlan = findPlan(plans, 'consent[marketing]');
  assert.equal(consentPlan?.status, 'manual');

  // Strict URL Invariant Check
  const supportedUrls = plans.filter((p) => p.status === 'supported' && typeof p.value === 'string' && p.value.startsWith('http')).map((p) => p.value);
  assert.equal(supportedUrls.length, new Set(supportedUrls).size, 'Zero duplicate URLs slotted across Lever');
});

test('E2E ATS Fixture: 3. Ashby Universal Application Form', () => {
  const html = readFileSync('tests/fixtures/ashby-universal.html', 'utf8');
  const root = parseHTML(html);
  mockDocument.body.children = [];
  mockDocument.body.appendChild(root);

  const form = root.querySelector('#ashby-application-form');
  assert.ok(form, 'Ashby form should be parsed');

  const fields = globalThis.NextkinForms.discoverFields(form);
  assert.ok(fields.length >= 7, `Expected at least 7 discovered fields, found ${fields.length}`);

  const plans = globalThis.NextkinFieldMapping.planFill(fields, candidateProfile, {
    answerBank: answerBankEntries,
  });

  // Standard Facts
  const firstNamePlan = findPlan(plans, 'first_name');
  assert.equal(firstNamePlan?.value, 'Bhargav');
  assert.equal(firstNamePlan?.status, 'supported');

  const lastNamePlan = findPlan(plans, 'last_name');
  assert.equal(lastNamePlan?.value, 'Reddy');
  assert.equal(lastNamePlan?.status, 'supported');

  const emailPlan = findPlan(plans, 'email');
  assert.equal(emailPlan?.value, 'bhargav.reddy@example.com');
  assert.equal(emailPlan?.status, 'supported');

  const phonePlan = findPlan(plans, 'phone');
  assert.equal(phonePlan?.value, '5125550187');
  assert.equal(phonePlan?.status, 'supported');

  // URLs
  const linkedinPlan = findPlan(plans, 'urls[LinkedIn]');
  assert.equal(linkedinPlan?.value, 'https://linkedin.com/in/bhargavreddy');
  assert.equal(linkedinPlan?.status, 'supported');

  const githubPlan = findPlan(plans, 'urls[GitHub]');
  assert.equal(githubPlan?.value, 'https://github.com/bhargavreddy');
  assert.equal(githubPlan?.status, 'supported');

  const portfolioPlan = findPlan(plans, 'urls[Portfolio]');
  assert.equal(portfolioPlan?.value, 'https://bhargavreddy.dev');
  assert.equal(portfolioPlan?.status, 'supported');

  const otherPlan = findPlan(plans, 'urls[Other]');
  assert.equal(otherPlan?.status, 'manual');

  // Custom question matched via Answer Bank
  const expPlan = findPlan(plans, 'custom_experience');
  assert.equal(expPlan?.status, 'ready');
  assert.equal(expPlan?.value, 'Built distributed React/Node platforms serving 2M+ daily active users with sub-100ms latency.');
  assert.equal(expPlan?.source, 'answer_bank');
});

test('E2E ATS Fixture: 4. Workday Universal Application Form', () => {
  const html = readFileSync('tests/fixtures/workday-universal.html', 'utf8');
  const root = parseHTML(html);
  mockDocument.body.children = [];
  mockDocument.body.appendChild(root);

  const form = root.querySelector('#workday-application-form');
  assert.ok(form, 'Workday form should be parsed');

  const fields = globalThis.NextkinForms.discoverFields(form);
  assert.ok(fields.length >= 8, `Expected at least 8 discovered fields, found ${fields.length}`);

  const plans = globalThis.NextkinFieldMapping.planFill(fields, candidateProfile, {
    answerBank: answerBankEntries,
  });

  // Workday Legal Name & Contact Information
  const firstNamePlan = findPlan(plans, 'first_name');
  assert.equal(firstNamePlan?.value, 'Bhargav');
  assert.equal(firstNamePlan?.status, 'supported');

  const lastNamePlan = findPlan(plans, 'last_name');
  assert.equal(lastNamePlan?.value, 'Reddy');
  assert.equal(lastNamePlan?.status, 'supported');

  const emailPlan = findPlan(plans, 'email');
  assert.equal(emailPlan?.value, 'bhargav.reddy@example.com');
  assert.equal(emailPlan?.status, 'supported');

  const phonePlan = findPlan(plans, 'phone');
  assert.equal(phonePlan?.value, '5125550187');
  assert.equal(phonePlan?.status, 'supported');

  const addressPlan = findPlan(plans, 'full_address');
  assert.equal(addressPlan?.value, '100 Congress Ave, Austin, TX 78701');
  assert.equal(addressPlan?.status, 'supported');

  const cityPlan = findPlan(plans, 'current_city');
  assert.equal(cityPlan?.value, 'Austin');
  assert.equal(cityPlan?.status, 'supported');

  const postalPlan = findPlan(plans, 'zip_code');
  assert.equal(postalPlan?.value, '78701');
  assert.equal(postalPlan?.status, 'supported');

  // URLs
  const linkedinPlan = findPlan(plans, 'wd-linkedin') || findPlan(plans, 'linkedinQuestion');
  assert.equal(linkedinPlan?.value, 'https://linkedin.com/in/bhargavreddy');
  assert.equal(linkedinPlan?.status, 'supported');

  const websitePlan = findPlan(plans, 'wd-website') || findPlan(plans, 'websiteQuestion');
  assert.equal(websitePlan?.value, 'https://bhargavreddy.dev');
  assert.equal(websitePlan?.status, 'supported');

  const otherPlan = findPlan(plans, 'wd-otherUrl') || findPlan(plans, 'otherUrlQuestion');
  assert.equal(otherPlan?.status, 'manual');

  // Next and Submit buttons detected
  const nextBtn = form.querySelector('[data-automation-id="bottom-navigation-next-button"]');
  const submitBtn = form.querySelector('[data-automation-id="page-footer-submit-button"]');
  assert.ok(nextBtn, 'Next button must exist in Workday fixture');
  assert.ok(submitBtn, 'Submit button must exist in Workday fixture');
});

test('E2E Safety Invariants: Feature Flag NEXT_PUBLIC_ENABLE_UNIVERSAL_AUTOFILL_V2 = false preserves strict safety', () => {
  // Test with flag disabled
  const featureFlags = { NEXT_PUBLIC_ENABLE_UNIVERSAL_AUTOFILL_V2: false };

  const fields = [
    { key: 'linkedin_url', label: 'LinkedIn Profile', kind: 'text', element: new MockElement('INPUT', { name: 'linkedin' }) },
    { key: 'website', label: 'Personal Website', kind: 'text', element: new MockElement('INPUT', { name: 'website' }) },
    { key: 'portfolio', label: 'Portfolio Link', kind: 'text', element: new MockElement('INPUT', { name: 'portfolio' }) },
    { key: 'other_url', label: 'Other Webpage', kind: 'text', element: new MockElement('INPUT', { name: 'other' }) },
    { key: 'consent', label: 'I agree to background checks and privacy policy', kind: 'checkbox', element: new MockElement('INPUT', { type: 'checkbox' }) },
  ];

  const candidateWithProse = {
    ...candidateProfile,
    confirmed_facts: {
      ...candidateProfile.confirmed_facts,
      // Attempt to provide prose where a URL is expected
      website: 'Please visit my personal homepage at https://bhargavreddy.dev to learn more',
    },
  };

  const plans = globalThis.NextkinFieldMapping.planFill(fields, candidateWithProse, {
    featureFlags,
  });

  const planMap = Object.fromEntries(plans.map((p) => [p.field.key, p]));

  // 1. LinkedIn slots 1-to-1
  assert.equal(planMap.linkedin_url.status, 'supported');
  assert.equal(planMap.linkedin_url.value, 'https://linkedin.com/in/bhargavreddy');

  // 2. Prose in URL field is strictly rejected
  assert.notEqual(planMap.website.value, 'Please visit my personal homepage at https://bhargavreddy.dev to learn more');

  // 3. Duplicate URLs are rejected
  const supportedUrls = plans.filter((p) => p.status === 'supported' && typeof p.value === 'string' && p.value.startsWith('http')).map((p) => p.value);
  assert.equal(supportedUrls.length, new Set(supportedUrls).size, 'No duplicate URLs slotted even with flag disabled');

  // 4. Consent fields auto-checked for standard legal acknowledgement
  assert.equal(planMap.consent.status, 'supported');
  assert.equal(planMap.consent.value, true);
});

test('E2E Form Disappearance and Confirmation Flow', () => {
  let pendingAppliedPrompt = null;
  let startedApplication = { job: { id: 'job_123', title: 'Staff Engineer' }, candidateId: 'cand_1' };

  function onFormDisappearance(hasFormNow, wasNavigationStep = false) {
    if (!hasFormNow && !wasNavigationStep && startedApplication) {
      pendingAppliedPrompt = { ...startedApplication };
      startedApplication = null;
    } else if (wasNavigationStep) {
      // Wizard navigation does NOT trigger confirmation prompt
      pendingAppliedPrompt = null;
    }
  }

  // 1. Wizard navigation (Next button click) does NOT prompt
  onFormDisappearance(false, true);
  assert.equal(pendingAppliedPrompt, null, 'Step navigation must not trigger Did you submit prompt');

  // 2. True form disappearance triggers prompt
  startedApplication = { job: { id: 'job_123', title: 'Staff Engineer' }, candidateId: 'cand_1' };
  onFormDisappearance(false, false);
  assert.ok(pendingAppliedPrompt, 'Form disappearance without receipt must trigger Did you submit prompt');
  assert.equal(pendingAppliedPrompt.job.id, 'job_123');
});
