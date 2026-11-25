(function (root) {
  const mapping = root.NextkinFieldMapping;
  const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const wait = ms => new Promise(resolve => {
    const timerFn = (typeof setTimeout === 'function') ? setTimeout
      : (typeof globalThis.setTimeout === 'function') ? globalThis.setTimeout
      : (typeof root.setTimeout === 'function') ? root.setTimeout
      : null;
    if (timerFn) {
      timerFn(resolve, ms);
    } else {
      resolve();
    }
  });
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
    '[data-floating-ui-portal]',
    '.select2-dropdown',
    '.k-animation-container',
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
    '[class*="autocomplete-popup" i]',
    '[class*="floatingContainer" i]',
    '.dialog-content'
  ].join(', ');

  const optionLabel = option => option.label || option.value;

  const isMultiKind = kind => {
    if (mapping?.isMultiKind) return mapping.isMultiKind(kind);
    return kind === 'multi-select' || kind === 'checkbox-group';
  };

  const isChoiceKind = kind => {
    if (mapping?.isChoiceKind) return mapping.isChoiceKind(kind);
    return kind === 'select' || kind === 'radio' || kind === 'choice';
  };

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
    el.getAttribute('data-state') === 'checked' || el.getAttribute('data-state') === 'on' ||
    el.getAttribute('data-state') === 'active' || el.getAttribute('data-active') === 'true' ||
    (el.matches && el.matches('.active, .selected, .is-selected'))
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

  function getNativePropertyDescriptor(element, prop = 'value') {
    if (!element) return null;
    const view = element.ownerDocument?.defaultView || globalThis;
    const proto = element.tagName === 'SELECT'
      ? (view.HTMLSelectElement?.prototype || globalThis.HTMLSelectElement?.prototype)
      : element.tagName === 'TEXTAREA'
      ? (view.HTMLTextAreaElement?.prototype || globalThis.HTMLTextAreaElement?.prototype)
      : (view.HTMLInputElement?.prototype || globalThis.HTMLInputElement?.prototype);

    if (proto) {
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (desc?.set) return desc;
    }

    let p = Object.getPrototypeOf(element);
    while (p && p !== Object.prototype) {
      const desc = Object.getOwnPropertyDescriptor(p, prop);
      if (desc?.set) return desc;
      p = Object.getPrototypeOf(p);
    }
    return null;
  }

  function setNativeValue(element, value, shouldBlur = true) {
    if (!element) return false;
    const view = element.ownerDocument?.defaultView || globalThis;
    const strVal = value == null ? '' : String(value);

    if (element.isContentEditable) {
      element.textContent = strVal;
    } else {
      const prevValue = element.value;
      const desc = getNativePropertyDescriptor(element, 'value');
      if (desc?.set) {
        desc.set.call(element, strVal);
      } else {
        element.value = strVal;
      }
      if (element._valueTracker) {
        try {
          element._valueTracker.setValue?.(prevValue ?? '');
        } catch {}
      }
    }

    const Evt = view.Event || globalThis.Event;
    const FocusEvt = view.FocusEvent || view.Event || globalThis.FocusEvent || globalThis.Event;
    try {
      element.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
    } catch {}
    try {
      element.dispatchEvent(new Evt('change', { bubbles: true }));
    } catch {}
    // Workday's React controlled fields need the component's own handler; synthetic events alone
    // are isTrusted:false and are ignored. Restrict this to Workday automation-id controls so other
    // portals keep the standard event sequence.
    if (element.getAttribute?.('data-automation-id')) {
      commitFiberChange(element, strVal);
      if (shouldBlur) commitFiberBlur(element);
    }
    if (shouldBlur) {
      try {
        element.dispatchEvent(new FocusEvt('blur', { bubbles: true, composed: true }));
      } catch {}
    }

    return true;
  }

  function writeValue(el, value) {
    return setNativeValue(el, value);
  }

  function setCheckbox(el, targetChecked) {
    if (!el?.isConnected || el.disabled || el.getAttribute?.('aria-disabled') === 'true') return false;
    const desired = Boolean(targetChecked);
    const view = el.ownerDocument?.defaultView || globalThis;

    if (checked(el) === desired) {
      return true;
    }

    const target = findClickableTarget(el) || el;
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

    if (checked(el) === desired) {
      return true;
    }

    // If still not toggled (e.g. React controlled component ignoring synthetic click):
    if (el._valueTracker) {
      try {
        el._valueTracker.setValue?.(String(!desired));
      } catch {}
    }

    const desc = getNativePropertyDescriptor(el, 'checked');
    try {
      if (desc?.set) {
        desc.set.call(el, desired);
      } else if (el.tagName === 'INPUT' || 'checked' in el) {
        el.checked = desired;
      }
    } catch {
      if (el.tagName === 'INPUT' || 'checked' in el) {
        el.checked = desired;
      }
    }

    const Evt = view.Event || globalThis.Event;
    try {
      el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
    } catch {}
    try {
      el.dispatchEvent(new Evt('change', { bubbles: true }));
    } catch {}

    return checked(el) === desired;
  }

  function setRadio(option) {
    const el = option.element;
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const view = el.ownerDocument?.defaultView || globalThis;
    const target = findClickableTarget(el) || el;
    if (el.tagName !== 'INPUT') {
      if (selected(el)) return true;
      try {
        const ok = click(target);
        notify(el);
        if (target !== el) notify(target);
        return ok;
      } catch { return false; }
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
        el._valueTracker?.setValue?.('false');
      } catch {
        el.checked = true;
      }
      try {
        const Evt = view.Event;
        el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    }

    // Ensure sibling radios in the same group are unchecked
    if (el.tagName === 'INPUT' && (el.type === 'radio' || el.getAttribute?.('type') === 'radio')) {
      const siblings = getRadioGroupElements(el);
      for (const sib of siblings) {
        if (sib !== el && sib.tagName === 'INPUT' && (sib.type === 'radio' || sib.getAttribute?.('type') === 'radio')) {
          sib.checked = false;
        }
      }
    }

    return el.tagName === 'INPUT' && el.type === 'radio' ? el.checked : true;
  }

  function comboInput(el) {
    const input = el.tagName === 'INPUT' ? el : el.querySelector?.('input:not([type=hidden])') || el.querySelector?.('input');
    return input?.type === 'hidden' ? null : input;
  }

  function comboTrigger(el) {
    if (!el) return null;
    if (el.tagName === 'BUTTON' || (el.matches && el.matches('button, [data-slot="select-trigger"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]'))) return el;
    const btn = el.querySelector ? el.querySelector('button, [data-slot="select-trigger"], [class*="select-trigger" i], [class*="selectTrigger" i], [role="combobox"], [aria-haspopup="listbox"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]') : null;
    if (btn) return btn;
    const role = (el.getAttribute ? el.getAttribute('role') : null) || '';
    const popup = (el.getAttribute ? el.getAttribute('aria-haspopup') : null) || '';
    if (role.toLowerCase() === 'combobox' || popup.toLowerCase() === 'listbox' || popup.toLowerCase() === 'true') return el;
    if (el.matches && el.matches('[role="combobox"], [aria-haspopup="listbox"]')) return el;
    return comboInput(el) || el;
  }

  function comboSearchInput(el, roots = []) {
    const local = comboInput(el);
    if (local && !local.readOnly && local.type !== 'button') return local;
    for (const root of roots) {
      if (!root?.isConnected) continue;
      const input = root.querySelector('input:not([type=hidden]):not([readonly]), [role="searchbox"], [cmdk-input]');
      if (input) return input;
    }
    return local && !local.readOnly ? local : null;
  }

  function comboValue(el) {
    const root = el.closest?.('.select, .select__container, .select__control, [class*="select__control" i], [class*="select-container" i], [class*="select-shell" i]') || el.parentElement || el;
    const display = (el.querySelector ? el.querySelector('[data-placeholder], .select2-selection__rendered, .ng-value-label, .k-input-value-text, [data-slot="select-value"], [class*="singleValue" i], [class*="single-value" i], [class*="select__single-value" i]') : null) ||
      root.querySelector?.('[data-placeholder], .select2-selection__rendered, .ng-value-label, .k-input-value-text, [data-slot="select-value"], [class*="singleValue" i], [class*="single-value" i], [class*="select__single-value" i]');
    const input = comboInput(el);
    const committed = input && committedAutocomplete.get(input);
    const trigger = comboTrigger(el);
    const selectOnly = !input && trigger?.getAttribute?.('aria-expanded') !== 'true' &&
      (trigger?.tagName === 'BUTTON' || trigger?.getAttribute?.('role') === 'combobox') &&
      !trigger.querySelector?.(listboxSelector);
    const value = (display?.textContent ||
      (input?.list || (committed && input.value === committed) ? input.value : '') ||
      (selectOnly ? trigger.textContent : '') || '').trim();
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
          return !opt.disabled && !placeholder.test(lbl) && opt.value !== '' ? lbl : '';
        }
        return (field.options || []).find(option => option?.element?.selected && !placeholder.test(option.label))?.label || '';
      }
      case 'radio': return field.options.find(option => checked(option.element) || selected(option.element))?.label || '';
      case 'choice': return field.options.find(option => selected(option.element) || checked(option.element))?.label || '';
      case 'combobox': return comboValue(el);
      case 'multi-combobox': {
        const scope = el.closest?.('.select__control, [class*="select__control" i], [class*="select-shell" i], .ng-select, .select2-selection') || el;
        const chips = scope.querySelectorAll ? scope.querySelectorAll('.ng-value-label, .select2-selection__choice__display, .k-chip-label, [data-slot="multi-select-value"], [class*="multi-value__label" i], [class*="multiValue" i]') : [];
        return [...chips].map(chip => chip.textContent.trim()).filter(Boolean);
      }
      case 'resume-file': return el?.files?.[0]?.name || (el?.value ? String(el.value).split(/[/\\]/).pop() : '');
      default: return el.isContentEditable ? el.textContent.trim() : el.value?.trim() || '';
    }
  }

  const openedMenus = new WeakMap();
  const committedAutocomplete = new WeakMap();
  const visibleMenus = doc => [...(doc?.querySelectorAll?.(listboxSelector) || [])]
    .filter(node => !node.getClientRects || node.getClientRects().length);

  // Condition-based waiting: wake on DOM mutations (options rendered asynchronously by React/ARIA
  // comboboxes) and poll briefly for non-mutating frameworks, bounded by the caller's deadline.
  async function waitForOptions(el, isCurrent, maxMs) {
    const doc = el?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const started = Date.now();
    let options = comboOptions(el);
    while (!options.length && isCurrent() && Date.now() - started < maxMs) {
      await new Promise(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          try { observer?.disconnect(); } catch {}
          clearTimeout(timer);
          resolve();
        };
        const observer = typeof MutationObserver !== 'undefined' && doc?.body
          ? new MutationObserver(finish) : null;
        if (observer) observer.observe(doc.body, { childList: true, subtree: true,
          attributes: true, attributeFilter: ['aria-expanded', 'aria-activedescendant', 'class', 'style'] });
        const timer = setTimeout(finish, 40);
      });
      options = comboOptions(el);
    }
    return options;
  }

  function reactProps(el) {
    if (!el) return null;
    const key = Object.keys(el).find(name => /^__reactProps\$/.test(name));
    return key ? el[key] : null;
  }
  // Workday controlled inputs ignore synthetic DOM events (isTrusted:false). Calling the
  // component's own handler is the only reliable way to commit those values.
  function commitFiberChange(el, value) {
    const handler = reactProps(el)?.onChange;
    if (typeof handler !== 'function') return false;
    try {
      handler({ target: el, currentTarget: el, type: 'change', preventDefault() {}, stopPropagation() {} });
      return true;
    } catch { return false; }
  }
  function commitFiberBlur(el) {
    const handler = reactProps(el)?.onBlur;
    if (typeof handler !== 'function') return false;
    try {
      handler({ target: el, currentTarget: el, type: 'blur', preventDefault() {}, stopPropagation() {} });
      return true;
    } catch { return false; }
  }
  function triggerWorkdaySearch(el, query) {
    const handler = reactProps(el)?.onKeyDown || reactProps(comboInput(el))?.onKeyDown;
    if (typeof handler !== 'function') return false;
    try {
      handler({ key: 'Tab', code: 'Tab', keyCode: 9, target: { value: query }, currentTarget: el,
        preventDefault() {}, stopPropagation() {} });
      return true;
    } catch { return false; }
  }

  // Verify the selection committed to the control (display value), not just that an option was
  // clicked. Re-renders and stale search text otherwise look like a successful fill.
  async function waitForCommitted(field, expected, isCurrent, maxMs = 600) {
    const doc = field.element?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const started = Date.now();
    let actual = comboValue(field.element);
    while (normalize(actual) !== normalize(expected) && isCurrent() && Date.now() - started < maxMs) {
      await new Promise(resolve => {
        let done = false;
        const finish = () => { if (done) return; done = true; try { observer?.disconnect(); } catch {} clearTimeout(timer); resolve(); };
        const observer = typeof MutationObserver !== 'undefined' && doc?.body ? new MutationObserver(finish) : null;
        if (observer) observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-expanded'] });
        const timer = setTimeout(finish, 40);
      });
      actual = comboValue(field.element);
    }
    return normalize(actual) === normalize(expected);
  }

  function getListboxRoots(el) {
    if (!el) return [];
    const control = comboInput(el) || el;
    const ids = [el, control, comboTrigger(el)].flatMap(node => [node?.getAttribute?.('aria-controls'), node?.getAttribute?.('aria-owns')])
      .filter(Boolean).flatMap(idStr => idStr.split(/\s+/));
    const doc = el.ownerDocument || globalThis.document;
    const view = doc?.defaultView || globalThis;
    const isVisible = node => {
      if (!node) return false;
      if (node.getClientRects && !node.getClientRects().length) return false;
      const style = view.getComputedStyle?.(node);
      if (!style) return true;
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    const roots = ids.map(id => el.getRootNode?.().getElementById?.(id) || doc.getElementById?.(id)).filter(r => r && isVisible(r));

    if (ids.length) return [...new Set(roots)];
    const container = el.closest?.('.select, .select__container, .select-shell, [class*="form-group"], [class*="field-container"], [class*="application-question"]') || el.parentElement || el;
    const localRoot = container === doc?.body ? el : container;
    const local = [...(localRoot.querySelectorAll?.(listboxSelector) || [])].filter(isVisible);
    if (local.length) return local.length === 1 ? local : [];
    const interaction = openedMenus.get(el);
    const expanded = [el, control, comboTrigger(el)].some(node => node?.getAttribute?.('aria-expanded') === 'true');
    if (!interaction) return [];
    const ashby = el.matches?.('.ashby-application-form-input-autocomplete');
    if (!expanded && !ashby) return [];
    if (interaction.menu?.isConnected && isVisible(interaction.menu)) return [interaction.menu];
    const menus = visibleMenus(doc).filter(menu => !interaction.before.has(menu) && isVisible(menu) && (expanded || menu.matches?.('.ashby-application-form-input-autocomplete-popup')));
    const deepest = menus.filter(menu => !menus.some(other => other !== menu && menu.contains(other)));
    if (deepest.length !== 1) return [];
    interaction.menu = deepest[0];
    return deepest;
  }

  function comboOptions(el) {
    const roots = getListboxRoots(el);
    const doc = el.ownerDocument || globalThis.document;
    const view = doc?.defaultView || globalThis;
    const isVisible = node => {
      if (!node) return false;
      if (node.getClientRects && !node.getClientRects().length) return false;
      const style = view.getComputedStyle?.(node);
      if (!style) return true;
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    if (!roots.length) return [];

    const candidateNodes = roots.flatMap(menu => {
      const opts = menu.querySelectorAll ? [...menu.querySelectorAll(optionSelector)] : [];
      if (menu.matches && menu.matches(optionSelector)) opts.unshift(menu);
      return opts;
    });

    return [...new Set(candidateNodes)]
      .filter(option => isVisible(option) && !option.disabled && option.getAttribute('aria-disabled') !== 'true' &&
        !option.matches?.('.disabled, .ng-option-disabled, .select2-results__option--disabled, [aria-disabled="true"]'))
      .map(element => ({
        element,
        label: (element.getAttribute('aria-label') || element.getAttribute('data-label') || element.textContent).trim(),
        value: element.getAttribute('data-value') || element.getAttribute('value') || ''
      }))
      .filter(option => option.label && !placeholder.test(option.label));
  }

  function choose(field, desired) {
    return mapping?.pickOption?.(field, desired, field.factKey) || null;
  }

  function isComboOpen(el) {
    if (!el) return false;
    const trigger = comboTrigger(el);
    const input = comboInput(el);
    for (const node of [el, trigger, input]) {
      if (node?.getAttribute?.('aria-expanded') === 'true') return true;
    }

    const roots = getListboxRoots(el);
    const doc = el.ownerDocument || globalThis.document;
    const view = doc?.defaultView || globalThis;
    for (const root of roots) {
      if (!root || !root.isConnected) continue;
      if (root.tagName === 'BODY' || root.tagName === 'HTML' || (root.matches && root.matches('.modal, .modal-dialog, .dialog-content, [role="dialog"]'))) continue;
      if (root.getClientRects && root.getClientRects().length > 0) {
        const style = view.getComputedStyle ? view.getComputedStyle(root) : null;
        if (!style || (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0')) {
          return true;
        }
      }
    }
    return false;
  }

  function closeCombo(el, force = false) {
    if (!el) return;
    const view = el.ownerDocument?.defaultView || globalThis;
    const doc = el.ownerDocument || globalThis.document;
    const search = comboSearchInput(el, getListboxRoots(el));
    const input = comboInput(el);
    const trigger = comboTrigger(el);

    if (force || isComboOpen(el)) {
      const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
      const targets = [search, input, trigger, el, doc?.activeElement].filter(Boolean);
      for (const target of targets) {
        try {
          target.dispatchEvent(new KeyEvt('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true }));
          target.dispatchEvent(new KeyEvt('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true }));
        } catch {}
      }
    }

    // Always blur cleanly
    const FocusEvt = view.FocusEvent || view.Event || globalThis.FocusEvent || globalThis.Event;
    openedMenus.delete(el);
    const blurTargets = [search, input, trigger, el].filter(Boolean);
    for (const target of blurTargets) {
      try {
        target.blur?.();
        target.dispatchEvent(new FocusEvt('blur', { bubbles: true, composed: true }));
      } catch {}
    }
  }

  async function openComboOptions(el, trigger, isCurrent = () => true, requireClick = false, config = {}) {
    const doc = el.ownerDocument || globalThis.document;
    openedMenus.set(el, { before: new Set(visibleMenus(doc)), menu: null });
    const clickedTrigger = click(trigger);
    const ctrl = el.closest?.('.select__control, [class*="select__control" i]');
    const clickedCtrl = ctrl && ctrl !== trigger ? click(ctrl) : false;
    if (requireClick && !clickedTrigger && !clickedCtrl) return [];

    let options = [];
    // Bounded wait driven by option appearance / DOM mutations, not a global fixed delay.
    options = await waitForOptions(el, isCurrent, Number(config.maxOptionWaitMs) || 400);
    // ArrowDown fallback if options still not open
    if (!options.length && isCurrent()) {
      try {
        const view = el.ownerDocument?.defaultView || globalThis;
        const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
        (trigger || el).dispatchEvent(new KeyEvt('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
        (trigger || el).dispatchEvent(new KeyEvt('keyup', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
      } catch {}
      options = await waitForOptions(el, isCurrent, Math.max(250, Number(config.maxOptionWaitMs) || 0));
    }
    return options;
  }

  async function readChoices(field, isCurrent = () => true) {
    if ((field.kind !== 'combobox' && field.kind !== 'multi-combobox') || field.options.length) return field.options;
    const el = field.element;
    const trigger = comboTrigger(el);
    if (!isCurrent() || !trigger) return [];
    const existing = comboOptions(el);
    if (existing.length) return existing;
    try {
      return await openComboOptions(el, trigger, isCurrent, true);
    } finally {
      if (isCurrent()) closeCombo(el);
    }
  }

  async function fillCombo(field, desired, isCurrent = () => true, config = {}) {
    const el = field.element;
    const input = comboInput(el);
    if (input) committedAutocomplete.delete(input);
    if (input?.list) {
      const option = choose(field, desired);
      if (!option) return null;
      setNativeValue(input, option.value);
      return { expected: option.value };
    }

    if (el.matches?.('.ashby-application-form-input-autocomplete') && !field.factKey) field = { ...field, factKey: 'current_location' };
    const trigger = comboTrigger(el);
    let options = comboOptions(el);

    // If options not open, click trigger to open listbox
    if (!options.length && trigger) {
      options = await openComboOptions(el, trigger, isCurrent, false, config);
    }

    // Match candidate value against option text
    let option = choose({ ...field, options }, desired);

    // If no immediate match, wait for async options to settle (cascading parent just selected,
    // server-side typeahead). The bound is configurable per consequential field.
    if (!option) {
      options = await waitForOptions(el, isCurrent, Number(config.maxOptionWaitMs) || 400);
      option = choose({ ...field, options }, desired);
    }

    if (option && isCurrent() && el.isConnected) {
      const ok = click(option.element);
      try {
        const view = el.ownerDocument?.defaultView || globalThis;
        const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
        option.element.dispatchEvent(new KeyEvt('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      } catch {}
      closeCombo(el);
      if (ok && config.requireCommittedSelection && !(await waitForCommitted(field, option.label, isCurrent))) return null;
      return ok ? { expected: option.label } : null;
    }

    // Type into combobox search input if present (Typeahead search fallback)
    const roots = getListboxRoots(el);
    const search = comboSearchInput(el, roots);
    let typed = false;
    const query = typeof desired === 'boolean' ? (desired ? 'Yes' : 'No') : String(desired);
    if (search && !search.readOnly && isCurrent()) {
      search.focus?.();
      setNativeValue(search, query, false);
      const view = search.ownerDocument?.defaultView || globalThis;
      const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
      if (KeyEvt) {
        try {
          search.dispatchEvent(new KeyEvt('keydown', { key: query.slice(-1) || 'a', bubbles: true }));
          search.dispatchEvent(new KeyEvt('keyup', { key: query.slice(-1) || 'a', bubbles: true }));
        } catch {}
      }
      typed = true;
      // Workday's async typeahead ignores ordinary typing: the component's own onKeyDown handler
      // is what starts the server search for promptOption results.
      if (el.getAttribute?.('data-automation-id')) triggerWorkdaySearch(el, query);
      options = await waitForOptions(el, isCurrent, Number(config.maxOptionWaitMs) || 1200);
      option = choose({ ...field, options }, desired);
    }

    if (option && isCurrent() && el.isConnected) {
      const ok = click(option.element);
      try {
        const view = el.ownerDocument?.defaultView || globalThis;
        const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
        option.element.dispatchEvent(new KeyEvt('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      } catch {}
      closeCombo(el);
      if (ok && search === input && normalize(query) !== normalize(option.label) && normalize(input?.value) === normalize(option.label)) {
        committedAutocomplete.set(input, input.value);
      }
      if (ok && config.requireCommittedSelection && !(await waitForCommitted(field, option.label, isCurrent))) return null;
      return ok ? { expected: option.label } : null;
    }

    // Close with Escape fallback
    if (typed && search && normalize(search.value) === normalize(query)) {
      setNativeValue(search, '');
    }
    closeCombo(el);
    return null;
  }

  function setChoice(field, desired) {
    const option = choose(field, desired);
    if (!option) return null;
    if (field.kind === 'select') {
      const el = field.element;
      setNativeValue(el, option.value);
      if (option.element && typeof option.element.index === 'number') {
        el.selectedIndex = option.element.index;
      } else {
        const idx = Array.from(el.options || []).findIndex(o => o.value === option.value || o === option.element);
        if (idx >= 0) el.selectedIndex = idx;
      }
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
    return { expected };
  }

  async function fillMultiCombo(field, values, isCurrent) {
    const normalizedValues = Array.isArray(values)
      ? values
      : (typeof values === 'string' && values.trim()
        ? values.split(/[,;\n]+/).map(v => v.trim()).filter(Boolean)
        : []);
    if (!normalizedValues.length) return null;
    const requested = [...new Set(normalizedValues.map(value => String(value).trim()).filter(Boolean))];
    if (requested.length > 20) return null;
    const expected = [];
    for (const value of requested) {
      if (!isCurrent() || !field.element.isConnected) break;
      const result = await fillCombo(field, value, isCurrent);
      if (result) expected.push(result.expected);
    }
    if (isCurrent()) closeCombo(field.element);
    return { expected: expected.length === requested.length ? expected : requested, partial: expected.length < requested.length };
  }

  function equals(value, expected, field) {
    if (Array.isArray(expected)) {
      const wanted = new Set(expected.map(normalize));
      const actual = new Set(Array.isArray(value) ? value.map(normalize) : []);
      return wanted.size > 0 && actual.size === wanted.size && [...wanted].every(answer => actual.has(answer));
    }
    if (value == null || expected == null) return false;
    if (typeof expected === 'boolean') return value === expected;
    if (field?.element?.type === 'tel') {
      const digits = phone => /^[+() .\d-]+$/.test(String(phone)) ? String(phone).replace(/\D/g, '') : '';
      const a = digits(value), b = digits(expected);
      if (a.length >= 7 && b.length >= 7) return a === b;
    }
    if (mapping?.isUrlField?.(field)) return String(value).trim() === String(expected).trim();
    return normalize(value) === normalize(expected);
  }

  function isAnswered(field, value = read(field)) {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return field.kind !== 'checkbox' || value;
    return value != null && String(value).trim() !== '' && !placeholder.test(String(value).trim());
  }

  // Dual-layer edit tracking & durable field store across wizard step transitions
  const userEditedElements = new WeakSet();
  const durableFieldStore = new Map();
  const preservedStore = durableFieldStore;

  function getRadioGroupElements(control) {
    if (!control) return [];
    const isRadio = (control.tagName === 'INPUT' && (control.type === 'radio' || control.getAttribute?.('type') === 'radio')) ||
                    control.getAttribute?.('role') === 'radio';
    if (!isRadio) return [];

    const group = new Set([control]);
    const name = control.name || control.getAttribute?.('name');
    const doc = control.ownerDocument || globalThis.document;

    if (name && doc) {
      const scope = control.form || (control.getRootNode ? control.getRootNode() : null) || doc;
      if (scope.querySelectorAll) {
        try {
          const matches = scope.querySelectorAll(`input[name="${safeCssEscape(name)}"], [role="radio"][name="${safeCssEscape(name)}"]`);
          for (const m of matches) {
            if ((m.tagName === 'INPUT' && (m.type === 'radio' || m.getAttribute?.('type') === 'radio')) || m.getAttribute?.('role') === 'radio') {
              group.add(m);
            }
          }
        } catch {}
      }
    }

    const radiogroup = control.closest?.('[role="radiogroup"], fieldset');
    if (radiogroup && radiogroup.querySelectorAll) {
      try {
        const matches = radiogroup.querySelectorAll('input[type="radio"], [role="radio"]');
        for (const m of matches) {
          group.add(m);
        }
      } catch {}
    }

    return Array.from(group);
  }

  function resolveTargetControl(node) {
    if (!node) return null;
    const label = node.tagName === 'LABEL' ? node : node.closest?.('label');
    if (label) {
      if (label.control) return label.control;
      const forId = label.htmlFor || label.getAttribute?.('for');
      if (forId) {
        const doc = label.ownerDocument || globalThis.document;
        const ctrl = doc?.getElementById?.(forId) || doc?.querySelector?.(`[id="${safeCssEscape(forId)}"]`);
        if (ctrl) return ctrl;
      }
      const inner = label.querySelector?.('input, select, textarea, [role="radio"], [role="checkbox"], [role="combobox"], [role="switch"]');
      if (inner) return inner;
    }
    return node.closest?.('input, select, textarea, [role="radio"], [role="checkbox"], [role="combobox"], [role="switch"]') || node;
  }

  function handleUserInteraction(evt) {
    if (!evt || (!evt.isTrusted && !evt._isTrusted)) return;
    const target = evt.target;
    if (!target) return;

    const control = resolveTargetControl(target);
    if (!control) return;

    userEditedElements.add(control);
    if (target !== control) {
      userEditedElements.add(target);
    }

    const isRadio = (control.tagName === 'INPUT' && (control.type === 'radio' || control.getAttribute?.('type') === 'radio')) ||
                    control.getAttribute?.('role') === 'radio';
    if (isRadio) {
      const groupRadios = getRadioGroupElements(control);
      for (const r of groupRadios) {
        userEditedElements.add(r);
      }
    }
  }

  function installUserEditTracking(doc = root.document || globalThis.document) {
    if (!doc || typeof doc.addEventListener !== 'function') return;
    const events = ['change', 'input', 'click', 'keydown'];
    for (const eventName of events) {
      try {
        doc.addEventListener(eventName, handleUserInteraction, true);
      } catch {}
    }
  }

  if (typeof root.document !== 'undefined') {
    installUserEditTracking(root.document);
  } else if (typeof globalThis.document !== 'undefined') {
    installUserEditTracking(globalThis.document);
  }

  function isFieldUserEdited(field) {
    if (!field) return false;
    const stored = (field.key && durableFieldStore.get(field.key)) ||
                   (field.label && durableFieldStore.get('label:' + normalize(field.label)));
    if (stored && typeof stored === 'object' && stored.userEdited) {
      return true;
    }
    if (field.element && userEditedElements.has(field.element)) {
      return true;
    }
    if (Array.isArray(field.options)) {
      for (const opt of field.options) {
        if (opt.element && userEditedElements.has(opt.element)) return true;
      }
    }
    if (field.element) {
      const radios = getRadioGroupElements(field.element);
      for (const r of radios) {
        if (userEditedElements.has(r)) return true;
      }
    }
    return false;
  }

  function isFieldUnfilled(field, domVal) {
    if (!field) return true;
    if (domVal == null) return true;
    if (Array.isArray(domVal)) return domVal.length === 0;
    if (typeof domVal === 'string') {
      const trimmed = domVal.trim();
      if (!trimmed) return true;
      if (placeholder.test(trimmed) || /^(?:(?:please\s+)?(?:select|choose)|--|placeholder)/i.test(trimmed)) return true;
    }

    const el = field.element;
    if (el?.tagName === 'SELECT' || field.kind === 'select') {
      if (el?.selectedIndex != null && el.selectedIndex <= 0) {
        const opt = el.options?.[el.selectedIndex];
        const optVal = (opt?.value || opt?.text || '').trim();
        if (!optVal || placeholder.test(optVal) || /select|choose|--|placeholder/i.test(optVal)) {
          return true;
        }
      }
    }

    if (field.kind === 'radio' || field.kind === 'choice') {
      if (!isFieldUserEdited(field)) {
        const checkedOpt = (field.options || []).find(opt => checked(opt.element) || selected(opt.element));
        if (!checkedOpt) return true;
        const optEl = checkedOpt.element;
        const isDefaultChecked = Boolean(
          optEl?.defaultChecked ||
          optEl?.hasAttribute?.('checked') ||
          optEl?.getAttribute?.('data-default-checked') === 'true'
        );
        if (isDefaultChecked) {
          return true;
        }
      }
    }

    return false;
  }

  function recordPreservedValues(fields) {
    if (!Array.isArray(fields)) return durableFieldStore;
    for (const f of fields) {
      if (!f?.element?.isConnected) continue;
      const val = read(f);
      const hasVal = Array.isArray(val) ? val.length > 0 : (typeof val === 'boolean' ? true : Boolean(val));
      if (hasVal) {
        const record = { value: val, userEdited: isFieldUserEdited(f) };
        if (f.key) durableFieldStore.set(f.key, record);
        if (f.label) durableFieldStore.set('label:' + normalize(f.label), record);
      }
    }
    return durableFieldStore;
  }

  function getPreservedValue(field) {
    if (!field) return undefined;
    const entry = (field.key && durableFieldStore.get(field.key)) ||
                  (field.label && durableFieldStore.get('label:' + normalize(field.label)));
    if (entry !== undefined) {
      return entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry;
    }
    return undefined;
  }

  function clearPreservedValues() {
    durableFieldStore.clear();
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

  // Rediscover replaced controls on the next pass. A repeated name can now
  // refer to a different employment record.
  function ensureConnectedElement(field) {
    return field?.element?.isConnected ? field.element : null;
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
        if (!validOpts.length && cur.options && cur.options.length <= 1) return false;
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

  const ResumeUploadState = {
    FILE_ASSIGNED: 'FILE_ASSIGNED',
    UPLOAD_PENDING: 'UPLOAD_PENDING',
    UPLOAD_CONFIRMED: 'UPLOAD_CONFIRMED',
    UPLOAD_FAILED: 'UPLOAD_FAILED',
    MANUAL_REQUIRED: 'MANUAL_REQUIRED',
  };

  function inspectUploadStatus(fileInput, expectedFilename) {
    const container = fileInput?.closest?.('form, [data-automation-id], .field, .upload, div') || fileInput?.parentElement;
    if (!container?.querySelector) return ResumeUploadState.FILE_ASSIGNED;
    const errorEl = container.querySelector('[role="alert"], .error, [class*="upload-error" i], [data-automation-id*="error" i]');
    if (errorEl && /upload|file|resume|fail|error|invalid/i.test(errorEl.textContent || '')) {
      return ResumeUploadState.UPLOAD_FAILED;
    }
    const busyEl = container.querySelector('[aria-busy="true"], [role="progressbar"], .uploading, [class*="uploading" i], [class*="spinner" i]');
    if (busyEl) return ResumeUploadState.UPLOAD_PENDING;
    const text = (container.textContent || '').toLowerCase();
    if (expectedFilename && text.includes(String(expectedFilename).toLowerCase())) {
      return ResumeUploadState.UPLOAD_CONFIRMED;
    }
    return ResumeUploadState.FILE_ASSIGNED;
  }

  async function attachResumeFile(fileInput, resume, isCurrent = () => true) {
    if (!fileInput?.isConnected || fileInput.type !== 'file' || !resume?.base64 || fileInput.files?.length || !isCurrent()) return null;
    try {
      const bytes = Uint8Array.from(atob(resume.base64), char => char.charCodeAt(0));
      const expected = resume.filename || 'Resume.pdf';
      const transfer = new DataTransfer();
      const file = new File([bytes], expected, { type: resume.mimeType || 'application/pdf' });
      transfer.items.add(file);
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      const actual = fileInput.files?.[0];
      if (!actual || actual.name !== expected || actual.size !== bytes.length || actual.type !== file.type) return null;
      const attached = new Uint8Array(await actual.arrayBuffer());
      if (!isCurrent() || !fileInput.isConnected || fileInput.files?.[0] !== actual ||
        attached.length !== bytes.length || !attached.every((byte, index) => byte === bytes[index])) {
        return null;
      }
      const uploadState = inspectUploadStatus(fileInput, expected);
      if (uploadState === ResumeUploadState.UPLOAD_FAILED) return null;
      return { expected, file: actual, uploadState };
    } catch {
      return null;
    }
  }

  function verifyWrites(plans) {
    const filled = [];
    const unverified = [];
    const manual = [];
    const unmapped = [];

    if (!Array.isArray(plans)) {
      return { filled, unverified, manual, unmapped };
    }

    for (const plan of plans) {
      if (plan.status === 'manual') {
        manual.push(plan);
        continue;
      }
      if (plan.status !== 'supported') {
        unmapped.push(plan);
        continue;
      }

      const field = plan.field;
      if (!field || !field.element || !field.element.isConnected) {
        unverified.push({
          ...plan,
          field: plan.field,
          expected: plan.value,
          actual: null,
          status: 'unverified'
        });
        continue;
      }

      if (plan._writeFailed) {
        unverified.push({
          ...plan,
          field: plan.field,
          expected: plan.value,
          actual: read(field),
          status: 'unverified'
        });
        continue;
      }

      const actual = read(field);
      const expected = plan.writtenValue ?? plan.expected ?? plan._writtenExpected ?? plan.value;
      const write = plan._write;

      const isVerified = !write?.conflict && !write?.partial && equals(actual, expected, field);
      const partial = write?.partial || (Array.isArray(expected) && Array.isArray(actual) &&
        actual.length > 0 && actual.length < expected.length &&
        actual.every(value => expected.some(option => normalize(value) === normalize(option))));

      if (isVerified) {
        recordPreservedValues([field]);
        filled.push({
          ...plan,
          field: plan.field,
          value: plan.value,
          writtenValue: expected,
          ai: !!plan.ai,
          learned: !!plan.learned,
          status: write?.alreadyCorrect ? 'already_correct' : 'filled'
        });
      } else {
        unverified.push({
          ...plan,
          field: plan.field,
          expected,
          actual,
          status: write?.conflict ? (write.preserved ? 'preserved_user_value' : 'conflict') :
            partial ? 'partial' : 'unverified'
        });
      }
    }

    return { filled, unverified, manual, unmapped };
  }

  function sortCascadingPlans(plans) {
    if (!Array.isArray(plans) || plans.length <= 1) return plans;

    const getRank = plan => {
      const f = plan?.field || {};
      const str = `${plan?.factKey || ''} ${f.key || ''} ${f.label || ''} ${f.name || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
      if (/\bcountry\b/.test(str)) return 1;
      if (/\b(state|province|region)\b/.test(str)) return 2;
      if (/\bcity\b/.test(str)) return 3;
      return 0;
    };

    const cascadeIndices = [];
    const cascadePlans = [];
    for (let i = 0; i < plans.length; i++) {
      const rank = getRank(plans[i]);
      if (rank > 0) {
        cascadeIndices.push(i);
        cascadePlans.push({ plan: plans[i], rank });
      }
    }

    if (cascadePlans.length <= 1) return plans;

    cascadePlans.sort((a, b) => a.rank - b.rank);

    const result = [...plans];
    for (let i = 0; i < cascadeIndices.length; i++) {
      result[cascadeIndices[i]] = cascadePlans[i].plan;
    }
    return result;
  }

  async function applyFill(plans, session = {}) {
    const ctx = typeof session?.isCurrent === 'function' ? session : { isCurrent: () => true, ...session };
    const sortedPlans = sortCascadingPlans(plans);

    for (const plan of sortedPlans) {
      const { field, value } = plan;
      delete plan._writeFailed;
      delete plan._write;
      delete plan._writtenExpected;
      if (plan.status !== 'supported') continue;
      if (!ctx.isCurrent() || field.excluded || (plan.ai && !mapping?.isAiEligible?.(field, plan.factKey))) {
        plan._writeFailed = true;
        continue;
      }

      // Handle React rerendering: re-resolve element if it was disconnected
      ensureConnectedElement(field);
      if (!field.element?.isConnected && typeof root.NextkinFormDiscovery?.discoverFields === 'function') {
        const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
        if (doc) {
          const refreshed = root.NextkinFormDiscovery.discoverFields(doc);
          const match = refreshed.find(candidate =>
            candidate.element?.isConnected && (
              (field.questionId && candidate.questionId === field.questionId) ||
              (candidate.kind === field.kind && field.label && candidate.label === field.label &&
                (candidate.scope || '') === (field.scope || ''))
            )
          );
          if (match) {
            field.element = match.element;
            field.elements = match.elements;
            field.options = match.options;
          }
        }
      }
      const el = field.element;
      if (!el?.isConnected) {
        plan._writeFailed = true;
        continue;
      }

      // Bounded async wait for dependent controls (Country -> State -> City)
      // to become enabled / populated with options after previous field changes
      await waitForFieldReady(field, ctx, 1200);
      if (!ctx.isCurrent() || !field.element?.isConnected) {
        plan._writeFailed = true;
        continue;
      }

      const currentEl = field.element;
      const domVal = read(field);
      if (mapping?.isUrlField?.(field) && (
        plan.ai || plan.learned || !plan.factKey || !mapping.candidateHttpUrl(value) ||
        (currentEl.maxLength > 0 && value.length > currentEl.maxLength)
      )) {
        plan._writeFailed = true;
        continue;
      }
      const previous = domVal;
      const isCountryCodeOnly = field.kind === 'text' && (currentEl.type === 'tel' || /phone/i.test(field.hint || field.label)) && /^\+?\d{1,3}\s*$/.test(String(previous).trim());
      const hasAnswer = !isCountryCodeOnly && (Array.isArray(previous) ? previous.length > 0 : (typeof previous === 'boolean' ? previous : Boolean(previous && String(previous).trim().length > 0)));
      let write;
      const userEdited = isFieldUserEdited(field);
      const unfilled = isFieldUnfilled(field, previous);
      if (field.kind === 'resume-file') {
        write = await attachResumeFile(currentEl, ctx.resume, ctx.isCurrent);
      } else if (hasAnswer && (userEdited || (!unfilled && !plan.overwriteExisting))) {
        const option = field.options?.length && !Array.isArray(value) ? choose({ ...field, factKey: plan.factKey }, value) : null;
        const expected = option?.label ?? value;
        const alreadyCorrect = equals(previous, expected, field);
        write = { expected, alreadyCorrect, conflict: !alreadyCorrect, preserved: userEdited };
      } else if (field.kind === 'combobox') {
        write = await fillCombo({ ...field, factKey: plan.factKey }, value, ctx.isCurrent, plan.writerOptions || {});
      } else if (field.kind === 'multi-combobox') {
        write = await fillMultiCombo(field, value, ctx.isCurrent);
      } else if (isMultiKind(field.kind)) {
        write = setMultiple(field, value);
      } else if (isChoiceKind(field.kind)) {
        write = setChoice(field, value);
      } else if (field.kind === 'checkbox') {
        const boolVal = typeof value === 'boolean' ? value : normalizeBoolean(value);
        if (typeof boolVal === 'boolean') {
          const ok = previous !== boolVal ? setCheckbox(currentEl, boolVal) : true;
          if (ok) write = { expected: boolVal };
        }
      } else {
        const expected = String(value);
        if (!(currentEl.maxLength >= 0 && expected.length > currentEl.maxLength)) {
          setNativeValue(currentEl, expected);
          write = { expected };
        }
      }
      if (!write) {
        plan._writeFailed = true;
        continue;
      }

      plan._write = write;
      plan._writtenExpected = write.expected;
    }

    // Step 3: Wait for framework reconciliation. A country selection can replace the dependent
    // state/city controls; rediscover them by stable question id so readback follows the live DOM.
    await wait(50);
    if (root.NextkinFormDiscovery?.discoverFields) {
      let refreshed = null;
      for (const plan of sortedPlans) {
        if (plan.status !== 'supported' || plan._writeFailed || plan.field.element?.isConnected) continue;
        const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
        if (!doc) continue;
        refreshed = refreshed || root.NextkinFormDiscovery.discoverFields(doc);
        const match = refreshed.find(candidate => candidate.element?.isConnected && (
          (plan.field.questionId && candidate.questionId === plan.field.questionId) ||
          (candidate.kind === plan.field.kind && plan.field.label && candidate.label === plan.field.label)
        ));
        if (match) {
          plan.field.element = match.element;
          plan.field.elements = match.elements;
          plan.field.options = match.options;
        }
      }
    }

    const verification = verifyWrites(plans);

    // Build array report for 100% backwards compatibility
    const report = [...verification.filled];
    report.filled = verification.filled;
    report.unverified = verification.unverified;
    report.manual = verification.manual;
    report.unmapped = verification.unmapped;

    return report;
  }

  root.NextkinFieldWriter = {
    ResumeUploadState,
    inspectUploadStatus,
    applyFill,
    verifyWrites,
    setNativeValue,
    attachResumeFile,
    read,
    isAnswered,
    readChoices,
    setCheckbox,
    setRadio,
    setChoice,
    fillCombo,
    fillCombobox: fillCombo,
    closeCombo,
    recordPreservedValues,
    getPreservedValue,
    clearPreservedValues,
    advanceStep,
    ensureConnectedElement,
    waitForFieldReady,
    waitForVerification,
    userEditedElements,
    durableFieldStore,
    preservedStore: durableFieldStore,
    isFieldUnfilled,
    isFieldUserEdited,
    installUserEditTracking,
  };
})(globalThis);
