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
    if (b instanceof HTMLInputElement && (b.type === 'submit' || b.type === 'image')) return true;
    // <button> reports type=submit even when the app never declared it, so only a declared
    // submit type is treated as off limits; the text check below still catches real submits.
    if (b instanceof HTMLButtonElement && b.getAttribute('type') === 'submit') return true;
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

  // A <button> inside a form without an explicit type submits that form when clicked.
  function withoutImplicitSubmit(el, fn) {
    const btn = el instanceof HTMLButtonElement ? el : null;
    if (!btn || btn.hasAttribute('type') || !btn.form) return fn();
    try { btn.setAttribute('type', 'button'); } catch { return fn(); }
    try { return fn(); } finally { try { btn.removeAttribute('type'); } catch { } }
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

    withoutImplicitSubmit(t, () => dispatching(() => {
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
    }));
  }

  // A single click event: toggle-style controls must not receive two clicks or they flip back.
  function singleClick(el) {
    if (!el || isForbiddenClick(el)) return;
    withoutImplicitSubmit(el, () => dispatching(() => {
      try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, cancelable: true, button: 0, isPrimary: true, pointerId: 1, pointerType: 'mouse' })); } catch { }
      try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true, button: 0, view: window })); } catch { }
      try { el.focus?.({ preventScroll: true }); } catch { }
      try { el.click(); } catch { }
    }));
  }

  // React Fiber & Native Setter Bypass with event cascade
  function writeNative(el, property, next) {
    if (!el || !el.isConnected) return false;
    const hasPortalValidation = Boolean(el.validationMessage);
    if (typeof el.setCustomValidity === 'function' && !hasPortalValidation) {
      try { el.setCustomValidity(''); } catch { }
    }

    if (property === 'checked') {
      const boolVal = Boolean(next);
      const isInput = el instanceof HTMLInputElement;
      if (isInput) {
        // A real click is what frameworks listen to for checkboxes; a bare property write is
        // reverted on their next render, so the box would look untouched while we report it filled.
        if (el.checked !== boolVal) {
          try { el.click(); } catch { }
          if (el.checked !== boolVal) {
            const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
            try { if (checkedSetter) checkedSetter.call(el, boolVal); else el.checked = boolVal; } catch { el.checked = boolVal; }
          }
        }
      }
      if (el.getAttribute?.('role') === 'checkbox' || el.hasAttribute?.('aria-checked')) {
        el.setAttribute('aria-checked', String(boolVal));
      }

      if (!(isInput && el.checked === boolVal)) {
        dispatching(() => {
          el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          try { el.dispatchEvent(new FocusEvent('blur', { bubbles: true, composed: true })); } catch { }
        });
      }

      if (el.getAttribute?.('aria-invalid') === 'true') {
        try { el.removeAttribute('aria-invalid'); } catch { }
      }
      return isInput ? el.checked === boolVal : (el.getAttribute('aria-checked') === String(boolVal));
    }

    // Rich text editors have no value property; the text they hold is their content.
    if (el.getAttribute?.('contenteditable') === '' || el.getAttribute?.('contenteditable') === 'true') {
      el.textContent = String(next);
      dispatching(() => {
        try {
          el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: String(next) }));
        } catch {
          el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      });
      return el.textContent.trim() === String(next).trim();
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

    if (!hasPortalValidation && el.getAttribute?.('aria-invalid') === 'true') {
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

  const isSelectedState = el => el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true' ||
    el.getAttribute('aria-selected') === 'true' || el.getAttribute('data-selected') === 'true' ||
    /(^|[\s_-])(active|selected)([\s_-]|$)/i.test(String(el.getAttribute('class') || ''));

  function selectedOption(field) {
    const opts = field.options || [];
    const exposesState = opts.some(o => o.element.hasAttribute('aria-pressed') || o.element.hasAttribute('aria-checked') ||
      o.element.hasAttribute('aria-selected') || o.element.hasAttribute('data-selected') ||
      /(^|[\s_-])(active|selected)([\s_-]|$)/i.test(String(o.element.getAttribute('class') || '')));
    if (!exposesState) return { known: false, option: null };
    return { known: true, option: opts.find(o => isSelectedState(o.element)) || null };
  }

  function value(field) {
    if (field.kind === 'choice') {
      const sel = selectedOption(field).option;
      return sel ? (sel.label || sel.element.textContent || '').trim() : '';
    }
    if (field.kind === 'radio') return field.elements.map(el => el.checked);
    if (field.kind === 'checkbox') return field.element.checked !== undefined ? field.element.checked : (field.element.getAttribute('aria-checked') === 'true');
    if (field.kind === 'combobox') return field.element.value || field.element.textContent.trim();
    if (field.element?.isContentEditable) return field.element.textContent || '';
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

  const sameish = (a, b) => {
    const x = String(a ?? '').trim().toLowerCase(), y = String(b ?? '').trim().toLowerCase();
    if (!x) return false;
    return x === y || x.includes(y) || y.includes(x);
  };

  // Options offered by an autocomplete, best match first. The list is often fetched
  // asynchronously, so it may still be empty on the first pass.
  function comboboxOptions(el, desired) {
    const rootNode = el.getRootNode ? el.getRootNode() : document;
    const scope = rootNode.getElementById?.(el.getAttribute('aria-controls')) || document;
    const want = String(desired ?? '').trim().toLowerCase();
    const candidates = Array.from(scope.querySelectorAll('[role="option"], [role="listbox"] li, .select2-results__option, li[data-value], div[class*="option"]'))
      .filter(o => o.getAttribute('aria-disabled') !== 'true' && o.getClientRects().length);
    const rank = t => (t === want ? 0 : t.startsWith(want) ? 1 : 2);
    return candidates
      .map(o => ({ o, text: o.textContent.trim(), t: o.textContent.trim().toLowerCase() }))
      .filter(x => x.text && (x.t === want || x.t.startsWith(want) || x.t.includes(want)))
      .sort((a, b) => rank(a.t) - rank(b.t))
      .map(x => x.o);
  }

  // The option that clears a dropdown. Portals mark it with a placeholder attribute or wording.
  function resetOption(el) {
    const rootNode = el.getRootNode ? el.getRootNode() : document;
    const scope = rootNode.getElementById?.(el.getAttribute('aria-controls')) || document;
    const options = Array.from(scope.querySelectorAll('[role="option"], [role="listbox"] li, .select2-results__option, li[data-value]'));
    return options.find(o => o.hasAttribute('data-placeholder'))
      || options.find(o => /^(select|choose|please select|clear|none|no selection|--|\-)/i.test(o.textContent.trim()))
      || null;
  }

  // A dropdown whose reset is disabled would leave the candidate unable to clear our answer.
  function resetIsLocked(el) {
    const reset = resetOption(el);
    return Boolean(reset && reset.getAttribute('aria-disabled') === 'true');
  }

  // True when the value the plan asked for is actually present in the page.
  function writeLanded(field, expected, optionEl) {
    if (field.kind === 'checkbox') {
      const cur = field.element.checked !== undefined ? field.element.checked : (field.element.getAttribute('aria-checked') === 'true');
      return Boolean(cur) === Boolean(expected);
    }
    if (field.kind === 'radio') {
      const target = Array.isArray(expected) ? expected.indexOf(true) : -1;
      return field.elements.some((el, i) => el.checked && (target < 0 || i === target));
    }
    if (field.kind === 'choice') {
      const sel = selectedOption(field);
      if (!sel.known) return true;
      return Boolean(sel.option) && sameish(sel.option.label, expected);
    }
    if (field.kind === 'combobox') {
      const v = String(value(field) || '').trim().toLowerCase();
      const e = String(expected || '').trim().toLowerCase();
      if (!v) return false;
      if (v === e) return true;
      // The app may display its own wording; a selected option still proves the choice landed.
      return Boolean(optionEl && optionEl.getAttribute('aria-selected') === 'true');
    }
    if (field.element?.isContentEditable) return sameish(field.element.textContent, expected);
    return sameish(field.element.value, expected);
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
      let pickedOption = null;

      if (Array.isArray(previousValue) ? previousValue.some(Boolean) : (previousValue && String(previousValue).trim().length > 0)) {
        if (sameish(previousValue, plan.value) || String(previousValue).trim() === String(plan.value).trim()) {
          field.commitStatus = 'filled';
          receipts.push({
            field,
            previousValue,
            writtenValue: previousValue,
            sessionId: session.sessionId,
            writtenAt: new Date().toISOString()
          });
        }
        continue;
      }

      if (field.kind === 'combobox') {
        // A dropdown whose reset is disabled would leave the candidate unable to clear our answer.
        if (el.tagName !== 'INPUT' && resetIsLocked(el)) continue;
        pointerClick(el);
        if (el.tagName === 'INPUT') {
          writeNative(el, 'value', String(plan.value));
        }
        let option = null;
        for (let attempt = 0; attempt < 20 && session.isCurrent(); attempt++) {
          const options = comboboxOptions(el, plan.value);
          if (options.length === 1) {
            option = options[0];
            break;
          }
          if (options.length > 1) {
            if (plan.state || plan.location) {
              const stateNorm = String(plan.state || '').toLowerCase().trim();
              const stateCode = STATE_MAP[stateNorm] || null;
              const locNorm = String(plan.location || '').toLowerCase().trim();
              const filtered = options.filter(opt => {
                const txt = opt.textContent.toLowerCase();
                return (stateNorm && txt.includes(stateNorm)) || (stateCode && txt.includes(stateCode.toLowerCase())) || (locNorm && txt.includes(locNorm));
              });
              if (filtered.length >= 1) {
                option = filtered[0];
                break;
              }
            }
            option = null;
            break;
          }
          await new Promise(r => setTimeout(r, 80));
        }

        if (!option) {
          // No suggestion matched: the typed value is ours, so the control goes back to how it was.
          if (el.tagName === 'INPUT') writeNative(el, 'value', previousValue || '');
          field.commitStatus = 'needs_review';
          continue;
        }
        singleClick(option);
        expected = option.textContent.trim();
        pickedOption = option;
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
        if (el.tagName === 'INPUT') {
          writeNative(el, 'checked', boolVal);
        } else {
          el.setAttribute('aria-checked', String(boolVal));
          try { el.dispatchEvent(new Event('input', { bubbles: true, composed: true })); } catch {}
          try { el.dispatchEvent(new Event('change', { bubbles: true, composed: true })); } catch {}
          try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch {}
        }
      } else if (field.kind === 'choice') {
        const valLower = String(plan.value).toLowerCase().trim();
        const opt = (field.options || []).find(o => o.label.toLowerCase().trim() === valLower || o.value.toLowerCase().trim() === valLower)
          || (field.options || []).find(o => o.label.toLowerCase().includes(valLower) || valLower.includes(o.label.toLowerCase().trim()));
        if (!opt) continue;
        undoChoice = previousValue || null;
        singleClick(opt.element);
        expected = opt.label;
      } else {
        writeNative(el, 'value', String(plan.value));
      }

      // Post-fill verification: a write that did not land must not be reported as filled.
      let writtenValue = value(field);
      if (!writeLanded(field, expected, pickedOption)) {
        await new Promise(r => setTimeout(r, 120));
        writtenValue = value(field);
        if (!writeLanded(field, expected, pickedOption)) continue;
      }
      if (!session.isCurrent()) continue;

      field.commitStatus = 'filled';
      receipts.push({
        fieldKey: field.key,
        field,
        element: el,
        previousValue,
        writtenValue,
        sessionId: session.sessionId,
        undoChoice,
        ai: !!plan.ai
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
        else if (receipt.previousValue) {
          pointerClick(field.element);
          await new Promise(r => setTimeout(r, 60));
          const scope = field.element.getRootNode().getElementById?.(field.element.getAttribute('aria-controls')) || document;
          const reset = Array.from(scope.querySelectorAll('[role="option"]')).find(o => o.textContent.trim() === receipt.previousValue);
          if (reset) pointerClick(reset);
        } else {
          // The dropdown held nothing before; its reset option is how the choice is cleared.
          const reset = resetOption(field.element);
          if (reset) pointerClick(reset);
        }
      } else if (field.kind === 'radio') {
        field.elements.forEach((el, i) => {
          el.checked = receipt.previousValue[i] || false;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      } else if (field.kind === 'choice') {
        const prior = (field.options || []).find(o => o.label === receipt.previousValue);
        if (prior) singleClick(prior.element);
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
    singleClick,
    dispatching,
    isFilling,
    verifyField,
    comboboxOptions,
    parseDateSegments,
    isForbiddenClick
  };
})(globalThis);
