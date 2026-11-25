// Run: node tests/integration.test.js
// Full flow: confirmed candidate -> buildScopedProfile (real source) -> planFill -> field writer -> DOM readback.
const fs = require('fs');
const path = require('path');
const ext = path.resolve(__dirname, '../jobright_extension');
require(path.join(ext, 'core/question-intent.js'));
require(path.join(ext, 'core/answer-bank.js'));
const FM = require(path.join(ext, 'core/field-mapping.js'));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : (fail++, console.log('FAIL', name, detail)); };
const brief = p => JSON.stringify({ factKey: p?.factKey, status: p?.status, value: p?.value, reason: p?.reason });

// ---------------------------------------------------------------------------
// Minimal DOM fixture. Enough of the platform surface for the real field writer
// (selectors, pointer events, mutation-aware option waits, committed readback).
// ---------------------------------------------------------------------------
class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
    this.target = null;
    this.defaultPrevented = false;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() {}
}
class MockMouseEvent extends MockEvent {}
class MockKeyEvent extends MockEvent {
  constructor(type, init = {}) { super(type, init); this.key = init.key || ''; this.code = init.code || ''; this.keyCode = init.keyCode || 0; }
}
class MockFocusEvent extends MockEvent {}

function splitSelectors(sel) {
  return String(sel).split(',').map(s => s.trim()).filter(Boolean);
}
function matchesSimple(el, token) {
  if (token === '*') return true;
  let rest = token;
  const tag = rest.match(/^[a-zA-Z][\w-]*/);
  if (tag) {
    if (el.tagName !== tag[0].toUpperCase()) return false;
    rest = rest.slice(tag[0].length);
  }
  const parts = /([.#])([\w-]+)|(\[[^\]]+\])/g;
  let m;
  while ((m = parts.exec(rest))) {
    if (m[1] === '#') {
      if (el.id !== m[2]) return false;
    } else if (m[1] === '.') {
      if (!String(el.className || '').split(/\s+/).includes(m[2])) return false;
    } else {
      const raw = m[3].slice(1, -1);
      const attr = raw.match(/^\s*([^~|^$*=\s]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?\s*(i)?\s*$/i);
      if (!attr) return false;
      const actual = el.getAttribute(attr[1]);
      if (actual === null) return false;
      const op = attr[2];
      if (!op) continue;
      const ci = Boolean(attr[6]);
      const a = ci ? actual.toLowerCase() : actual;
      const b = ci ? String(attr[3] ?? attr[4] ?? attr[5]).toLowerCase() : String(attr[3] ?? attr[4] ?? attr[5]);
      if (op === '=' && a !== b) return false;
      if (op === '*=' && !a.includes(b)) return false;
      if (op === '^=' && !a.startsWith(b)) return false;
      if (op === '$=' && !a.endsWith(b)) return false;
      if (op === '~=' && !a.split(/\s+/).includes(b)) return false;
      if (op === '|=' && a !== b && !a.startsWith(b + '-')) return false;
    }
  }
  return true;
}
function matchesToken(el, token) {
  const chain = token.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  if (chain.length > 1) {
    let cur = el;
    for (let i = chain.length - 1; i >= 0; i--) {
      if (!cur || !matchesSimple(cur, chain[i])) return false;
      cur = cur.parentElement;
    }
    return true;
  }
  return matchesSimple(el, token);
}
const matchesAny = (el, sel) => splitSelectors(sel).some(token => matchesToken(el, token));

class MockNode {
  constructor(tag, attrs = {}, text = '') {
    this.tagName = String(tag).toUpperCase();
    this.attrs = {};
    for (const [k, v] of Object.entries(attrs)) this.attrs[k.toLowerCase()] = String(v);
    this.children = [];
    this.parentElement = null;
    this._text = String(text);
    this.listeners = new Map();
    this._value = this.attrs.value || '';
    this.checked = Boolean(attrs.checked);
    this.disabled = Boolean(attrs.disabled);
    this.readOnly = Boolean(attrs.readonly);
    this.isConnected = true;
    this.ownerDocument = globalThis.__mockDoc || null;
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name.toLowerCase()) ? this.attrs[name.toLowerCase()] : null; }
  setAttribute(name, value) { this.attrs[name.toLowerCase()] = String(value); }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name.toLowerCase()); }
  removeAttribute(name) { delete this.attrs[name.toLowerCase()]; }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get name() { return this.getAttribute('name') || ''; }
  set name(v) { this.setAttribute('name', v); }
  get type() { return this.getAttribute('type') || ''; }
  set type(v) { this.setAttribute('type', v); }
  get className() { return this.getAttribute('class') || ''; }
  get value() { return this._value; }
  set value(v) { this._value = String(v); }
  get textContent() { return this._text || this.children.map(c => c.textContent).join(' '); }
  set textContent(v) { this._text = String(v); }
  get innerText() { return this.textContent; }
  getClientRects() { return [{ width: 100, height: 20 }]; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; node.ownerDocument = this.ownerDocument; this.children.push(node); } return nodes[0]; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== fn)); }
  dispatchEvent(evt) {
    if (!evt.target) evt.target = this;
    for (const fn of this.listeners.get(evt.type) || []) fn(evt);
    return !evt.defaultPrevented;
  }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument) this.ownerDocument.activeElement = null; }
  click() {
    this.dispatchEvent(new MockEvent('click', { bubbles: true }));
    if (this.type === 'checkbox' || this.type === 'radio') {
      this.checked = !this.checked;
      this.dispatchEvent(new MockEvent('change', { bubbles: true }));
    }
  }
  matches(sel) { return matchesAny(this, sel); }
  closest(sel) {
    let cur = this;
    while (cur) { if (matchesAny(cur, sel)) return cur; cur = cur.parentElement; }
    return null;
  }
  contains(node) { let cur = node; while (cur) { if (cur === this) return true; cur = cur.parentElement; } return false; }
  getRootNode() { return this.ownerDocument || this; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const all = [];
    const walk = node => { for (const child of node.children) { all.push(child); walk(child); } };
    walk(this);
    return all.filter(node => matchesAny(node, sel));
  }
}

