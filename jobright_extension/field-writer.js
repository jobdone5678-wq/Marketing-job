(function (root) {
  'use strict';
  // Enhanced FieldWriter incorporating AutoApply (ExxML/AutoApply) event dispatching,
  // Shadow DOM penetration, Workday date sections, typeahead simulation, and post-fill verification.

  let fillingNow = false;
  const isFilling = () => fillingNow;

  function dispatching(fn) {
    const prev = fillingNow;
    fillingNow = true;
    try {
      return fn();
    } finally {
      fillingNow = prev;
    }
  }

  // Safety guard: never click submit, navigation, or apply buttons
  const RE_FORBIDDEN_CLICK = /\b(submit|apply|send application|next|continue|finish|log\s*in|sign\s*in|register)\b/i;
  function isForbiddenClick(el) {
    if (!el) return false;
    const b = el.closest('button, a, input[type=submit], input[type=image], [role=button], [role=link]');
    if (!b) return false;
    if (b instanceof HTMLInputElement && b.type === 'submit') return true;
    if (b instanceof HTMLButtonElement && b.type === 'submit' && !b.hasAttribute('aria-haspopup') && !b.hasAttribute('aria-expanded')) return true;
    const txt = (b.textContent || '').trim();
    const aria = b.getAttribute('aria-label') || '';
    return RE_FORBIDDEN_CLICK.test(txt) || RE_FORBIDDEN_CLICK.test(aria);
  }

  // Resolve innermost target inside Shadow DOM
  function innermost(el) {
    let t = el;
    for (let i = 0; i < 4 && t && t.shadowRoot; i++) {
      const inner = Array.from(t.shadowRoot.children).find(c => !c.matches('style, script, link, template, slot'));
      if (!(inner instanceof HTMLElement) || isForbiddenClick(inner)) break;
      t = inner;
    }
    return t || el;
  }

  // Authentic pointer click event sequence
  function pointerClick(el, at) {
    if (isForbiddenClick(el)) return;
    const r = el.getBoundingClientRect();
    const clientX = at?.x ?? r.left + r.width / 2;
    const clientY = at?.y ?? r.top + r.height / 2;
    const base = { bubbles: true, composed: true, cancelable: true, clientX, clientY, button: 0, view: window };
    const p = type => new PointerEvent(type, { ...base, pointerType: 'mouse', isPrimary: true, pointerId: 1 });
    const m = type => new MouseEvent(type, base);
    const t = innermost(el);

    dispatching(() => {
      try { t.dispatchEvent(p('pointerover')); } catch { }
      try { t.dispatchEvent(p('pointerenter')); } catch { }
      try { t.dispatchEvent(m('mouseover')); } catch { }
      try { t.dispatchEvent(p('pointerdown')); } catch { }
      const allowed = t.dispatchEvent(m('mousedown'));
      if (allowed) {
        try { el.focus?.({ preventScroll: true }); } catch { }
      }
      try { t.dispatchEvent(p('pointerup')); } catch { }
      try { t.dispatchEvent(m('mouseup')); } catch { }
      try { t.dispatchEvent(m('click')); } catch {
        try { el.click(); } catch { }
      }
    });
  }

  // React Fiber & Native Setter Bypass with event cascade
  function writeNative(el, property, next) {
    if (!el || !el.isConnected) return false;
    if (typeof el.setCustomValidity === 'function') {
      try { el.setCustomValidity(''); } catch { }
    }

    if (property === 'checked') {
      const boolVal = Boolean(next);
      const isInput = el instanceof HTMLInputElement;
      if (isInput) {
        if (el._valueTracker) {
          try { el._valueTracker.setValue(boolVal ? 'false' : 'true'); } catch { }
        }
        const proto = HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
        try {
          if (setter) setter.call(el, boolVal); else el.checked = boolVal;
        } catch {
          el.checked = boolVal;
        }
      }
      if (el.getAttribute?.('role') === 'checkbox' || el.hasAttribute?.('aria-checked')) {
        el.setAttribute('aria-checked', String(boolVal));
      }

      dispatching(() => {
        try { pointerClick(el); } catch { }
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        try { el.dispatchEvent(new FocusEvent('blur', { bubbles: true, composed: true })); } catch { }
      });

      if (el.getAttribute?.('aria-invalid') === 'true') {
        try { el.removeAttribute('aria-invalid'); } catch { }
      }
      return isInput ? el.checked === boolVal : (el.getAttribute('aria-checked') === String(boolVal));
    }

    // Force React valueTracker out of sync
    if (el._valueTracker) {
      try { el._valueTracker.setValue(String(next) === '' ? '__force_diff__' : ''); } catch { }
    }

    // Handle SELECT option matching
    if (el.tagName === 'SELECT') {
      const lower = String(next).toLowerCase().trim();
      let matched = null;
      for (const opt of el.options) {
        if (opt.value.toLowerCase().trim() === lower || opt.text.toLowerCase().trim() === lower) {
          matched = opt;
          break;
        }
      }
      if (!matched) {
        for (const opt of el.options) {
          const ov = opt.value.toLowerCase().trim();
          const ot = opt.text.toLowerCase().trim();
          if ((ov && lower.includes(ov)) || (ot && lower.includes(ot))) {
            matched = opt;
            break;
          }
        }
      }
      if (matched) {
        matched.selected = true;
        next = matched.value;
      }
    }

    const proto = el.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(proto, property)?.set;
    if (setter) setter.call(el, next); else el[property] = next;

    dispatching(() => {
      try { el.dispatchEvent(new FocusEvent('focus', { bubbles: true, composed: true })); } catch { }
      try {
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertText',
          data: String(next)
        }));
      } catch {
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      try { el.dispatchEvent(new FocusEvent('blur', { bubbles: true, composed: true })); } catch { }
    });

    if (el.getAttribute?.('aria-invalid') === 'true') {
      try { el.removeAttribute('aria-invalid'); } catch { }
    }

    return el[property] === next;
  }

  // Workday multi-box date segment support (AutoApply §14.3)
  function parseDateSegments(str) {
    if (!str) return null;
    const clean = String(str).trim();
    // YYYY-MM-DD
    let m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(clean);
    if (m) return { year: m[1], month: m[2].padStart(2, '0'), day: (m[3] || '01').padStart(2, '0') };
    // MM/DD/YYYY
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean);
    if (m) return { month: m[1].padStart(2, '0'), day: m[2].padStart(2, '0'), year: m[3] };
    return null;
  }

  function value(field) {
    if (field.kind === 'radio') return field.elements.map(el => el.checked);
    if (field.kind === 'checkbox') return field.element.checked !== undefined ? field.element.checked : (field.element.getAttribute('aria-checked') === 'true');
    if (field.kind === 'combobox') return field.element.value || field.element.textContent.trim();
    return field.element.value;
  }

  // Post-fill verification (AutoApply verify.ts)
  function verifyField(field, expected) {
    const current = value(field);
    if (field.kind === 'checkbox') return Boolean(current) === Boolean(expected);
    if (field.kind === 'radio') return Array.isArray(current) && current.some(Boolean);
    const currStr = String(current || '').trim().toLowerCase();
    const expStr = String(expected || '').trim().toLowerCase();
    return currStr === expStr || currStr.includes(expStr) || expStr.includes(currStr);
  }

  async function applyFill(plans, session) {
    const receipts = [];
    const STATE_MAP = {
      'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'california': 'ca', 'colorado': 'co',
      'florida': 'fl', 'georgia': 'ga', 'illinois': 'il', 'new york': 'ny', 'texas': 'tx',
      'washington': 'wa'
    };
    for (const plan of plans) {
      const { field } = plan;
      const el = field.element;
      if (plan.status !== 'supported' || !el || !el.isConnected || !session.isCurrent() || field.excluded) continue;

      const previousValue = value(field);
      let expected = String(plan.value);
      let undoChoice = null;

      if (Array.isArray(previousValue) ? previousValue.some(Boolean) : (previousValue && String(previousValue).trim().length > 0)) {
        continue;
      }

      if (field.kind === 'combobox') {
        pointerClick(el);
        if (el.tagName === 'INPUT') {
          writeNative(el, 'value', String(plan.value));
        }
        let option = null;
        for (let attempt = 0; attempt < 10 && session.isCurrent(); attempt++) {
          const rootNode = el.getRootNode ? el.getRootNode() : document;
          const scope = rootNode.getElementById?.(el.getAttribute('aria-controls')) || document;
          const options = Array.from(scope.querySelectorAll('[role="option"], [role="listbox"] li, .select2-results__option, li[data-value], div[class*="option"]')).filter(o =>
            o.getAttribute('aria-disabled') !== 'true' &&
            (o.textContent.trim().toLowerCase() === String(plan.value).toLowerCase() || o.textContent.trim().toLowerCase().includes(String(plan.value).toLowerCase()))
          );
          if (options.length >= 1) {
            option = options[0];
            break;
          }
          await new Promise(r => setTimeout(r, 60));
        }

        if (option) {
          pointerClick(option);
          try { option.click(); } catch { }
          expected = option.textContent.trim();
        } else {
          if (el.tagName === 'INPUT') {
            writeNative(el, 'value', String(plan.value));
            try { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); } catch(e) {}
          }
          continue;
        }
      } else if (field.kind === 'select') {
        const valLower = String(plan.value).toLowerCase().trim();
        const stateCode = STATE_MAP[valLower] || null;
        let options = field.options.filter(o => {
          const lbl = o.label.toLowerCase().trim();
          const v = o.value.toLowerCase().trim();
          if (lbl === valLower || v === valLower) return true;
          if (stateCode && (lbl === stateCode || v === stateCode)) return true;
          if ((valLower === 'yes' || valLower === 'true') && (lbl === 'yes' || v === 'yes' || v === '1' || v === 'true')) return true;
          if ((valLower === 'no' || valLower === 'false') && (lbl === 'no' || v === 'no' || v === '0' || v === 'false')) return true;
          return lbl.includes(valLower);
        });
        if (options.length >= 1) {
          expected = options[0].value;
          writeNative(el, 'value', expected);
        }
      } else if (field.kind === 'radio') {
        const valLower = String(plan.value).toLowerCase();
        const options = field.options.filter(o => o.label.toLowerCase() === valLower || o.value.toLowerCase() === valLower || o.label.toLowerCase().includes(valLower));
        if (options.length >= 1) {
          expected = field.elements.map(r => r === options[0].element);
          writeNative(options[0].element, 'checked', true);
        }
      } else if (field.kind === 'checkbox') {
        const boolVal = typeof plan.value === 'boolean' ? plan.value : (plan.value === 'true' || plan.value === 'Yes' || plan.value === '1');
        expected = boolVal;
        writeNative(el, 'checked', boolVal);
      } else {
        writeNative(el, 'value', String(plan.value));
      }

      await new Promise(r => setTimeout(r, 10));

      // Post-fill verification
      const writtenValue = value(field);
      if (!session.isCurrent()) continue;

      receipts.push({
        fieldKey: field.key,
        field,
        element: el,
        previousValue,
        writtenValue,
        sessionId: session.sessionId,
        undoChoice
      });
    }
    return receipts;
  }

  async function undo(receipts, session) {
    let restored = 0;
    for (const receipt of receipts) {
      const { field } = receipt;
      if (receipt.sessionId !== session.sessionId || !field.element || !field.element.isConnected) continue;
      if (field.kind === 'combobox') {
        if (field.element.tagName === 'INPUT') writeNative(field.element, 'value', receipt.previousValue || '');
        else if (receipt.undoChoice) {
          pointerClick(field.element);
          await new Promise(r => setTimeout(r, 60));
          const scope = field.element.getRootNode().getElementById?.(field.element.getAttribute('aria-controls')) || document;
          const reset = Array.from(scope.querySelectorAll('[role="option"]')).find(o => o.textContent.trim() === receipt.undoChoice);
          if (reset) pointerClick(reset);
        }
      } else if (field.kind === 'radio') {
        field.elements.forEach((el, i) => {
          el.checked = receipt.previousValue[i] || false;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      } else {
        writeNative(field.element, field.kind === 'checkbox' ? 'checked' : 'value', receipt.previousValue);
      }
      restored++;
    }
    return restored;
  }

  root.NextkinFieldWriter = {
    applyFill,
    undo,
    writeNative,
    pointerClick,
    dispatching,
    verifyField,
    parseDateSegments,
    isForbiddenClick
  };
})(globalThis);
