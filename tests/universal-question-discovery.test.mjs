import test from 'node:test';
import assert from 'node:assert/strict';

// Set up mock DOM environment
class MockNode {
  constructor(tagName = 'DIV', attrs = {}, text = '') {
    this.tagName = tagName.toUpperCase();
    this.attrs = {};
    for (const [k, v] of Object.entries(attrs)) {
      this.attrs[k.toLowerCase()] = String(v);
    }
    this.children = [];
    this.parentElement = null;
    this.textContent = text;
    this.disabled = !!attrs.disabled;
    this.readOnly = !!attrs.readonly;
    this.shadowRoot = null;
    this._value = attrs.value || '';
    this._ownerDocument = null;
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
  get type() { return this.getAttribute('type') || ''; }
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
    const parts = selector.split(',').map(s => s.trim());
    for (const part of parts) {
      if (!part) continue;
      // Compound selector like button[data-option] or input[type="file"]
      const tagMatch = part.match(/^([a-zA-Z0-9_-]+)?(.*)$/);
      const tag = tagMatch ? tagMatch[1] : null;
      const rest = tagMatch ? tagMatch[2] : '';

      if (tag && tag !== '*' && tag.toUpperCase() !== this.tagName) {
        continue;
      }

      if (!rest) {
        return true;
      }

      // Check classes and attributes
      let matchedRest = true;
      // Match #id
      const idMatch = rest.match(/#([a-zA-Z0-9_-]+)/);
      if (idMatch && this.id !== idMatch[1]) {
        matchedRest = false;
      }

      // Match .class
      const classMatches = rest.matchAll(/\.([a-zA-Z0-9_-]+)/g);
      for (const cm of classMatches) {
        const classes = (this.getAttribute('class') || '').split(/\s+/);
        if (!classes.includes(cm[1])) {
          matchedRest = false;
          break;
        }
      }

      // Match [attr...], e.g. [role="group"], [data-testid*="checkbox" i], etc.
      const attrMatches = rest.matchAll(/\[([a-zA-Z0-9_-]+)(?:([*^$]?=)(?:"|')?([^"'\]]*)(?:"|')?)?\s*(i)?\]/gi);
      for (const am of attrMatches) {
        const [, attr, op, expectedVal, insensitive] = am;
        const actualVal = this.getAttribute(attr);
        if (actualVal === null) {
          matchedRest = false;
          break;
        }
        if (!op) continue; // Just existence check [attr]
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
    const walk = node => {
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
    const walk = node => {
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

function createElement(tagName, attrs = {}, text = '') {
  return new MockNode(tagName, attrs, text);
}

// Global DOM mocks
const mockDocument = createElement('#document');
mockDocument.defaultView = {
  getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' }),
  location: { hostname: 'jobs.lever.co' }
};
mockDocument.body = createElement('BODY');
mockDocument.appendChild(mockDocument.body);
globalThis.document = mockDocument;
globalThis.location = mockDocument.defaultView.location;
globalThis.getComputedStyle = mockDocument.defaultView.getComputedStyle;

// Import form-discovery module
await import('../jobright_extension/core/form-discovery.js');

test('1. Sibling radio and checkbox options inside fieldset > legend or [role="group"] are grouped into one Question field', () => {
  const container = createElement('DIV');
  mockDocument.body.children = [];
  mockDocument.body.appendChild(container);

  // Group 1: fieldset with legend and 5 radio options
  const radioFieldset = createElement('FIELDSET');
  const radioLegend = createElement('LEGEND', {}, 'Work Authorization');
  radioFieldset.appendChild(radioLegend);

  const authOptions = ['US Citizen', 'Permanent Resident', 'H1B Visa', 'F1 OPT', 'Other'];
  for (let i = 0; i < authOptions.length; i++) {
    const optText = authOptions[i];
    const radio = createElement('INPUT', { type: 'radio', name: 'work_auth', value: optText });
    const label = createElement('LABEL', {}, optText);
    label.appendChild(radio);
    radioFieldset.appendChild(label);
  }
  container.appendChild(radioFieldset);

  // Group 2: [role="group"][aria-label="Race/Ethnicity"] with 4 checkbox options
  const checkGroup = createElement('DIV', { role: 'group', 'aria-label': 'Race and Ethnicity' });
  const ethOptions = ['Asian', 'Black or African American', 'White', 'Hispanic or Latino'];
  for (let i = 0; i < ethOptions.length; i++) {
    const optText = ethOptions[i];
    const check = createElement('INPUT', { type: 'checkbox', name: 'ethnicity', value: optText });
    const label = createElement('LABEL', {}, optText);
    label.appendChild(check);
    checkGroup.appendChild(label);
  }
  container.appendChild(checkGroup);

  const fields = globalThis.NextkinForms.discoverFields(container);

  // Assertions for Radio Group
  const radioQuestion = fields.find(f => f.label === 'Work Authorization');
  assert.ok(radioQuestion, 'Expected a single question for "Work Authorization"');
  assert.equal(radioQuestion.kind, 'choice', 'Radio group should have kind: choice');
  assert.equal(radioQuestion.options.length, 5, 'Radio group should have 5 options');
  assert.equal(radioQuestion.elements.length, 5, 'Radio question elements array should have all 5 radio inputs');

  // Assertions for Checkbox Group
  const checkQuestion = fields.find(f => f.label === 'Race and Ethnicity');
  assert.ok(checkQuestion, 'Expected a single question for "Race and Ethnicity"');
  assert.equal(checkQuestion.kind, 'checkbox-group', 'Checkbox group should have kind: checkbox-group');
  assert.equal(checkQuestion.options.length, 4, 'Checkbox group should have 4 options');
  assert.equal(checkQuestion.elements.length, 4, 'Checkbox question elements array should have all 4 checkbox inputs');
});

test('2. A lone checkbox ("I agree to terms") under a generic legend retains its own specific label rather than the fieldset legend', () => {
  const container = createElement('DIV');
  mockDocument.body.children = [];
  mockDocument.body.appendChild(container);

  const termsFieldset = createElement('FIELDSET');
  const termsLegend = createElement('LEGEND', {}, 'Terms and Agreements');
  termsFieldset.appendChild(termsLegend);

  const termsCheck = createElement('INPUT', { type: 'checkbox', id: 'terms-check', name: 'agree_terms', value: '1' });
  const termsLabel = createElement('LABEL', { for: 'terms-check' }, 'I agree to terms');
  termsFieldset.appendChild(termsCheck);
  termsFieldset.appendChild(termsLabel);
  container.appendChild(termsFieldset);

  const fields = globalThis.NextkinForms.discoverFields(container);
  assert.equal(fields.length, 1, 'Group of one should produce exactly one field');
  assert.equal(fields[0].label, 'I agree to terms', 'Lone checkbox must retain its own specific label rather than generic legend');
  assert.equal(fields[0].kind, 'checkbox', 'Lone checkbox must have kind: checkbox, not checkbox-group');
});

test('3. A page with both an application form (containing resume file input) and a job alert form only returns fields from the application form', () => {
  mockDocument.body.children = [];

  // Job Alert Form (should be excluded)
  const alertForm = createElement('FORM', { id: 'job-alert-form', class: 'job-alert' });
  const alertEmail = createElement('INPUT', { type: 'email', name: 'alert_email', id: 'alert-email' });
  const alertLabel = createElement('LABEL', { for: 'alert-email' }, 'Get Job Alerts');
  const alertButton = createElement('BUTTON', { type: 'submit' }, 'Subscribe');
  alertForm.appendChild(alertLabel);
  alertForm.appendChild(alertEmail);
  alertForm.appendChild(alertButton);
  mockDocument.body.appendChild(alertForm);

  // Application Form (should be scoped to)
  const appForm = createElement('FORM', { id: 'application-form', class: 'application-form' });
  const nameInput = createElement('INPUT', { type: 'text', name: 'full_name', id: 'candidate-name' });
  const nameLabel = createElement('LABEL', { for: 'candidate-name' }, 'Full Name');
  const emailInput = createElement('INPUT', { type: 'email', name: 'email', id: 'candidate-email' });
  const emailLabel = createElement('LABEL', { for: 'candidate-email' }, 'Email');
  const resumeInput = createElement('INPUT', { type: 'file', name: 'resume', id: 'resume-upload' });
  const resumeLabel = createElement('LABEL', { for: 'resume-upload' }, 'Upload Resume / CV');
  const submitButton = createElement('BUTTON', { type: 'submit' }, 'Submit Application');

  appForm.appendChild(nameLabel);
  appForm.appendChild(nameInput);
  appForm.appendChild(emailLabel);
  appForm.appendChild(emailInput);
  appForm.appendChild(resumeLabel);
  appForm.appendChild(resumeInput);
  appForm.appendChild(submitButton);
  mockDocument.body.appendChild(appForm);

  // scopeToApplication should resolve to the appForm
  assert.ok(typeof globalThis.NextkinForms.scopeToApplication === 'function', 'scopeToApplication should be exported');
  const scopedContainer = globalThis.NextkinForms.scopeToApplication(mockDocument);
  assert.equal(scopedContainer, appForm, 'scopeToApplication should return application form container');

  // discoverFields should only return fields from the application form
  const fields = globalThis.NextkinForms.discoverFields(mockDocument);
  const fieldNames = fields.map(f => f.element.name || f.element.id);
  assert.ok(fieldNames.includes('full_name') || fieldNames.includes('candidate-name'), 'Should include candidate name');
  assert.ok(fieldNames.includes('email') || fieldNames.includes('candidate-email'), 'Should include candidate email');
  assert.ok(fields.some(f => f.kind === 'resume-file'), 'Should include resume file input');
  assert.ok(!fieldNames.includes('alert_email') && !fieldNames.includes('alert-email'), 'Should NOT include job alert fields');
});

test('4. On a form without a file input (Step 2 of a multi-step wizard), scoping falls back cleanly to the active form container without dropping fields', () => {
  mockDocument.body.children = [];

  // Search/nav form (should be ignored)
  const searchForm = createElement('FORM', { role: 'search', id: 'site-search' });
  const searchInput = createElement('INPUT', { type: 'text', name: 'q' });
  searchForm.appendChild(searchInput);
  mockDocument.body.appendChild(searchForm);

  // Step 2 Wizard Form with Next / Continue action (no resume input)
  const step2Form = createElement('FORM', { id: 'step-2-form', class: 'application-step' });
  const salaryInput = createElement('INPUT', { type: 'text', name: 'desired_salary', id: 'salary-input' });
  const salaryLabel = createElement('LABEL', { for: 'salary-input' }, 'Desired Salary');
  const startDateInput = createElement('INPUT', { type: 'text', name: 'start_date', id: 'start-date-input' });
  const startDateLabel = createElement('LABEL', { for: 'start-date-input' }, 'Earliest Start Date');
  const nextButton = createElement('BUTTON', { type: 'button', class: 'btn-next' }, 'Save & Continue');

  step2Form.appendChild(salaryLabel);
  step2Form.appendChild(salaryInput);
  step2Form.appendChild(startDateLabel);
  step2Form.appendChild(startDateInput);
  step2Form.appendChild(nextButton);
  mockDocument.body.appendChild(step2Form);

  const scopedContainer = globalThis.NextkinForms.scopeToApplication(mockDocument);
  assert.equal(scopedContainer, step2Form, 'scopeToApplication should fall back to active step form with step navigation');

  const fields = globalThis.NextkinForms.discoverFields(mockDocument);
  assert.equal(fields.length, 2, 'Should discover both application step fields without dropping');
  assert.ok(fields.some(f => f.label === 'Desired Salary'), 'Should include Desired Salary');
  assert.ok(fields.some(f => f.label === 'Earliest Start Date'), 'Should include Earliest Start Date');
  assert.ok(!fields.some(f => f.element.name === 'q'), 'Should NOT include search input');
});