class MockDocument {
  constructor() {
    this.body = new MockNode('body');
    this.body.ownerDocument = this;
    this.children = [this.body];
    this.activeElement = null;
    this.defaultView = {
      Event: MockEvent, MouseEvent: MockMouseEvent, PointerEvent: MockMouseEvent,
      KeyboardEvent: MockKeyEvent, FocusEvent: MockFocusEvent,
      getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' }),
    };
  }
  createElement(tag) { return new MockNode(tag); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const all = [];
    const walk = node => { for (const child of node.children) { all.push(child); walk(child); } };
    walk(this);
    return all.filter(node => matchesAny(node, sel));
  }
  getElementById(id) { return this.querySelectorAll('[id]').find(node => node.id === id) || null; }
}

globalThis.MutationObserver = class { observe() {} disconnect() {} };
function freshDocument() { globalThis.__mockDoc = new MockDocument(); globalThis.document = globalThis.__mockDoc; return globalThis.__mockDoc; }
freshDocument();
require(path.join(ext, 'core/field-writer.js'));
const writer = globalThis.NextkinFieldWriter;

// ---------------------------------------------------------------------------
// Real buildScopedProfile source, executed with only its two local dependencies.
// ---------------------------------------------------------------------------
const panelSource = fs.readFileSync(path.join(ext, 'panel.js'), 'utf8');
const fnSource = panelSource.match(/function buildScopedProfile\(candidate\) \{[\s\S]*?\n\}/);
check('buildScopedProfile source found in panel.js', Boolean(fnSource));
const buildScopedProfile = new Function('effectiveDob', 'REQUIRE_CANDIDATE_REVIEW',
  `${fnSource[0]}\nreturn buildScopedProfile;`)(() => '', true);

const candidate = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 3,
  provenance_status: 'confirmed',
  confirmed_facts: {
    full_name: 'Priya Sharma',
    intended_work_country: 'United States',
    community_memberships: { selected: ['Veteran', 'Parent'], disclosure_preference: 'disclose', confirmed: true },
    preferred_work_location: 'Austin',
    protected_veteran: false,
    salary_currency: 'USD',
  },
};
const scoped = buildScopedProfile(candidate);
check('profile scoping preserves community memberships', JSON.stringify(scoped.community_memberships) === JSON.stringify(candidate.confirmed_facts.community_memberships));
check('profile scoping preserves preferred work location', scoped.preferred_work_location === 'Austin');
check('profile scoping preserves compensation metadata', scoped.salary_currency === 'USD');
check('profile scoping preserves trusted review policy', scoped.requireCandidateReview === true);
check('profile scoping keeps the allowlist (unlisted keys excluded)', scoped.not_allowed === undefined);

