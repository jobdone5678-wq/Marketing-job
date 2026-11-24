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

  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }

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
    return root.tagName === '#DOCUMENT' ? root : globalThis.document;
  }

  appendChild(child) {
    if (!child) return child;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  contains(other) {
    let curr = other;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  matches(sel) {
    if (!sel) return false;
    const parts = sel.split(',').map(s => s.trim());
    return parts.some(p => this._matchesSingle(p));
  }

  _matchesSingle(sel) {
    if (sel === '*') return true;
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      const classes = (this.getAttribute('class') || '').split(/\s+/);
      return classes.includes(cls);
    }
    if (sel.startsWith('#')) {
      return this.id === sel.slice(1);
    }
    if (sel.includes('[for=')) {
      const match = sel.match(/\[for=["']?([^"'\]]+)["']?\]/i);
      if (match) return (this.getAttribute('for') || '').toLowerCase() === match[1].toLowerCase();
    }
    if (sel.includes('[class*=')) {
      const match = sel.match(/\[class\*=["']?([^"'\]]+)["']?\s*(?:i)?\]/i);
      if (match) {
        const needle = match[1].toLowerCase();
        const haystack = (this.getAttribute('class') || '').toLowerCase();
        return haystack.includes(needle);
      }
    }
    if (sel.includes('[data-automation-id*=')) {
      const match = sel.match(/\[data-automation-id\*=["']?([^"'\]]+)["']?\s*(?:i)?\]/i);
      if (match) {
        const needle = match[1].toLowerCase();
        const haystack = (this.getAttribute('data-automation-id') || '').toLowerCase();
        return haystack.includes(needle);
      }
    }
    if (sel.includes('[type=')) {
      const match = sel.match(/\[type=["']?([^"'\]]+)["']?\]/i);
      if (match) return (this.getAttribute('type') || '').toLowerCase() === match[1].toLowerCase();
    }
    if (sel === 'input' || sel === 'INPUT') return this.tagName === 'INPUT';
    if (sel === 'button' || sel === 'BUTTON') return this.tagName === 'BUTTON';
    if (sel === 'form' || sel === 'FORM') return this.tagName === 'FORM';
    if (sel === 'main' || sel === 'MAIN') return this.tagName === 'MAIN';
    if (sel === '[role="main"]') return this.getAttribute('role') === 'main';
    if (sel.toUpperCase() === this.tagName) return true;
    return false;
  }

  closest(sel) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(sel)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const found = [];
    const walk = node => {
      for (const child of node.children) {
        if (child.matches && child.matches(sel)) {
          found.push(child);
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

const mockDocument = createElement('#document');
mockDocument.defaultView = {
  getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' }),
  location: { hostname: 'jobs.ashbyhq.com' }
};
mockDocument.body = createElement('BODY');
mockDocument.appendChild(mockDocument.body);
globalThis.document = mockDocument;
globalThis.location = mockDocument.defaultView.location;
globalThis.getComputedStyle = mockDocument.defaultView.getComputedStyle;

// Import form-discovery module
await import('../jobright_extension/core/form-discovery.js');

test('Ashby div-based form scoping does not trap on ashby-application-form-input-file leaf container', () => {
  mockDocument.body.children = [];

  // Outermost Ashby form container
  const appContainer = createElement('DIV', {
    class: '_jobPostingForm_5yu8i_402 ashby-application-form-container _container_f7cvd_28',
    id: 'form'
  });

  // Name entry
  const nameEntry = createElement('DIV', { class: '_fieldEntry_1e3gg_28 ashby-application-form-field-entry' });
  const nameLabel = createElement('LABEL', { for: '_systemfield_name' }, 'Legal Name');
  const nameInput = createElement('INPUT', { type: 'text', name: '_systemfield_name', id: '_systemfield_name' });
  nameEntry.appendChild(nameLabel);
  nameEntry.appendChild(nameInput);
  appContainer.appendChild(nameEntry);

  // Email entry
  const emailEntry = createElement('DIV', { class: '_fieldEntry_1e3gg_28 ashby-application-form-field-entry' });
  const emailLabel = createElement('LABEL', { for: '_systemfield_email' }, 'Email');
  const emailInput = createElement('INPUT', { type: 'email', name: '_systemfield_email', id: '_systemfield_email' });
  emailEntry.appendChild(emailLabel);
  emailEntry.appendChild(emailInput);
  appContainer.appendChild(emailEntry);

  // Resume entry (nested inside leaf container with application-form substring in class)
  const resumeEntry = createElement('DIV', { class: '_fieldEntry_1e3gg_28 ashby-application-form-field-entry' });
  const resumeLabel = createElement('LABEL', { for: '_systemfield_resume' }, 'Resume');
  const resumeLeafWrapper = createElement('DIV', { class: '_container_10xk4_70 ashby-application-form-input-file' });
  const resumeFileInput = createElement('INPUT', { type: 'file', id: '_systemfield_resume', name: '' });
  resumeLeafWrapper.appendChild(resumeFileInput);
  resumeEntry.appendChild(resumeLabel);
  resumeEntry.appendChild(resumeLeafWrapper);
  appContainer.appendChild(resumeEntry);

  // Phone entry
  const phoneEntry = createElement('DIV', { class: '_fieldEntry_1e3gg_28 ashby-application-form-field-entry' });
  const phoneLabel = createElement('LABEL', { for: '_systemfield_phone' }, 'Phone Number');
  const phoneInput = createElement('INPUT', { type: 'tel', name: '_systemfield_phone', id: '_systemfield_phone' });
  phoneEntry.appendChild(phoneLabel);
  phoneEntry.appendChild(phoneInput);
  appContainer.appendChild(phoneEntry);

  // Submit button
  const submitButton = createElement('BUTTON', { type: 'submit' }, 'Submit Application');
  appContainer.appendChild(submitButton);

  mockDocument.body.appendChild(appContainer);

  const scoped = globalThis.NextkinForms.scopeToApplication(mockDocument);
  assert.notEqual(scoped, resumeLeafWrapper, 'scopeToApplication must NOT return the leaf resume wrapper');
  assert.equal(scoped, appContainer, 'scopeToApplication must return the outer application container');

  const fields = globalThis.NextkinForms.discoverFields(mockDocument);
  assert.equal(fields.length, 4, 'Must discover all 4 fields (Name, Email, Resume, Phone)');
  const fieldKeys = fields.map(f => f.element?.name || f.element?.id);
  assert.ok(fieldKeys.includes('_systemfield_name'), 'Must include Legal Name');
  assert.ok(fieldKeys.includes('_systemfield_email'), 'Must include Email');
  assert.ok(fieldKeys.includes('_systemfield_resume'), 'Must include Resume');
  assert.ok(fieldKeys.includes('_systemfield_phone'), 'Must include Phone');
});
