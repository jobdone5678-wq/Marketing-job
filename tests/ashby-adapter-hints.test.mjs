import test from 'node:test';
import assert from 'node:assert/strict';

// Import ats-adapters
await import('../jobright_extension/adapters/ats-adapters.js');

class MockElement {
  constructor(tagName = 'INPUT', attrs = {}, parent = null) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.id = attrs.id || '';
    this.name = attrs.name || '';
    this.parentElement = parent;
  }
  getAttribute(name) {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
  }
  closest(sel) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(sel)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }
  matches(sel) {
    if (sel.includes('[data-field-path]')) {
      return this.getAttribute('data-field-path') !== null;
    }
    if (sel.includes('.ashby-application-form-field-entry')) {
      return (this.getAttribute('class') || '').includes('ashby-application-form-field-entry');
    }
    return false;
  }
  querySelector(sel) {
    if (sel === 'label' && this._label) return this._label;
    return null;
  }
}

test('Ashby adapter resolves hints via name, id, data-field-path, and label-for', () => {
  const ashby = globalThis.NextkinAdapters.find(a => a.id === 'ashby');
  assert.ok(ashby, 'Ashby adapter must exist');

  // 1. Direct name
  const nameEl = new MockElement('INPUT', { name: '_systemfield_name' });
  assert.equal(ashby.hint(nameEl), 'full_name');

  const emailEl = new MockElement('INPUT', { name: '_systemfield_email' });
  assert.equal(ashby.hint(emailEl), 'email');

  const phoneEl = new MockElement('INPUT', { name: '_systemfield_phone' });
  assert.equal(ashby.hint(phoneEl), 'phone');

  // 2. data-field-path on parent entry when input name is blank
  const locEntry = new MockElement('DIV', {
    class: '_fieldEntry_1e3gg_28 ashby-application-form-field-entry',
    'data-field-path': '_systemfield_location'
  });
  const locInput = new MockElement('INPUT', {
    class: 'ashby-application-form-input-autocomplete',
    role: 'combobox'
  }, locEntry);
  assert.equal(ashby.hint(locInput), 'current_location', 'Input with parent data-field-path="_systemfield_location" must resolve to current_location');

  // 3. label for="_systemfield_location"
  const locEntryWithLabel = new MockElement('DIV', {
    class: '_fieldEntry_1e3gg_28 ashby-application-form-field-entry'
  });
  const labelEl = new MockElement('LABEL', { for: '_systemfield_location' });
  locEntryWithLabel._label = labelEl;
  const locInputWithLabel = new MockElement('INPUT', {}, locEntryWithLabel);
  assert.equal(ashby.hint(locInputWithLabel), 'current_location', 'Input with label for="_systemfield_location" must resolve to current_location');

  // 4. URL fields
  const linkedinEl = new MockElement('INPUT', { name: 'urls[LinkedIn]' });
  assert.equal(ashby.hint(linkedinEl), 'linkedin_url');

  const githubEl = new MockElement('INPUT', { name: 'urls[GitHub]' });
  assert.equal(ashby.hint(githubEl), 'github_url');
});
