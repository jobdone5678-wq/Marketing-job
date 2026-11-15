(function (root) {
  const mapping = root.NextkinFieldMapping;
  const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const placeholder = /^(?:(?:please\s+)?(?:select|choose)(?:\s+(?:an?|your|the)\s+[^.]+|\s+one)?(?:\.{3}|…)?|[-–—]+)$/i;

  const optionSelector = [
    '[role="option"]',
    '[role="listbox"] li',
    '[role="listbox"] [role="option"]',
    '[data-radix-collection-item]',
    '[data-slot="select-item"]',
    '[id^="headlessui-listbox-option"]',
    '.select2-results__option',
    '.ng-option',
    '.k-list-item',
    '.dropdown-menu [data-value]',
    '[cmdk-item]',
    '[data-automation-id*="promptOption" i]',
    '[data-automation-id*="select-option" i]',
    '[data-testid*="option" i]',
    'button[data-option]',
    '[class*="select__option" i]',
    '[class*="-option" i]'
  ].join(', ');

  const listboxSelector = [
    '[role="listbox"]',
    '[data-radix-popper-content-wrapper]',
    '[data-radix-select-viewport]',
    '[id^="headlessui-listbox-options"]',
    '.select2-results',
    '.ng-dropdown-panel',
    '.k-list-container',
    '.dropdown-menu.show',
    '[cmdk-list]',
    '[data-automation-id*="promptList" i]',
    '[data-automation-id*="selectList" i]',
    '[class*="select__menu" i]',
    '[class*="-menu" i]',
    '.dialog-content'
  ].join(', ');

  const optionLabel = option => option.label || option.value;

  function safeCssEscape(str) {
    if (typeof globalThis.CSS !== 'undefined' && typeof globalThis.CSS.escape === 'function') {
      return globalThis.CSS.escape(str);
    }
    return String(str).replace(/([ !"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  const checked = el => {
    if (!el) return false;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') return Boolean(el.checked);
    const aria = el.getAttribute('aria-checked');
    if (aria === 'true') return true;
    if (aria === 'false') return false;
    const state = el.getAttribute('data-state');
    if (state === 'checked') return true;
    if (state === 'unchecked') return false;
    return Boolean(el.checked ?? (aria === 'true'));
  };

  const selected = el => checked(el) || el.getAttribute('aria-selected') === 'true' ||
    el.getAttribute('aria-pressed') === 'true' || el.getAttribute('data-selected') === 'true' ||
    el.getAttribute('data-state') === 'checked' || (el.matches && el.matches('.active, .selected, .is-selected'));

  const YES_REGEX = /^(yes|y|true|1|eligible|authorized|absolutely|of course|correct|affirmative)$/i;
  const NO_REGEX = /^(no|n|false|0|not eligible|not authorized|incorrect|never|negative)$/i;

  function normalizeBoolean(value) {
    if (typeof value === 'boolean') return value;
    const s = String(value ?? '').trim().toLowerCase();
    if (YES_REGEX.test(s)) return true;
    if (NO_REGEX.test(s)) return false;
    return null;
  }

  // Find visible clickable target if element is hidden / styled by CSS or React
  function findClickableTarget(el) {
    if (!el || !el.isConnected) return el;
    const view = el.ownerDocument?.defaultView || globalThis;
    const isVisible = node => {
      if (!node || !node.isConnected) return false;
      if (node.getClientRects && !node.getClientRects().length) return false;
      const style = view.getComputedStyle?.(node);
      if (!style) return true;
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    if (isVisible(el)) return el;

    // 1. label[for="..."]
    if (el.id) {
      try {
        const tree = el.getRootNode?.() || el.ownerDocument;
        const scope = tree.querySelector ? tree : el.ownerDocument;
        const explicitLbl = scope.querySelector('label[for="' + safeCssEscape(el.id) + '"]');
        if (explicitLbl && isVisible(explicitLbl)) return explicitLbl;
      } catch {}
    }

    // 2. parent <label>
    const parentLbl = el.closest('label');
    if (parentLbl && isVisible(parentLbl)) return parentLbl;

    // 3. adjacent clickable wrapper or sibling
    const next = el.nextElementSibling;
    if (next && isVisible(next)) return next;
    const prev = el.previousElementSibling;
    if (prev && isVisible(prev)) return prev;

    const parent = el.parentElement;
    if (parent && isVisible(parent) && parent.tagName !== 'BODY' && parent.tagName !== 'FORM') {
      return parent;
    }

    return el;
  }

  function click(el) {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const action = el.closest('button, a, input[type=submit], input[type=image], [role=button], [role=link]');
    if (action && (action.matches('a[href], [type=submit], [type=image]') ||
      /^(submit|apply|send application|next|continue|finish|log\s*in|sign\s*in|register)\b/i.test(action.textContent.trim()))) return false;
    const implicitSubmit = action?.tagName === 'BUTTON' && action.form && !action.hasAttribute('type');
    if (implicitSubmit) action.setAttribute('type', 'button');
    try {
      const view = el.ownerDocument.defaultView || globalThis;
      const PointerEvt = view.PointerEvent || view.MouseEvent;
      const MouseEvt = view.MouseEvent;
      el.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, composed: true, cancelable: true, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvt('mousedown', { bubbles: true, composed: true, cancelable: true }));
      el.focus?.({ preventScroll: true });
      el.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, composed: true, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvt('mouseup', { bubbles: true, composed: true }));
      el.click();
      return true;
    } finally {
      if (implicitSubmit) action.removeAttribute('type');
    }
  }

  function notify(el) {
    const view = el.ownerDocument?.defaultView || globalThis;
    const { Event } = view;
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function writeValue(el, value) {
    if (el.isContentEditable) el.textContent = value;
    else {
      const view = el.ownerDocument?.defaultView || globalThis;
      const proto = el.tagName === 'SELECT' ? view.HTMLSelectElement.prototype
        : el.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'value');
      if (desc?.set) desc.set.call(el, value);
      else el.value = value;
    }
    notify(el);
  }

  function setCheckbox(el, targetChecked) {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const boolVal = Boolean(targetChecked);
    const view = el.ownerDocument?.defaultView || globalThis;
    const target = findClickableTarget(el) || el;

    // Native prototype setter on HTMLInputElement
    if (el.tagName === 'INPUT' && el.type === 'checkbox') {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        if (desc?.set) {
          desc.set.call(el, boolVal);
        } else {
          el.checked = boolVal;
        }
      } catch {
        el.checked = boolVal;
      }
    }

    // ARIA and custom state attributes
    if (el.hasAttribute('aria-checked') || el.getAttribute('role') === 'checkbox' || el.getAttribute('role') === 'switch') {
      el.setAttribute('aria-checked', boolVal ? 'true' : 'false');
    }
    if (el.hasAttribute('data-state')) {
      el.setAttribute('data-state', boolVal ? 'checked' : 'unchecked');
    }
    if (target !== el) {
      if (target.hasAttribute('aria-checked') || target.getAttribute('role') === 'checkbox' || target.getAttribute('role') === 'switch') {
        target.setAttribute('aria-checked', boolVal ? 'true' : 'false');
      }
      if (target.hasAttribute('data-state')) {
        target.setAttribute('data-state', boolVal ? 'checked' : 'unchecked');
      }
    }

    // Dispatch PointerEvent('pointerdown'), MouseEvent('mousedown'), el.click(), and Event('input'), Event('change')
    try {
      const PointerEvt = view.PointerEvent || view.MouseEvent;
      const MouseEvt = view.MouseEvent;
      target.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, composed: true, cancelable: true, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mousedown', { bubbles: true, composed: true, cancelable: true }));
      target.focus?.({ preventScroll: true });
      target.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, composed: true, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mouseup', { bubbles: true, composed: true }));
      target.click();
      if (target !== el) {
        el.click();
      }
    } catch {
      try { el.click(); } catch {}
    }

    try {
      const Evt = view.Event;
      el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Evt('change', { bubbles: true }));
    } catch {}

    // Verify native prototype setter holds
    if (el.tagName === 'INPUT' && el.type === 'checkbox' && el.checked !== boolVal) {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        desc?.set?.call(el, boolVal);
        const Evt = view.Event;
        el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Evt('change', { bubbles: true }));
      } catch {}
    }

    return true;
  }

  function setRadio(option) {
    const el = option.element;
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const view = el.ownerDocument?.defaultView || globalThis;
    const target = findClickableTarget(el) || el;

    if (el.tagName === 'INPUT' && el.type === 'radio') {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        if (desc?.set) {
          desc.set.call(el, true);
        } else {
          el.checked = true;
        }
      } catch {
        el.checked = true;
      }
    }

    // Set ARIA and custom selection attributes
    el.setAttribute('aria-checked', 'true');
    el.setAttribute('aria-selected', 'true');
    if (el.hasAttribute('aria-pressed') || el.tagName === 'BUTTON') {
      el.setAttribute('aria-pressed', 'true');
    }
    el.setAttribute('data-state', 'checked');
    el.setAttribute('data-selected', 'true');

    if (target !== el) {
      target.setAttribute('aria-checked', 'true');
      target.setAttribute('aria-selected', 'true');
      if (target.hasAttribute('aria-pressed') || target.tagName === 'BUTTON') {
        target.setAttribute('aria-pressed', 'true');
      }
      target.setAttribute('data-state', 'checked');
      target.setAttribute('data-selected', 'true');
    }

    // Uncheck peer siblings in same radio / choice group
    try {
      const container = el.closest('[role="radiogroup"], fieldset, [class*="yesno" i], [class*="choice" i]') || el.parentElement;
      if (container) {
        const peers = container.querySelectorAll('input[type="radio"], button, [role="radio"]');
        for (const peer of peers) {
          if (peer === el || peer === target) continue;
          if (peer.tagName === 'INPUT' && peer.type === 'radio') {
            try {
              const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
              const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
              desc?.set ? desc.set.call(peer, false) : (peer.checked = false);
            } catch { peer.checked = false; }
          }
          if (peer.getAttribute('aria-checked') === 'true') peer.setAttribute('aria-checked', 'false');
          if (peer.getAttribute('aria-selected') === 'true') peer.setAttribute('aria-selected', 'false');
          if (peer.getAttribute('aria-pressed') === 'true') peer.setAttribute('aria-pressed', 'false');
          if (peer.getAttribute('data-state') === 'checked') peer.setAttribute('data-state', 'unchecked');
          if (peer.getAttribute('data-selected') === 'true') peer.setAttribute('data-selected', 'false');
        }
      }
    } catch {}

    try {
      const PointerEvt = view.PointerEvent || view.MouseEvent;
      const MouseEvt = view.MouseEvent;
      target.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, composed: true, cancelable: true, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mousedown', { bubbles: true, composed: true, cancelable: true }));
      target.focus?.({ preventScroll: true });
      target.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, composed: true, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mouseup', { bubbles: true, composed: true }));
      target.click();
      if (target !== el) {
        el.click();
      }
    } catch {
      try { el.click(); } catch {}
    }

    try {
      const Evt = view.Event;
      el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Evt('change', { bubbles: true }));
    } catch {}

    if (el.tagName === 'INPUT' && el.type === 'radio' && !el.checked) {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        desc?.set ? desc.set.call(el, true) : (el.checked = true);
        const Evt = view.Event;
        el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Evt('change', { bubbles: true }));
      } catch {}
    }

    return true;
  }

  function comboInput(el) {
    return el.tagName === 'INPUT' ? el : el.querySelector('input:not([type=hidden])');
  }

  function comboTrigger(el) {
    if (!el) return null;
    if (el.tagName === 'BUTTON' || el.matches('button, [data-slot="select-trigger"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]')) return el;
    const btn = el.querySelector('button, [data-slot="select-trigger"], [class*="select-trigger" i], [class*="selectTrigger" i], [role="combobox"], [aria-haspopup="listbox"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]');
    if (btn) return btn;
    if (el.matches('[role="combobox"], [aria-haspopup="listbox"]')) return el;
    return comboInput(el) || el;
  }

  function comboSearchInput(el, roots = []) {
    const local = comboInput(el);
    if (local && !local.readOnly && local.type !== 'button') return local;
    const doc = el.ownerDocument;
    for (const root of roots) {
      if (!root?.isConnected) continue;
      const input = root.querySelector('input:not([type=hidden]):not([readonly]), [role="searchbox"], [cmdk-input]');
      if (input) return input;
    }
    const activeSearch = doc.querySelector('.select2-search__field, [role="searchbox"], [cmdk-input], [data-automation-id*="search" i], [data-automation-id*="promptSearch" i]');
    if (activeSearch && activeSearch.isConnected && activeSearch.getClientRects().length) return activeSearch;
    return local && !local.readOnly ? local : null;
  }

  function comboValue(el) {
    const display = el.querySelector('[data-placeholder], .select2-selection__rendered, .ng-value-label, .k-input-value-text, [data-slot="select-value"]');
    const input = comboInput(el);
    const value = (display?.textContent || input?.value || (input ? '' : el.textContent)).trim();
    return el.hasAttribute('data-placeholder') || display?.hasAttribute('data-placeholder') ||
      display?.querySelector('.select2-selection__placeholder') || placeholder.test(value) ? '' : value;
  }

  function read(field) {
    const el = field.element;
    switch (field.kind) {
      case 'checkbox': return checked(el);
      case 'checkbox-group': return field.options.filter(option => checked(option.element)).map(optionLabel);
      case 'multi-select': return field.options.filter(option => option.element.selected).map(optionLabel);
      case 'select': return field.options.find(option => option.element.selected && !placeholder.test(option.label))?.label || '';
      case 'radio': return field.options.find(option => checked(option.element) || selected(option.element))?.label || '';
      case 'choice': return field.options.find(option => selected(option.element) || checked(option.element))?.label || '';
      case 'combobox': return comboValue(el);
      case 'multi-combobox': {
        const chips = el.querySelectorAll('.ng-value-label, .select2-selection__choice__display, .k-chip-label, [data-slot="multi-select-value"]');
        return [...chips].map(chip => chip.textContent.trim()).filter(Boolean);
      }
      default: return el.isContentEditable ? el.textContent.trim() : el.value?.trim() || '';
    }
  }

  function getListboxRoots(el) {
    const control = comboInput(el) || el;
    const ids = [el, control].flatMap(node => [node.getAttribute('aria-controls'), node.getAttribute('aria-owns')])
      .filter(Boolean).flatMap(idStr => idStr.split(/\s+/));
    const doc = el.ownerDocument;
    const roots = ids.map(id => el.getRootNode?.().getElementById?.(id) || doc.getElementById(id)).filter(Boolean);
    const isVisible = node => !!node.getClientRects().length && doc.defaultView.getComputedStyle(node).visibility !== 'hidden';
    if (!roots.length) {
      const menus = [...new Set([...(el.getRootNode?.()?.querySelectorAll?.(listboxSelector) || []), ...doc.querySelectorAll(listboxSelector)])].filter(isVisible);
      const nearby = menus.filter(menu => (el.contains?.(menu)) || (el.parentElement?.contains?.(menu)) || (el.closest?.('[class*="field" i], form, fieldset')?.contains?.(menu)));
      if (nearby.length >= 1) roots.push(...nearby);
      else if (menus.length === 1) roots.push(menus[0]);
      else if (menus.length > 1) roots.push(...menus);
    }
    return roots;
  }

  function comboOptions(el) {
    const roots = getListboxRoots(el);
    const doc = el.ownerDocument;
    const isVisible = node => !!node.getClientRects().length && doc.defaultView.getComputedStyle(node).visibility !== 'hidden';
    if (!roots.length) return [];

    const candidateNodes = roots.flatMap(menu => [...menu.querySelectorAll(optionSelector)]);

    return [...new Set(candidateNodes)]
      .filter(option => isVisible(option) && !option.disabled && option.getAttribute('aria-disabled') !== 'true' &&
        !option.matches('.disabled, .ng-option-disabled, .select2-results__option--disabled, [aria-disabled="true"]'))
      .map(element => ({
        element,
        label: (element.getAttribute('aria-label') || element.getAttribute('data-label') || element.textContent).trim(),
        value: element.getAttribute('data-value') || element.getAttribute('value') || ''
      }))
      .filter(option => option.label && !placeholder.test(option.label));
  }

  function choose(field, desired) {
    const bool = normalizeBoolean(desired);
    if (bool !== null && mapping.pickBooleanOption) {
      const bOpt = mapping.pickBooleanOption(field.options, bool);
      if (bOpt) return bOpt;
    }
    if (typeof desired === 'boolean' && mapping.pickBooleanOption) {
      return mapping.pickBooleanOption(field.options, desired);
    }
    const opt = mapping.pickOption(field, desired);
    if (opt) return opt;
    if (bool !== null && mapping.pickBooleanOption) {
      return mapping.pickBooleanOption(field.options, bool);
    }
    return null;
  }

  function closeCombo(el) {
    const view = el.ownerDocument?.defaultView || globalThis;
    const { KeyboardEvent } = view;
    const targets = [comboSearchInput(el), comboInput(el), comboTrigger(el), el, el.ownerDocument?.activeElement].filter(Boolean);
    for (const target of targets) {
      try {
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true }));
      } catch {}
    }
  }

  async function readChoices(field, isCurrent = () => true) {
    if (field.kind !== 'combobox' || field.options.length) return field.options;
    const el = field.element;
    const trigger = comboTrigger(el);
    if (!isCurrent() || !click(trigger)) return [];
    try {
      const start = Date.now();
      while (Date.now() - start < 300 && isCurrent()) {
        const options = comboOptions(el);
        if (options.length) return options;
        await wait(30);
      }
      return [];
    } finally {
      if (isCurrent()) closeCombo(el);
    }
  }

  async function fillCombo(field, desired, isCurrent = () => true) {
    const el = field.element;
    const input = comboInput(el);
    if (input?.list) {
      const option = choose(field, desired);
      if (!option) return null;
      writeValue(input, option.value);
      return { expected: option.value };
    }

    const trigger = comboTrigger(el);
    let options = comboOptions(el);

    // If options not open, click trigger to open listbox
    if (!options.length && trigger) {
      click(trigger);
      const openStart = Date.now();
      // await options asynchronously (up to 300ms)
      while (Date.now() - openStart < 300 && isCurrent()) {
        await wait(30);
        options = comboOptions(el);
        if (options.length) break;
      }
    }

    // Match candidate value against option text
    let option = choose({ options }, desired);
    if (option) {
      const ok = click(option.element);
      return ok ? { expected: option.label, option: option.element, typed: false } : null;
    }

    // Type into combobox search input if present
    const roots = getListboxRoots(el);
    const search = comboSearchInput(el, roots);
    let typed = false;
    const query = typeof desired === 'boolean' ? (desired ? 'Yes' : 'No') : String(desired);
    if (search && !search.readOnly && isCurrent()) {
      writeValue(search, query);
      typed = true;
      const searchStart = Date.now();
      // await filtered options asynchronously (up to 300ms)
      while (Date.now() - searchStart < 300 && isCurrent()) {
        await wait(30);
        options = comboOptions(el);
        option = choose({ options }, desired);
        if (option) break;
      }
    }

    if (option) {
      const ok = click(option.element);
      return ok ? { expected: option.label, option: option.element, typed } : null;
    }

    // Close with Escape fallback
    if (typed && search && normalize(search.value) === normalize(query)) {
      writeValue(search, '');
    }
    closeCombo(el);
    return null;
  }

  function setChoice(field, desired) {
    const option = choose(field, desired);
    if (!option) return null;
    if (field.kind === 'select') {
      const el = field.element;
      const view = el.ownerDocument?.defaultView || globalThis;
      try {
        const proto = view.HTMLSelectElement?.prototype || HTMLSelectElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'value');
        if (desc?.set) {
          desc.set.call(el, option.value);
        } else {
          el.value = option.value;
        }
      } catch {
        el.value = option.value;
      }
      if (option.element && typeof option.element.index === 'number') {
        el.selectedIndex = option.element.index;
      } else {
        const idx = Array.from(el.options || []).findIndex(o => o.value === option.value || o === option.element);
        if (idx >= 0) el.selectedIndex = idx;
      }
      notify(el);
      return { expected: option.label };
    } else if (field.kind === 'radio' || field.kind === 'choice') {
      if (!setRadio(option)) return null;
      return { expected: option.label };
    } else {
      if (!click(option.element)) return null;
      return { expected: option.label };
    }
  }

  function setMultiple(field, desired) {
    if (!Array.isArray(desired) || !desired.length) return null;
    const options = desired.map(value => choose(field, value));
    if (options.some(option => !option)) return null;
    for (const option of new Set(options)) {
      if (field.kind === 'multi-select') option.element.selected = true;
      else if (!checked(option.element)) setCheckbox(option.element, true);
    }
    if (field.kind === 'multi-select') notify(field.element);
    return { expected: options.map(optionLabel) };
  }

  async function fillMultiCombo(field, values, isCurrent) {
    if (!Array.isArray(values)) return null;
    const selected = [];
    for (const value of new Set(values.slice(0, 20))) {
      if (!isCurrent() || !field.element.isConnected) break;
      const result = await fillCombo(field, value, isCurrent);
      if (result) selected.push(result.expected);
    }
    if (isCurrent()) closeCombo(field.element);
    const actual = read(field);
    return selected.length && selected.every(value => actual.some(item => normalize(item) === normalize(value)))
      ? { expected: actual } : null;
  }

  function equals(value, expected) {
    if (Array.isArray(expected)) {
      return Array.isArray(value) && value.length === new Set(expected).size &&
        expected.every(answer => value.some(item => normalize(item) === normalize(answer)));
    }
    const bExpected = normalizeBoolean(expected);
    const bValue = normalizeBoolean(value);
    if (bExpected !== null && bValue !== null) return bExpected === bValue;
    return typeof expected === 'boolean' ? value === expected : normalize(value) === normalize(expected);
  }

  // Preserved values store across wizard step transitions
  const preservedStore = new Map();

  function recordPreservedValues(fields) {
    if (!Array.isArray(fields)) return preservedStore;
    for (const f of fields) {
      if (!f?.element?.isConnected) continue;
      const val = read(f);
      const hasVal = Array.isArray(val) ? val.length > 0 : (typeof val === 'boolean' ? true : Boolean(val));
      if (hasVal) {
        if (f.key) preservedStore.set(f.key, val);
        if (f.label) preservedStore.set('label:' + normalize(f.label), val);
      }
    }
    return preservedStore;
  }

  function getPreservedValue(field) {
    if (!field) return undefined;
    if (field.key && preservedStore.has(field.key)) return preservedStore.get(field.key);
    if (field.label && preservedStore.has('label:' + normalize(field.label))) {
      return preservedStore.get('label:' + normalize(field.label));
    }
    return undefined;
  }

  function clearPreservedValues() {
    preservedStore.clear();
  }

  function advanceStep(scope = document) {
    const nav = root.NextkinForms?.findStepNavigation?.(scope);
    if (nav?.nextButton) {
      const btn = nav.nextButton;
      const view = btn.ownerDocument?.defaultView || globalThis;
      try {
        const PointerEvt = view.PointerEvent || view.MouseEvent;
        const MouseEvt = view.MouseEvent;
        btn.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, composed: true, cancelable: true, pointerType: 'mouse', isPrimary: true }));
        btn.dispatchEvent(new MouseEvt('mousedown', { bubbles: true, composed: true, cancelable: true }));
        btn.focus?.({ preventScroll: true });
        btn.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, composed: true, pointerType: 'mouse', isPrimary: true }));
        btn.dispatchEvent(new MouseEvt('mouseup', { bubbles: true, composed: true }));
        btn.click();
        return true;
      } catch {
        try { btn.click(); return true; } catch {}
      }
    }
    return false;
  }

  async function applyFill(plans, session) {
    const receipts = [];
    for (const plan of plans) {
      const { field, value } = plan;
      const el = field.element;
      if (plan.status !== 'supported' || !el?.isConnected || !session.isCurrent() || field.excluded) continue;
      const domVal = read(field);
      const preserved = getPreservedValue(field);
      const previous = (domVal !== '' && domVal !== null && domVal !== undefined) ? domVal : preserved;
      const hasAnswer = Array.isArray(previous) ? previous.length > 0 : (typeof previous === 'boolean' ? true : Boolean(previous));
      let write;
      if (hasAnswer) {
        const option = field.options?.length ? choose(field, value) : null;
        if (equals(previous, option?.label ?? value)) write = { expected: previous };
      } else if (field.kind === 'combobox') {
        write = await fillCombo(field, value, session.isCurrent);
      } else if (field.kind === 'multi-combobox') {
        write = await fillMultiCombo(field, value, session.isCurrent);
      } else if (mapping.isMultiKind(field.kind)) {
        write = setMultiple(field, value);
      } else if (mapping.isChoiceKind(field.kind)) {
        write = setChoice(field, value);
      } else if (field.kind === 'checkbox') {
        const boolVal = typeof value === 'boolean' ? value : normalizeBoolean(value);
        if (typeof boolVal === 'boolean') {
          if (previous === boolVal || setCheckbox(el, boolVal)) {
            write = { expected: boolVal };
          }
        }
      } else {
        const expected = el.maxLength > 0 ? String(value).slice(0, el.maxLength) : String(value);
        writeValue(el, expected);
        write = { expected };
      }
      if (!write) continue;
      const verified = () => session.isCurrent() && el.isConnected &&
        ((equals(read(field), write.expected) && !(write.typed && write.option?.isConnected &&
          !selected(write.option) && el.getAttribute('aria-expanded') === 'true')) || (write.option?.isConnected && selected(write.option)));
      if (!verified()) await wait(120);
      if (!verified()) continue;
      recordPreservedValues([field]);
      receipts.push({ field, writtenValue: write.expected, ai: !!plan.ai, learned: !!plan.learned });
    }
    return receipts;
  }

  root.NextkinFieldWriter = {
    applyFill,
    read,
    readChoices,
    setCheckbox,
    setRadio,
    setChoice,
    fillCombo,
    recordPreservedValues,
    getPreservedValue,
    clearPreservedValues,
    advanceStep
  };
})(globalThis);