async function main() {
  // --- Community checkbox group: fact survives scoping and produces the correct plan ----------
  const doc = freshDocument();
  const labels = ['Person with disability', 'Neurodivergent', 'Veteran', 'Parent', 'Refugee or immigrant', 'None of the above'];
  const container = new MockNode('fieldset');
  doc.body.append(container);
  const options = labels.map(label => {
    const box = new MockNode('input', { type: 'checkbox', value: label });
    container.append(box);
    return { text: label, value: label, element: box };
  });
  const communityField = { label: 'Which of the following communities do you belong to? Please select all that apply.',
    hint: '', kind: 'checkbox-group', scope: '', options, element: container };
  const guarded = FM.planFill([communityField], scoped, { jobCountry: 'United States' })[0];
  check('community fact reaches the mapper with review policy', guarded.factKey === 'community_memberships', brief(guarded));
  check('consequential community mapping is left for review', guarded.status === 'needs_review', brief(guarded));

  // Writer path when the review policy permits a confirmed selection.
  const scopedWritable = { ...scoped };
  delete scopedWritable.requireCandidateReview;
  const writable = FM.planFill([communityField], scopedWritable, { jobCountry: 'United States' })[0];
  check('community plan becomes writable when review is not required', writable.status === 'supported', brief(writable));
  await writer.applyFill([writable]);
  check('community group written to DOM readback', JSON.stringify(writer.read(communityField).slice().sort()) === JSON.stringify(['Parent', 'Veteran']),
    JSON.stringify(writer.read(communityField)));

  // --- Searchable country combobox with options arriving after 1.5 s ------------------------
  const comboDoc = freshDocument();
  const comboRoot = new MockNode('div', { class: 'select' });
  const trigger = new MockNode('button', { role: 'combobox', 'aria-haspopup': 'listbox' });
  trigger.textContent = '';
  const listbox = new MockNode('div', { role: 'listbox' });
  comboRoot.append(trigger, listbox);
  comboDoc.body.append(comboRoot);
  const countryField = { label: 'Which country do you intend to work from?', hint: '', kind: 'combobox', scope: '', options: [], element: trigger };
  const countryPlan = FM.planFill([countryField], scoped, { jobCountry: 'United States' })[0];
  check('intended work country auto-fills from scoped profile', countryPlan.factKey === 'intended_work_country' &&
    countryPlan.status === 'supported' && countryPlan.value === 'United States', brief(countryPlan));
  check('location plan requests bounded option waiting', countryPlan.writerOptions?.maxOptionWaitMs === 3500 &&
    countryPlan.writerOptions?.requireCommittedSelection === true, JSON.stringify(countryPlan.writerOptions));

  const option = new MockNode('div', { role: 'option', 'data-value': 'United States' }, 'United States');
  option.addEventListener('click', () => { trigger.textContent = 'United States'; trigger.setAttribute('aria-expanded', 'false'); });
  setTimeout(() => listbox.append(option), 1500);
  await writer.applyFill([countryPlan]);
  check('delayed country option selected and committed', writer.read(countryField) === 'United States', JSON.stringify(writer.read(countryField)));
  check('writer reports a filled field', countryPlan._writeFailed !== true);

  // A bound shorter than the option delay must not claim success.
  const slowDoc = freshDocument();
  const slowRoot = new MockNode('div', { class: 'select' });
  const slowTrigger = new MockNode('button', { role: 'combobox', 'aria-haspopup': 'listbox' });
  slowTrigger.textContent = '';
  const slowList = new MockNode('div', { role: 'listbox' });
  slowRoot.append(slowTrigger, slowList);
  slowDoc.body.append(slowRoot);
  const slowField = { ...countryField, element: slowTrigger, options: [] };
  const slowPlan = { ...countryPlan, field: slowField, writerOptions: { maxOptionWaitMs: 100, requireCommittedSelection: true } };
  const slowOption = new MockNode('div', { role: 'option' }, 'United States');
  slowOption.addEventListener('click', () => { slowTrigger.textContent = 'United States'; });
  setTimeout(() => slowList.append(slowOption), 800);
  await writer.applyFill([slowPlan]);
  check('insufficient option wait is reported unverified', slowPlan._writeFailed === true || writer.read(slowField) !== 'United States',
    JSON.stringify({ writeFailed: slowPlan._writeFailed, read: writer.read(slowField) }));

  console.log(`${pass} passed, ${fail} failed (integration)`);
  process.exit(fail ? 1 : 0);
}
main().catch(error => { console.error(error); process.exit(1); });
