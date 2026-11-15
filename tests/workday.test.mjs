import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bundleJs = fs.readFileSync('tests/autofill-bundle.js', 'utf8');

globalThis.location = { hostname: 'company.myworkdayjobs.com' };

// Load bundle in global environment
eval(bundleJs);

class MockNode {
  constructor(tagName = 'DIV') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.textContent = '';
    this.isConnected = true;
    this._value = '';
    this.disabled = false;
    this.readOnly = false;
    this.ownerDocument = {
      defaultView: {
        getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' })
      }
    };
  }
  getAttribute(name) { return this.attributes.has(name.toLowerCase()) ? this.attributes.get(name.toLowerCase()) : null; }
  setAttribute(name, val) { this.attributes.set(name.toLowerCase(), String(val)); }
  hasAttribute(name) { return this.attributes.has(name.toLowerCase()); }
  removeAttribute(name) { this.attributes.delete(name.toLowerCase()); }
  get value() { return this._value; }
  set value(v) { this._value = String(v ?? ''); }
  getClientRects() { return [{ width: 100, height: 20 }]; }
  getRootNode() {
    let curr = this;
    while (curr.parentElement) curr = curr.parentElement;
    return curr;
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
    if (!sel) return false;
    const parts = sel.split(',').map(s => s.trim());
    for (const p of parts) {
      if (p.toUpperCase() === this.tagName) return true;
      if (p.startsWith('#') && this.getAttribute('id') === p.slice(1)) return true;
      if (p.startsWith('.') && (this.getAttribute('class') || '').split(/\s+/).includes(p.slice(1))) return true;
      const attrMatch = p.match(/^\[([a-zA-Z0-9_-]+)([\*^$]?=)?["']?([^"']*)?["']?\]$/);
      if (attrMatch) {
        const [, attr, op, val] = attrMatch;
        const actual = this.getAttribute(attr);
        if (actual === null) continue;
        if (!op) return true;
        if (op === '=' && actual === val) return true;
        if (op === '*=' && actual.toLowerCase().includes((val || '').toLowerCase())) return true;
        if (op === '^=' && actual.startsWith(val)) return true;
        if (op === '$=' && actual.endsWith(val)) return true;
      }
    }
    return false;
  }
  querySelector(sel) {
    const list = this.querySelectorAll(sel);
    return list.length ? list[0] : null;
  }
  querySelectorAll(sel) {
    const results = [];
    const traverse = node => {
      for (const child of node.children) {
        if (child.matches && child.matches(sel)) results.push(child);
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  dispatchEvent() { return true; }
  focus() {}
  click() { return true; }
}

test('Workday ATS: Autofill handles full multi-step data-automation-id controls', async () => {
  const root = new MockNode('DIV');
  root.id = 'workday-app';

  // Helper to create Workday input
  function addWorkdayField(autoId, labelText, tag = 'INPUT', role = null) {
    const group = new MockNode('DIV');
    group.setAttribute('class', 'form-group');
    const label = new MockNode('LABEL');
    label.textContent = labelText;
    label.setAttribute('data-automation-id', 'formLabel');
    group.appendChild(label);

    const input = new MockNode(tag);
    input.setAttribute('data-automation-id', autoId);
    input.setAttribute('id', autoId);
    label.setAttribute('for', autoId);
    if (role) input.setAttribute('role', role);
    group.appendChild(input);
    root.appendChild(group);
    return input;
  }

  // Workday step 1 fields
  const fnInput = addWorkdayField('legalNameSection_firstName', 'First Name');
  const lnInput = addWorkdayField('legalNameSection_lastName', 'Last Name');
  const addrInput = addWorkdayField('addressSection_addressLine1', 'Address Line 1');
  const cityInput = addWorkdayField('addressSection_city', 'City');
  const stateInput = addWorkdayField('addressSection_countryRegion', 'State / Province', 'BUTTON', 'combobox');
  const zipInput = addWorkdayField('addressSection_postalCode', 'Postal Code');
  const emailInput = addWorkdayField('email', 'Email Address');
  const phoneInput = addWorkdayField('phone-number', 'Phone Number');
  const howHeard = addWorkdayField('source', 'How Did You Hear About Us?', 'BUTTON', 'combobox');
  const gender = addWorkdayField('gender', 'Gender', 'BUTTON', 'combobox');

  // Discover
  const fields = globalThis.NextkinForms.discoverFields(root);
  console.log('Workday discovered fields:', fields.map(f => ({ key: f.key, label: f.label, hint: f.hint })));
  assert.ok(fields.length >= 8, `Expected at least 8 fields, discovered ${fields.length}`);

  const candidate = {
    first_name: 'Bhargav',
    last_name: 'Reddy',
    full_address: '123 Tech Parkway',
    current_city: 'Austin',
    current_state: 'TX',
    zip_code: '78701',
    email: 'bhargav.reddy@example.com',
    phone: '5125550187',
    gender: 'Male'
  };

  const plans = globalThis.NextkinFieldMapping.planFill(fields, candidate);
  
  // Verify plans
  const fnPlan = plans.find(p => p.field.hint.includes('first_name') || p.field.label.includes('First Name'));
  assert.equal(fnPlan?.value, 'Bhargav');
  assert.equal(fnPlan?.status, 'supported');

  const lnPlan = plans.find(p => p.field.hint.includes('last_name') || p.field.label.includes('Last Name'));
  assert.equal(lnPlan?.value, 'Reddy');
  assert.equal(lnPlan?.status, 'supported');

  const emailPlan = plans.find(p => p.field.hint.includes('email') || p.field.label.includes('Email'));
  assert.equal(emailPlan?.value, 'bhargav.reddy@example.com');
  assert.equal(emailPlan?.status, 'supported');

  const phonePlan = plans.find(p => p.field.hint.includes('phone') || p.field.label.includes('Phone'));
  assert.equal(phonePlan?.value, '5125550187');
  assert.equal(phonePlan?.status, 'supported');

  const cityPlan = plans.find(p => p.field.hint.includes('current_city') || p.field.label.includes('City'));
  assert.equal(cityPlan?.value, 'Austin');
  assert.equal(cityPlan?.status, 'supported');

  const zipPlan = plans.find(p => p.field.hint.includes('zip_code') || p.field.label.includes('Postal Code'));
  assert.equal(zipPlan?.value, '78701');
  assert.equal(zipPlan?.status, 'supported');
});
