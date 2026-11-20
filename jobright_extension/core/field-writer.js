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
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return Boolean(el.checked);
    const aria = el.getAttribute('aria-checked');
    if (aria === 'true') return true;
    if (aria === 'false') return false;
    const state = el.getAttribute('data-state');
    if (state === 'checked') return true;
    if (state === 'unchecked') return false;
    return Boolean(el.checked ?? (aria === 'true'));
  };

  const selected = el => (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox') ? checked(el) : (
    checked(el) || el.getAttribute('aria-selected') === 'true' ||
    el.getAttribute('aria-pressed') === 'true' || el.getAttribute('data-selected') === 'true' ||
    el.getAttribute('data-state') === 'checked' || (el.matches && el.matches('.active, .selected, .is-selected'))
  ));

  const YES_REGEX = /^(yes|y|true|1|eligible|authorized|absolutely|of course|correct|affirmative|immediately|available)$/i;
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
      const downInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 1, detail: 1 };
      const upInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 0, detail: 1 };
      el.dispatchEvent(new PointerEvt('pointerdown', { ...downInit, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvt('mousedown', downInit));
      el.focus?.({ preventScroll: true });
      el.dispatchEvent(new PointerEvt('pointerup', { ...upInit, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvt('mouseup', upInit));
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
      if (el._valueTracker) {
        el._valueTracker.setValue?.('');
      }
    }
    notify(el);
  }

  function setCheckbox(el, targetChecked) {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const boolVal = Boolean(targetChecked);
    const view = el.ownerDocument?.defaultView || globalThis;
    const target = findClickableTarget(el) || el;

    if (checked(el) === boolVal) {
      return true;
    }
    if (el.tagName !== 'INPUT') {
      try { click(target); } catch {}
      return checked(el) === boolVal;
    }

    const PointerEvt = view.PointerEvent || view.MouseEvent;
    const MouseEvt = view.MouseEvent;
    const downInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 1, detail: 1 };
    const upInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 0, detail: 1 };

    try {
      target.dispatchEvent(new PointerEvt('pointerdown', { ...downInit, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mousedown', downInit));
      target.focus?.({ preventScroll: true });
      target.dispatchEvent(new PointerEvt('pointerup', { ...upInit, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mouseup', upInit));
      target.click();
    } catch {
      try { target.click(); } catch {}
    }

    // If native checkbox and not matching targetChecked, try direct el.click() if target wasn't el
    if (el.tagName === 'INPUT' && el.type === 'checkbox' && el.checked !== boolVal) {
      if (target !== el) {
        try {
          el.dispatchEvent(new PointerEvt('pointerdown', { ...downInit, pointerType: 'mouse', isPrimary: true }));
          el.dispatchEvent(new MouseEvt('mousedown', downInit));
          el.dispatchEvent(new PointerEvt('pointerup', { ...upInit, pointerType: 'mouse', isPrimary: true }));
          el.dispatchEvent(new MouseEvt('mouseup', upInit));
          el.click();
        } catch {
          try { el.click(); } catch {}
        }
      }
    }

    // If still not matching, force with descriptor & React tracker
    if (el.tagName === 'INPUT' && el.type === 'checkbox' && el.checked !== boolVal) {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        if (desc?.set) desc.set.call(el, boolVal);
        else el.checked = boolVal;
        el._valueTracker?.setValue?.('');
      } catch {
        el.checked = boolVal;
      }
      try {
        const Evt = view.Event;
        el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Evt('change', { bubbles: true }));
      } catch {}
    }

    return checked(el) === boolVal;
  }

  function setRadio(option) {
    const el = option.element;
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const view = el.ownerDocument?.defaultView || globalThis;
    const target = findClickableTarget(el) || el;
    if (el.tagName !== 'INPUT') {
      if (selected(el)) return true;
      try { return click(target); } catch { return false; }
    }

    // Dispatch PointerEvent and Click on target
    const PointerEvt = view.PointerEvent || view.MouseEvent;
    const MouseEvt = view.MouseEvent;
    const downInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 1, detail: 1 };
    const upInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 0, detail: 1 };

    try {
      target.dispatchEvent(new PointerEvt('pointerdown', { ...downInit, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mousedown', downInit));
      target.focus?.({ preventScroll: true });
      target.dispatchEvent(new PointerEvt('pointerup', { ...upInit, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mouseup', upInit));
      target.click();
    } catch {
      try { target.click(); } catch {}
    }

    // If native radio and still not checked, try direct el.click() if target wasn't el
    if (el.tagName === 'INPUT' && el.type === 'radio' && !el.checked) {
      if (target !== el) {
        try {
          el.dispatchEvent(new PointerEvt('pointerdown', { ...downInit, pointerType: 'mouse', isPrimary: true }));
          el.dispatchEvent(new MouseEvt('mousedown', downInit));
          el.dispatchEvent(new PointerEvt('pointerup', { ...upInit, pointerType: 'mouse', isPrimary: true }));
          el.dispatchEvent(new MouseEvt('mouseup', upInit));
          el.click();
        } catch {
          try { el.click(); } catch {}
        }
      }
    }

    // If still not checked, force with descriptor & React value tracker
    if (el.tagName === 'INPUT' && el.type === 'radio' && !el.checked) {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        if (desc?.set) desc.set.call(el, true);
        else el.checked = true;
        el._valueTracker?.setValue?.('');
      } catch {
        el.checked = true;
      }
      try {
        const Evt = view.Event;
        el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    }

    return el.tagName === 'INPUT' && el.type === 'radio' ? el.checked : true;
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
    const root = el.closest?.('.select, .select__container, .select__control, [class*="select__control" i], [class*="select-container" i], [class*="select-shell" i]') || el.parentElement || el;
    const display = (el.querySelector ? el.querySelector('[data-placeholder], .select2-selection__rendered, .ng-value-label, .k-input-value-text, [data-slot="select-value"], [class*="singleValue" i], [class*="single-value" i], [class*="select__single-value" i]') : null) ||
      root.querySelector?.('[data-placeholder], .select2-selection__rendered, .ng-value-label, .k-input-value-text, [data-slot="select-value"], [class*="singleValue" i], [class*="single-value" i], [class*="select__single-value" i]');
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
      case 'select': {
        if (el?.tagName === 'SELECT' && typeof el.selectedIndex === 'number' && el.selectedIndex >= 0 && el.options?.[el.selectedIndex]) {
          const opt = el.options[el.selectedIndex];
          const lbl = (opt.text || opt.textContent || opt.label || opt.value || '').trim();
          if (!placeholder.test(lbl)) return lbl;
        }
        return (field.options || []).find(option => option?.element?.selected && !placeholder.test(option.label))?.label || (el?.value?.trim() || '');
      }
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
      const fieldContainer = el.closest?.('.select, .select__container, .select-shell, [class*="select__container"], [class*="form-group"], [class*="field-container"], [class*="application-question"]');
      const nearby = menus.filter(menu => (el.contains?.(menu)) || (el.parentElement?.contains?.(menu)) || (fieldContainer?.contains?.(menu)));
      if (nearby.length >= 1) roots.push(...nearby);
      else if (menus.length === 1) roots.push(menus[0]);
      else if (menus.length > 1) roots.push(menus[menus.length - 1]);
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
      const ctrl = el.closest?.('.select__control, [class*="select__control" i]');
      if (ctrl && ctrl !== trigger) click(ctrl);
      const openStart = Date.now();
      // await options asynchronously (up to 400ms)
      while (Date.now() - openStart < 400 && isCurrent()) {
        await wait(30);
        options = comboOptions(el);
        if (options.length) break;
      }
    }

    // Match candidate value against option text
    let option = choose({ options }, desired);
    if (option) {
      const ok = click(option.element);
      closeCombo(el);
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
      // await filtered options asynchronously (up to 800ms for network search)
      while (Date.now() - searchStart < 800 && isCurrent()) {
        await wait(30);
        options = comboOptions(el);
        option = choose({ options }, desired);
        if (option) break;
      }
    }

    if (option) {
      const ok = click(option.element);
      closeCombo(el);
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
        if (el._valueTracker) {
          el._valueTracker.setValue?.('');
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
    const expected = options.map(optionLabel);
    return { expected, matches: actual => Array.isArray(actual) && expected.every(value =>
      actual.some(selected => normalize(selected) === normalize(value))) };
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
    if (typeof expected === 'boolean') return value === expected;
    if (normalize(value) === normalize(expected)) return true;
    const dVal = String(value || '').replace(/\D/g, '');
    const dExp = String(expected || '').replace(/\D/g, '');
    if (dVal.length >= 7 && dExp.length >= 7 && (dVal === dExp || dVal.endsWith(dExp) || dExp.endsWith(dVal))) return true;
    return false;
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

  // Resolve or re-resolve live element from DOM in case of React rerender
  function ensureConnectedElement(field) {
    if (!field || !field.element) return null;
    if (field.element.isConnected) return field.element;

    const doc = field.element.ownerDocument || globalThis.document;
    if (!doc || typeof doc.querySelector !== 'function') return field.element;

    // 1. Try to find connected element by id using attribute selector
    if (field.element.id) {
      if (typeof doc.querySelectorAll === 'function') {
        try {
          const candidates = doc.querySelectorAll(`[id="${safeCssEscape(field.element.id)}"]`);
          const byId = Array.from(candidates).find(el => el.isConnected);
          if (byId) {
            field.element = byId;
            return byId;
          }
        } catch {}
      }
      if (typeof doc.getElementById === 'function') {
        try {
          const byId = doc.getElementById(field.element.id);
          if (byId && byId.isConnected) {
            field.element = byId;
            return byId;
          }
        } catch {}
      }
    }

    // 2. Try to find connected element by name
    const name = field.element.name || (typeof field.element.getAttribute === 'function' ? field.element.getAttribute('name') : null);
    if (name) {
      if (typeof doc.querySelectorAll === 'function') {
        try {
          const candidates = doc.querySelectorAll(`[name="${safeCssEscape(name)}"]`);
          const byName = Array.from(candidates).find(el => el.isConnected);
          if (byName) {
            field.element = byName;
            return byName;
          }
        } catch {}
      }
      try {
        const byName = doc.querySelector(`[name="${safeCssEscape(name)}"]`);
        if (byName && byName.isConnected) {
          field.element = byName;
          return byName;
        }
      } catch {}
    }

    if (typeof field.element.getAttribute === 'function') {
      const autoId = field.element.getAttribute('data-automation-id');
      if (autoId) {
        if (typeof doc.querySelectorAll === 'function') {
          try {
            const candidates = doc.querySelectorAll(`[data-automation-id="${safeCssEscape(autoId)}"]`);
            const byAuto = Array.from(candidates).find(el => el.isConnected);
            if (byAuto) {
              field.element = byAuto;
              return byAuto;
            }
          } catch {}
        }
        try {
          const byAuto = doc.querySelector(`[data-automation-id="${safeCssEscape(autoId)}"]`);
          if (byAuto && byAuto.isConnected) {
            field.element = byAuto;
            return byAuto;
          }
        } catch {}
      }

      const testId = field.element.getAttribute('data-testid') || field.element.getAttribute('data-test');
      if (testId) {
        if (typeof doc.querySelectorAll === 'function') {
          try {
            const candidates = doc.querySelectorAll(`[data-testid="${safeCssEscape(testId)}"], [data-test="${safeCssEscape(testId)}"]`);
            const byTest = Array.from(candidates).find(el => el.isConnected);
            if (byTest) {
              field.element = byTest;
              return byTest;
            }
          } catch {}
        }
        try {
          const byTest = doc.querySelector(`[data-testid="${safeCssEscape(testId)}"], [data-test="${safeCssEscape(testId)}"]`);
          if (byTest && byTest.isConnected) {
            field.element = byTest;
            return byTest;
          }
        } catch {}
      }
    }

    if (root.NextkinForms?.discoverFields) {
      try {
        const freshFields = root.NextkinForms.discoverFields(doc);
        const match = freshFields.find(f =>
          (field.key && f.key === field.key) ||
          (field.label && normalize(f.label) === normalize(field.label))
        );
        if (match?.element?.isConnected) {
          field.element = match.element;
          if (match.options?.length) field.options = match.options;
          return match.element;
        }
      } catch {}
    }

    return field.element;
  }

  // Bounded async polling with MutationObserver for dependent field readiness (Country -> State -> City)
  async function waitForFieldReady(field, session, maxWaitMs = 1200) {
    if (session && !session.isCurrent()) return false;
    ensureConnectedElement(field);
    const el = field.element;
    if (!el) return false;

    const isSelect = el.tagName === 'SELECT';

    const isReady = () => {
      ensureConnectedElement(field);
      const cur = field.element;
      if (!cur || !cur.isConnected) return false;
      const isDisabled = cur.disabled || (typeof cur.getAttribute === 'function' && (cur.getAttribute('aria-disabled') === 'true' || (typeof cur.hasAttribute === 'function' && cur.hasAttribute('disabled'))));
      if (isDisabled) return false;
      const isBusy = typeof cur.getAttribute === 'function' && (cur.getAttribute('aria-busy') === 'true' || cur.closest?.('[aria-busy="true"]'));
      if (isBusy) return false;

      if (isSelect) {
        const validOpts = Array.from(cur.options || []).filter(o => o.value && !placeholder.test(o.label || o.text || o.textContent || ''));
        if (field.options?.length && !validOpts.length) return false;
      }
      return true;
    };

    if (isReady()) return true;

    const start = Date.now();
    return new Promise(resolve => {
      let observer;
      let timer;
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (observer) {
          try { observer.disconnect(); } catch {}
          observer = null;
        }
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      };

      const check = () => {
        if (settled) return;
        if (session && !session.isCurrent()) {
          cleanup();
          resolve(false);
          return;
        }
        if (isReady()) {
          if (isSelect && field.element.options) {
            field.options = Array.from(field.element.options).map(opt => ({
              element: opt,
              label: (opt.text || opt.textContent || opt.label || opt.value || '').trim(),
              value: opt.value?.trim()
            }));
          }
          cleanup();
          resolve(true);
        } else if (Date.now() - start >= maxWaitMs) {
          cleanup();
          resolve(false);
        }
      };

      const doc = el.ownerDocument || globalThis.document;
      const container = el.closest?.('form, [role="form"], [data-automation-id*="form" i]') || doc?.body || doc?.documentElement;
      if (container && typeof globalThis.MutationObserver !== 'undefined') {
        try {
          observer = new globalThis.MutationObserver(check);
          observer.observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'class']
          });
        } catch {}
      }
      timer = setInterval(check, 35);
      check();
    });
  }

  // Bounded async polling with MutationObserver for DOM readback verification instead of rigid 120ms wait
  async function waitForVerification(verifiedFn, session, maxWaitMs = 250, intervalMs = 25) {
    if (verifiedFn()) return true;
    const start = Date.now();
    return new Promise(resolve => {
      let observer;
      let timer;
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (observer) {
          try { observer.disconnect(); } catch {}
          observer = null;
        }
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      };

      const check = () => {
        if (settled) return;
        if (session && !session.isCurrent()) {
          cleanup();
          resolve(false);
          return;
        }
        if (verifiedFn()) {
          cleanup();
          resolve(true);
        } else if (Date.now() - start >= maxWaitMs) {
          cleanup();
          resolve(false);
        }
      };

      const doc = globalThis.document;
      const root = doc?.body || doc?.documentElement;
      if (root && typeof globalThis.MutationObserver !== 'undefined') {
        try {
          observer = new globalThis.MutationObserver(check);
          observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
          });
        } catch {}
      }
      timer = setInterval(check, intervalMs);
      check();
    });
  }

  async function applyFill(plans, session) {
    const receipts = [];
    for (const plan of plans) {
      const { field, value } = plan;
      if (plan.status !== 'supported' || !session.isCurrent() || field.excluded) continue;

      // Handle React rerendering: re-resolve element if it was disconnected
      ensureConnectedElement(field);
      const el = field.element;
      if (!el?.isConnected) continue;

      // Bounded async wait for dependent controls (Country -> State -> City)
      // to become enabled / populated with options after previous field changes
      await waitForFieldReady(field, session, 1200);
      if (!session.isCurrent() || !field.element?.isConnected) continue;

      const currentEl = field.element;
      const domVal = read(field);
      const previous = domVal;
      const isCountryCodeOnly = field.kind === 'text' && (currentEl.type === 'tel' || /phone/i.test(field.hint || field.label)) && /^\+?\d{1,3}\s*$/.test(String(previous).trim());
      const hasAnswer = !isCountryCodeOnly && (Array.isArray(previous) ? previous.length > 0 : (typeof previous === 'boolean' ? previous : Boolean(previous && String(previous).trim().length > 0)));
      let write;
      const isProfileFact = Boolean(plan.factKey && !plan.ai);
      if (hasAnswer && !plan.overwriteExisting) {
        write = { expected: previous, preserved: true };
      } else if (hasAnswer && !isProfileFact) {
        const option = field.options?.length ? choose(field, value) : null;
        if (equals(previous, option?.label ?? value)) write = { expected: previous };
      } else if (hasAnswer && isProfileFact && equals(previous, value)) {
        write = { expected: previous };
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
          if (previous !== boolVal) setCheckbox(currentEl, boolVal);
          write = { expected: boolVal };
        }
      } else {
        const expected = currentEl.maxLength > 0 ? String(value).slice(0, currentEl.maxLength) : String(value);
        writeValue(currentEl, expected);
        write = { expected };
      }
      if (!write) continue;

      const verified = () => session.isCurrent() && field.element?.isConnected &&
        (equals(read(field), write.expected) || write.matches?.(read(field)) ||
         (field.kind === 'combobox' && write.expected && String(read(field) || '').toLowerCase().includes(String(write.expected).toLowerCase())) ||
         (write.option && !write.option.isConnected && write.expected) ||
         (write.option?.isConnected && selected(write.option)));

      const isVerified = await waitForVerification(verified, session, 250, 25);
      if (!isVerified) continue;

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
    advanceStep,
    ensureConnectedElement,
    waitForFieldReady,
    waitForVerification
  };
})(globalThis);
