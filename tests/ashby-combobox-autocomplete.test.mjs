import test from 'node:test';
import assert from 'node:assert/strict';

// Set up mock DOM environment
class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = !!init.bubbles;
    this.cancelable = !!init.cancelable;
    this.composed = !!init.composed;
    this.defaultPrevented = false;
    this.isTrusted = init.isTrusted !== undefined ? Boolean(init.isTrusted) : false;
    this.target = null;
  }
  preventDefault() { this.defaultPrevented = true; }
}

class MockPointerEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.pointerType = init.pointerType || 'mouse';
  }
}

class MockMouseEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
  }
}

class MockKeyboardEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.key = init.key || '';
    this.keyCode = init.keyCode || 0;
  }
}

class MockFocusEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
  }
}

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
    this.listeners = new Map();
    this.eventLog = [];
    this._value = attrs.value || '';
    this.ownerDocument = null;
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

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    if (!this.listeners.has(type)) return;
    this.listeners.set(type, this.listeners.get(type).filter(f => f !== fn));
  }
  dispatchEvent(evt) {
    evt.target = this;
    this.eventLog.push(evt.type);
    const fns = this.listeners.get(evt.type) || [];
    for (const fn of fns) fn(evt);
    return !evt.defaultPrevented;
  }
  click() {
    this.dispatchEvent(new MockMouseEvent('click', { bubbles: true, cancelable: true }));
  }
  focus() {
    this.dispatchEvent(new MockFocusEvent('focus', { bubbles: true }));
  }

  appendChild(child) {
    if (!child) return child;
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument || this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  getRootNode() {
    let curr = this;
    while (curr.parentElement) curr = curr.parentElement;
    return curr;
  }

  matches(sel) {
    if (!sel) return false;
    const parts = sel.split(',').map(s => s.trim());
    return parts.some(p => this._matchesSingle(p));
  }

  _matchesSingle(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      const classes = (this.getAttribute('class') || '').split(/\s+/);
      return classes.includes(cls);
    }
    if (sel.includes('[class*=')) {
      const match = sel.match(/\[class\*=["']?([^"'\]]+)["']?\s*(?:i)?\]/i);
      if (match) {
        const needle = match[1].toLowerCase();
        const haystack = (this.getAttribute('class') || '').toLowerCase();
        return haystack.includes(needle);
      }
    }
    if (sel.includes('[role=')) {
      const match = sel.match(/\[role=["']?([^"'\]]+)["']?\]/i);
      if (match) return (this.getAttribute('role') || '').toLowerCase() === match[1].toLowerCase();
    }
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
        if (child.matches && child.matches(sel)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
}

const mockDoc = new MockNode('#document');
mockDoc.defaultView = {
  getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' }),
  Event: MockEvent,
  PointerEvent: MockPointerEvent,
  MouseEvent: MockMouseEvent,
  KeyboardEvent: MockKeyboardEvent,
  FocusEvent: MockFocusEvent,
  HTMLInputElement: { prototype: {} }
};
mockDoc.body = new MockNode('BODY');
mockDoc.appendChild(mockDoc.body);
globalThis.document = mockDoc;
globalThis.Event = MockEvent;
globalThis.PointerEvent = MockPointerEvent;
globalThis.MouseEvent = MockMouseEvent;
globalThis.KeyboardEvent = MockKeyboardEvent;
globalThis.FocusEvent = MockFocusEvent;

// Import field-mapping and field-writer
await import('../jobright_extension/core/field-mapping.js');
await import('../jobright_extension/core/field-writer.js');

test('fillCombobox recognizes options inside .ashby-application-form-input-autocomplete-popup', async () => {
  mockDoc.body.children = [];

  // Ashby autocomplete input
  const inputContainer = new MockNode('DIV', { class: '_inputContainer_d7ago_28' });
  const input = new MockNode('INPUT', {
    class: '_input_d7ago_28 ashby-application-form-input-autocomplete',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false'
  });
  inputContainer.appendChild(input);
  mockDoc.body.appendChild(inputContainer);

  const field = {
    element: input,
    kind: 'combobox',
    key: 'field:5:_systemfield_location',
    label: 'Where are you currently located?',
    options: []
  };

  // Popup in floating container
  const popup = new MockNode('DIV', {
    class: '_resultContainer_d7ago_116 ashby-application-form-input-autocomplete-popup'
  });
  const optAustin = new MockNode('DIV', { role: 'option' }, 'Austin, Texas, United States');
  const optSeattle = new MockNode('DIV', { role: 'option' }, 'Seattle, Washington, United States');
  popup.appendChild(optAustin);
  popup.appendChild(optSeattle);

  // When input receives input event, popup is added to body
  input.addEventListener('input', () => {
    mockDoc.body.appendChild(popup);
  });

  const res = await globalThis.NextkinFieldWriter.fillCombobox(field, 'Austin, TX', () => true);
  assert.ok(res, 'fillCombobox must succeed for Ashby autocomplete');
  assert.equal(res.expected, 'Austin, Texas, United States');
  assert.ok(optAustin.eventLog.includes('click'), 'Option must be clicked');
});
