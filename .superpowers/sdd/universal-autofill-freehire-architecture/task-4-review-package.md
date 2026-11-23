# Review Package: Task 4

## Commits
8b0639f feat(writer): add framework-safe native value setters and post-fill readback verification

## Stat
 jobright_extension/core/field-writer.js | 320 ++++++++++++++----
 tests/verified-combobox-writer.test.mjs | 557 ++++++++++++++++++++++++++++++++
 2 files changed, 806 insertions(+), 71 deletions(-)

## Diff
`diff
diff --git a/jobright_extension/core/field-writer.js b/jobright_extension/core/field-writer.js
index fe0907d..0b1582e 100644
--- a/jobright_extension/core/field-writer.js
+++ b/jobright_extension/core/field-writer.js
@@ -1,14 +1,24 @@
 (function (root) {
   const mapping = root.NextkinFieldMapping;
   const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
-  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
+  const wait = ms => new Promise(resolve => {
+    const timerFn = (typeof setTimeout === 'function') ? setTimeout
+      : (typeof globalThis.setTimeout === 'function') ? globalThis.setTimeout
+      : (typeof root.setTimeout === 'function') ? root.setTimeout
+      : null;
+    if (timerFn) {
+      timerFn(resolve, ms);
+    } else {
+      resolve();
+    }
+  });
   const placeholder = /^(?:(?:please\s+)?(?:select|choose)(?:\s+(?:an?|your|the)\s+[^.]+|\s+one)?(?:\.{3}|…)?|[-–—]+)$/i;
 
   const optionSelector = [
     '[role="option"]',
     '[role="listbox"] li',
     '[role="listbox"] [role="option"]',
     '[data-radix-collection-item]',
     '[data-slot="select-item"]',
     '[id^="headlessui-listbox-option"]',
     '.select2-results__option',
@@ -36,20 +46,30 @@
     '[cmdk-list]',
     '[data-automation-id*="promptList" i]',
     '[data-automation-id*="selectList" i]',
     '[class*="select__menu" i]',
     '[class*="-menu" i]',
     '.dialog-content'
   ].join(', ');
 
   const optionLabel = option => option.label || option.value;
 
+  const isMultiKind = kind => {
+    if (mapping?.isMultiKind) return mapping.isMultiKind(kind);
+    return kind === 'multi-select' || kind === 'checkbox-group';
+  };
+
+  const isChoiceKind = kind => {
+    if (mapping?.isChoiceKind) return mapping.isChoiceKind(kind);
+    return kind === 'select' || kind === 'radio' || kind === 'choice';
+  };
+
   function safeCssEscape(str) {
     if (typeof globalThis.CSS !== 'undefined' && typeof globalThis.CSS.escape === 'function') {
       return globalThis.CSS.escape(str);
     }
     return String(str).replace(/([ !"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
   }
 
   const checked = el => {
     if (!el) return false;
     if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return Boolean(el.checked);
@@ -147,34 +167,81 @@
     }
   }
 
   function notify(el) {
     const view = el.ownerDocument?.defaultView || globalThis;
     const { Event } = view;
     el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
     el.dispatchEvent(new Event('change', { bubbles: true }));
   }
 
-  function writeValue(el, value) {
-    if (el.isContentEditable) el.textContent = value;
-    else {
-      const view = el.ownerDocument?.defaultView || globalThis;
-      const proto = el.tagName === 'SELECT' ? view.HTMLSelectElement.prototype
-        : el.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
-      const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'value');
-      if (desc?.set) desc.set.call(el, value);
-      else el.value = value;
-      if (el._valueTracker) {
-        el._valueTracker.setValue?.('');
+  function getNativePropertyDescriptor(element, prop = 'value') {
+    if (!element) return null;
+    const view = element.ownerDocument?.defaultView || globalThis;
+    const proto = element.tagName === 'SELECT'
+      ? (view.HTMLSelectElement?.prototype || globalThis.HTMLSelectElement?.prototype)
+      : element.tagName === 'TEXTAREA'
+      ? (view.HTMLTextAreaElement?.prototype || globalThis.HTMLTextAreaElement?.prototype)
+      : (view.HTMLInputElement?.prototype || globalThis.HTMLInputElement?.prototype);
+
+    if (proto) {
+      const desc = Object.getOwnPropertyDescriptor(proto, prop);
+      if (desc?.set) return desc;
+    }
+
+    let p = Object.getPrototypeOf(element);
+    while (p && p !== Object.prototype) {
+      const desc = Object.getOwnPropertyDescriptor(p, prop);
+      if (desc?.set) return desc;
+      p = Object.getPrototypeOf(p);
+    }
+    return null;
+  }
+
+  function setNativeValue(element, value) {
+    if (!element) return false;
+    const view = element.ownerDocument?.defaultView || globalThis;
+    const strVal = value == null ? '' : String(value);
+
+    if (element.isContentEditable) {
+      element.textContent = strVal;
+    } else {
+      const desc = getNativePropertyDescriptor(element, 'value');
+      if (desc?.set) {
+        desc.set.call(element, strVal);
+      } else {
+        element.value = strVal;
+      }
+      if (element._valueTracker) {
+        try {
+          element._valueTracker.setValue?.('');
+        } catch {}
       }
     }
-    notify(el);
+
+    const Evt = view.Event || globalThis.Event;
+    const FocusEvt = view.FocusEvent || view.Event || globalThis.FocusEvent || globalThis.Event;
+    try {
+      element.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
+    } catch {}
+    try {
+      element.dispatchEvent(new Evt('change', { bubbles: true }));
+    } catch {}
+    try {
+      element.dispatchEvent(new FocusEvt('blur', { bubbles: true, composed: true }));
+    } catch {}
+
+    return true;
+  }
+
+  function writeValue(el, value) {
+    return setNativeValue(el, value);
   }
 
   function setCheckbox(el, targetChecked) {
     if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
     const boolVal = Boolean(targetChecked);
     const view = el.ownerDocument?.defaultView || globalThis;
     const target = findClickableTarget(el) || el;
 
     if (checked(el) === boolVal) {
       return true;
@@ -303,24 +370,27 @@
 
     return el.tagName === 'INPUT' && el.type === 'radio' ? el.checked : true;
   }
 
   function comboInput(el) {
     return el.tagName === 'INPUT' ? el : el.querySelector('input:not([type=hidden])');
   }
 
   function comboTrigger(el) {
     if (!el) return null;
-    if (el.tagName === 'BUTTON' || el.matches('button, [data-slot="select-trigger"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]')) return el;
-    const btn = el.querySelector('button, [data-slot="select-trigger"], [class*="select-trigger" i], [class*="selectTrigger" i], [role="combobox"], [aria-haspopup="listbox"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]');
+    if (el.tagName === 'BUTTON' || (el.matches && el.matches('button, [data-slot="select-trigger"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]'))) return el;
+    const btn = el.querySelector ? el.querySelector('button, [data-slot="select-trigger"], [class*="select-trigger" i], [class*="selectTrigger" i], [role="combobox"], [aria-haspopup="listbox"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]') : null;
     if (btn) return btn;
-    if (el.matches('[role="combobox"], [aria-haspopup="listbox"]')) return el;
+    const role = (el.getAttribute ? el.getAttribute('role') : null) || '';
+    const popup = (el.getAttribute ? el.getAttribute('aria-haspopup') : null) || '';
+    if (role.toLowerCase() === 'combobox' || popup.toLowerCase() === 'listbox' || popup.toLowerCase() === 'true') return el;
+    if (el.matches && el.matches('[role="combobox"], [aria-haspopup="listbox"]')) return el;
     return comboInput(el) || el;
   }
 
   function comboSearchInput(el, roots = []) {
     const local = comboInput(el);
     if (local && !local.readOnly && local.type !== 'button') return local;
     const doc = el.ownerDocument;
     for (const root of roots) {
       if (!root?.isConnected) continue;
       const input = root.querySelector('input:not([type=hidden]):not([readonly]), [role="searchbox"], [cmdk-input]');
@@ -352,23 +422,24 @@
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
-        const chips = el.querySelectorAll('.ng-value-label, .select2-selection__choice__display, .k-chip-label, [data-slot="multi-select-value"]');
+        const chips = el.querySelectorAll ? el.querySelectorAll('.ng-value-label, .select2-selection__choice__display, .k-chip-label, [data-slot="multi-select-value"]') : [];
         return [...chips].map(chip => chip.textContent.trim()).filter(Boolean);
       }
+      case 'resume-file': return el?.files?.[0]?.name || (el?.value ? String(el.value).split(/[/\\]/).pop() : '');
       default: return el.isContentEditable ? el.textContent.trim() : el.value?.trim() || '';
     }
   }
 
   function getListboxRoots(el) {
     const control = comboInput(el) || el;
     const ids = [el, control].flatMap(node => [node.getAttribute('aria-controls'), node.getAttribute('aria-owns')])
       .filter(Boolean).flatMap(idStr => idStr.split(/\s+/));
     const doc = el.ownerDocument;
     const roots = ids.map(id => el.getRootNode?.().getElementById?.(id) || doc.getElementById(id)).filter(Boolean);
@@ -398,32 +469,40 @@
       .map(element => ({
         element,
         label: (element.getAttribute('aria-label') || element.getAttribute('data-label') || element.textContent).trim(),
         value: element.getAttribute('data-value') || element.getAttribute('value') || ''
       }))
       .filter(option => option.label && !placeholder.test(option.label));
   }
 
   function choose(field, desired) {
     const bool = normalizeBoolean(desired);
-    if (bool !== null && mapping.pickBooleanOption) {
+    if (bool !== null && mapping?.pickBooleanOption) {
       const bOpt = mapping.pickBooleanOption(field.options, bool);
       if (bOpt) return bOpt;
     }
-    if (typeof desired === 'boolean' && mapping.pickBooleanOption) {
+    if (typeof desired === 'boolean' && mapping?.pickBooleanOption) {
       return mapping.pickBooleanOption(field.options, desired);
     }
-    const opt = mapping.pickOption(field, desired);
+    const opt = mapping?.pickOption ? mapping.pickOption(field, desired) : null;
     if (opt) return opt;
-    if (bool !== null && mapping.pickBooleanOption) {
+    if (bool !== null && mapping?.pickBooleanOption) {
       return mapping.pickBooleanOption(field.options, bool);
     }
+    const norm = s => String(s ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ');
+    const target = norm(desired);
+    if (target && Array.isArray(field.options)) {
+      const exact = field.options.find(o => norm(optionLabel(o)) === target || norm(o.value) === target);
+      if (exact) return exact;
+      const partial = field.options.find(o => norm(optionLabel(o)).includes(target) || target.includes(norm(optionLabel(o))));
+      if (partial) return partial;
+    }
     return null;
   }
 
   function closeCombo(el) {
     const view = el.ownerDocument?.defaultView || globalThis;
     const { KeyboardEvent } = view;
     const targets = [comboSearchInput(el), comboInput(el), comboTrigger(el), el, el.ownerDocument?.activeElement].filter(Boolean);
     for (const target of targets) {
       try {
         target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true }));
@@ -449,21 +528,21 @@
       if (isCurrent()) closeCombo(el);
     }
   }
 
   async function fillCombo(field, desired, isCurrent = () => true) {
     const el = field.element;
     const input = comboInput(el);
     if (input?.list) {
       const option = choose(field, desired);
       if (!option) return null;
-      writeValue(input, option.value);
+      setNativeValue(input, option.value);
       return { expected: option.value };
     }
 
     const trigger = comboTrigger(el);
     let options = comboOptions(el);
 
     // If options not open, click trigger to open listbox
     if (!options.length && trigger) {
       click(trigger);
       const ctrl = el.closest?.('.select__control, [class*="select__control" i]');
@@ -474,83 +553,82 @@
         await wait(30);
         options = comboOptions(el);
         if (options.length) break;
       }
     }
 
     // Match candidate value against option text
     let option = choose({ options }, desired);
     if (option) {
       const ok = click(option.element);
+      try {
+        const view = el.ownerDocument?.defaultView || globalThis;
+        const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
+        option.element.dispatchEvent(new KeyEvt('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
+      } catch {}
       closeCombo(el);
-      return ok ? { expected: option.label, option: option.element, typed: false } : null;
+      const actualVal = comboValue(el);
+      const isSel = selected(option.element) || (actualVal && equals(actualVal, option.label));
+      return ok ? { expected: option.label, option: option.element, typed: false, verified: Boolean(isSel) } : null;
     }
 
     // Type into combobox search input if present
     const roots = getListboxRoots(el);
     const search = comboSearchInput(el, roots);
     let typed = false;
     const query = typeof desired === 'boolean' ? (desired ? 'Yes' : 'No') : String(desired);
     if (search && !search.readOnly && isCurrent()) {
-      writeValue(search, query);
+      setNativeValue(search, query);
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
+      try {
+        const view = el.ownerDocument?.defaultView || globalThis;
+        const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
+        option.element.dispatchEvent(new KeyEvt('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
+      } catch {}
       closeCombo(el);
-      return ok ? { expected: option.label, option: option.element, typed } : null;
+      const actualVal = comboValue(el);
+      const isSel = selected(option.element) || (actualVal && equals(actualVal, option.label));
+      return ok ? { expected: option.label, option: option.element, typed, verified: Boolean(isSel) } : null;
     }
 
     // Close with Escape fallback
     if (typed && search && normalize(search.value) === normalize(query)) {
-      writeValue(search, '');
+      setNativeValue(search, '');
     }
     closeCombo(el);
     return null;
   }
 
   function setChoice(field, desired) {
     const option = choose(field, desired);
     if (!option) return null;
     if (field.kind === 'select') {
       const el = field.element;
-      const view = el.ownerDocument?.defaultView || globalThis;
-      try {
-        const proto = view.HTMLSelectElement?.prototype || HTMLSelectElement.prototype;
-        const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'value');
-        if (desc?.set) {
-          desc.set.call(el, option.value);
-        } else {
-          el.value = option.value;
-        }
-        if (el._valueTracker) {
-          el._valueTracker.setValue?.('');
-        }
-      } catch {
-        el.value = option.value;
-      }
+      setNativeValue(el, option.value);
       if (option.element && typeof option.element.index === 'number') {
         el.selectedIndex = option.element.index;
       } else {
         const idx = Array.from(el.options || []).findIndex(o => o.value === option.value || o === option.element);
         if (idx >= 0) el.selectedIndex = idx;
       }
-      notify(el);
       return { expected: option.label };
     } else if (field.kind === 'radio' || field.kind === 'choice') {
       if (!setRadio(option)) return null;
       return { expected: option.label };
     } else {
       if (!click(option.element)) return null;
       return { expected: option.label };
     }
   }
 
@@ -946,99 +1024,199 @@
         fileInput.dispatchEvent(new Event('input', { bubbles: true }));
         fileInput.dispatchEvent(new Event('change', { bubbles: true }));
         return { expected: filename, file };
       }
     } catch (err) {
       console.warn('[NextKin] Failed to attach resume file:', err);
     }
     return null;
   }
 
-  async function applyFill(plans, session) {
-    const receipts = [];
+  function verifyWrites(plans) {
+    const filled = [];
+    const unverified = [];
+    const manual = [];
+    const unmapped = [];
+
+    if (!Array.isArray(plans)) {
+      return { filled, unverified, manual, unmapped };
+    }
+
+    for (const plan of plans) {
+      if (plan.status === 'manual') {
+        manual.push(plan);
+        continue;
+      }
+      if (plan.status === 'unmapped' || plan.status === 'unsupported') {
+        unmapped.push(plan);
+        continue;
+      }
+
+      const field = plan.field;
+      if (!field || !field.element || !field.element.isConnected) {
+        unverified.push({
+          ...plan,
+          field: plan.field,
+          expected: plan.value,
+          actual: null,
+          status: 'unverified'
+        });
+        continue;
+      }
+
+      if (plan._writeFailed) {
+        unverified.push({
+          ...plan,
+          field: plan.field,
+          expected: plan.value,
+          actual: read(field),
+          status: 'unverified'
+        });
+        continue;
+      }
+
+      const actual = read(field);
+      const expected = plan.writtenValue ?? plan.expected ?? plan._writtenExpected ?? plan.value;
+      const write = plan._write;
+
+      const isVerified = (
+        equals(actual, expected) ||
+        (write?.matches ? write.matches(actual) : false) ||
+        (field.kind === 'combobox' && expected && String(actual || '').toLowerCase().includes(String(expected).toLowerCase())) ||
+        (write?.option && !write.option.isConnected && expected) ||
+        (write?.option?.isConnected && selected(write.option)) ||
+        (field.kind === 'checkbox' && (typeof expected === 'boolean' ? actual === expected : equals(actual, expected)))
+      );
+
+      if (isVerified) {
+        recordPreservedValues([field]);
+        filled.push({
+          ...plan,
+          field: plan.field,
+          value: plan.value,
+          writtenValue: expected,
+          ai: !!plan.ai,
+          learned: !!plan.learned,
+          status: 'filled'
+        });
+      } else {
+        unverified.push({
+          ...plan,
+          field: plan.field,
+          expected,
+          actual,
+          status: 'unverified'
+        });
+      }
+    }
+
+    return { filled, unverified, manual, unmapped };
+  }
+
+  async function applyFill(plans, session = {}) {
+    const ctx = typeof session?.isCurrent === 'function' ? session : { isCurrent: () => true, ...session };
+
     for (const plan of plans) {
       const { field, value } = plan;
-      if (plan.status !== 'supported' || !session.isCurrent() || field.excluded) continue;
+      if (plan.status !== 'supported' || !ctx.isCurrent() || field.excluded) continue;
 
       // Handle React rerendering: re-resolve element if it was disconnected
       ensureConnectedElement(field);
       const el = field.element;
-      if (!el?.isConnected) continue;
+      if (!el?.isConnected) {
+        plan._writeFailed = true;
+        continue;
+      }
 
       // Bounded async wait for dependent controls (Country -> State -> City)
       // to become enabled / populated with options after previous field changes
-      await waitForFieldReady(field, session, 1200);
-      if (!session.isCurrent() || !field.element?.isConnected) continue;
+      await waitForFieldReady(field, ctx, 1200);
+      if (!ctx.isCurrent() || !field.element?.isConnected) {
+        plan._writeFailed = true;
+        continue;
+      }
 
       const currentEl = field.element;
       const domVal = read(field);
-      if (mapping.isUrlField?.(field) && (
+      if (mapping?.isUrlField?.(field) && (
         domVal || plan.ai || plan.learned || !plan.factKey || !mapping.candidateHttpUrl(value) ||
         (currentEl.maxLength > 0 && value.length > currentEl.maxLength)
-      )) continue;
+      )) {
+        plan._writeFailed = true;
+        continue;
+      }
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
       } else if (field.kind === 'resume-file') {
         const attachRes = await attachResumeFile(currentEl);
         if (attachRes) {
           write = { expected: attachRes.expected };
-          receipts.push({ field, writtenValue: attachRes.expected });
+        } else {
+          plan._writeFailed = true;
         }
-        continue;
       } else if (field.kind === 'combobox') {
-        write = await fillCombo(field, value, session.isCurrent);
+        write = await fillCombo(field, value, ctx.isCurrent);
       } else if (field.kind === 'multi-combobox') {
-        write = await fillMultiCombo(field, value, session.isCurrent);
-      } else if (mapping.isMultiKind(field.kind)) {
+        write = await fillMultiCombo(field, value, ctx.isCurrent);
+      } else if (isMultiKind(field.kind)) {
         write = setMultiple(field, value);
-      } else if (mapping.isChoiceKind(field.kind)) {
+      } else if (isChoiceKind(field.kind)) {
         write = setChoice(field, value);
       } else if (field.kind === 'checkbox') {
         const boolVal = typeof value === 'boolean' ? value : normalizeBoolean(value);
         if (typeof boolVal === 'boolean') {
-          if (previous !== boolVal) setCheckbox(currentEl, boolVal);
-          write = { expected: boolVal };
+          const ok = previous !== boolVal ? setCheckbox(currentEl, boolVal) : true;
+          if (ok) write = { expected: boolVal };
         }
       } else {
         const expected = currentEl.maxLength > 0 ? String(value).slice(0, currentEl.maxLength) : String(value);
-        writeValue(currentEl, expected);
+        setNativeValue(currentEl, expected);
         write = { expected };
       }
-      if (!write) continue;
+      if (!write) {
+        plan._writeFailed = true;
+        continue;
+      }
 
-      const verified = () => session.isCurrent() && field.element?.isConnected &&
-        (equals(read(field), write.expected) || write.matches?.(read(field)) ||
-         (field.kind === 'combobox' && write.expected && String(read(field) || '').toLowerCase().includes(String(write.expected).toLowerCase())) ||
-         (write.option && !write.option.isConnected && write.expected) ||
-         (write.option?.isConnected && selected(write.option)));
+      plan._write = write;
+      plan._writtenExpected = write.expected;
+    }
 
-      const isVerified = await waitForVerification(verified, session, 250, 25);
-      if (!isVerified) continue;
+    // Step 3: Wait 50ms for framework reconciliation, then readback verification
+    await wait(50);
 
-      recordPreservedValues([field]);
-      receipts.push({ field, writtenValue: write.expected, ai: !!plan.ai, learned: !!plan.learned });
-    }
-    return receipts;
+    const verification = verifyWrites(plans);
+
+    // Build array report for 100% backwards compatibility
+    const report = [...verification.filled];
+    report.filled = verification.filled;
+    report.unverified = verification.unverified;
+    report.manual = verification.manual;
+    report.unmapped = verification.unmapped;
+
+    return report;
   }
 
   root.NextkinFieldWriter = {
     applyFill,
+    verifyWrites,
+    setNativeValue,
     attachResumeFile,
     read,
     readChoices,
     setCheckbox,
     setRadio,
     setChoice,
     fillCombo,
     fillCombobox: fillCombo,
     recordPreservedValues,
     getPreservedValue,
diff --git a/tests/verified-combobox-writer.test.mjs b/tests/verified-combobox-writer.test.mjs
new file mode 100644
index 0000000..2d20d17
--- /dev/null
+++ b/tests/verified-combobox-writer.test.mjs
@@ -0,0 +1,557 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+
+// Set up mock DOM environment
+class MockEvent {
+  constructor(type, init = {}) {
+    this.type = type;
+    this.bubbles = !!init.bubbles;
+    this.cancelable = !!init.cancelable;
+    this.composed = !!init.composed;
+    this.defaultPrevented = false;
+  }
+  preventDefault() { this.defaultPrevented = true; }
+}
+
+class MockPointerEvent extends MockEvent {
+  constructor(type, init = {}) {
+    super(type, init);
+    this.pointerType = init.pointerType || 'mouse';
+    this.isPrimary = !!init.isPrimary;
+  }
+}
+
+class MockMouseEvent extends MockEvent {
+  constructor(type, init = {}) {
+    super(type, init);
+  }
+}
+
+class MockKeyboardEvent extends MockEvent {
+  constructor(type, init = {}) {
+    super(type, init);
+    this.key = init.key || '';
+    this.code = init.code || '';
+    this.keyCode = init.keyCode || 0;
+  }
+}
+
+class MockFocusEvent extends MockEvent {
+  constructor(type, init = {}) {
+    super(type, init);
+  }
+}
+
+class MockNode {
+  constructor(tagName = 'DIV', attrs = {}, text = '') {
+    this.tagName = tagName.toUpperCase();
+    this.attrs = {};
+    for (const [k, v] of Object.entries(attrs)) {
+      this.attrs[k.toLowerCase()] = String(v);
+    }
+    this.children = [];
+    this.parentElement = null;
+    this.textContent = text;
+    this.disabled = !!attrs.disabled;
+    this.readOnly = !!attrs.readonly;
+    this.listeners = new Map();
+    this.eventLog = [];
+    this.isConnected = true;
+    this._value = attrs.value || '';
+    this._ownerDocument = null;
+  }
+
+  getAttribute(name) {
+    const key = name.toLowerCase();
+    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
+  }
+
+  setAttribute(name, val) {
+    this.attrs[name.toLowerCase()] = String(val);
+  }
+
+  hasAttribute(name) {
+    return Object.prototype.hasOwnProperty.call(this.attrs, name.toLowerCase());
+  }
+
+  removeAttribute(name) {
+    delete this.attrs[name.toLowerCase()];
+  }
+
+  get id() { return this.getAttribute('id') || ''; }
+  set id(v) { this.setAttribute('id', v); }
+  get name() { return this.getAttribute('name') || ''; }
+  set name(v) { this.setAttribute('name', v); }
+  get type() { return this.getAttribute('type') || ''; }
+  set type(v) { this.setAttribute('type', v); }
+
+  get clientRects() { return [{ width: 100, height: 20 }]; }
+  getClientRects() { return this.clientRects; }
+
+  addEventListener(type, fn) {
+    if (!this.listeners.has(type)) this.listeners.set(type, []);
+    this.listeners.get(type).push(fn);
+  }
+
+  removeEventListener(type, fn) {
+    if (this.listeners.has(type)) {
+      this.listeners.set(type, this.listeners.get(type).filter(f => f !== fn));
+    }
+  }
+
+  dispatchEvent(evt) {
+    this.eventLog.push(evt.type);
+    const handlers = this.listeners.get(evt.type) || [];
+    for (const h of handlers) h(evt);
+    if (evt.bubbles && this.parentElement) {
+      this.parentElement.dispatchEvent(evt);
+    }
+    return !evt.defaultPrevented;
+  }
+
+  click() {
+    this.dispatchEvent(new MockPointerEvent('pointerdown', { bubbles: true, composed: true }));
+    this.dispatchEvent(new MockMouseEvent('mousedown', { bubbles: true, composed: true }));
+    this.focus();
+    this.dispatchEvent(new MockPointerEvent('pointerup', { bubbles: true, composed: true }));
+    this.dispatchEvent(new MockMouseEvent('mouseup', { bubbles: true, composed: true }));
+    this.dispatchEvent(new MockMouseEvent('click', { bubbles: true, composed: true }));
+  }
+
+  focus() { this.eventLog.push('focus'); }
+
+  getRootNode() {
+    let curr = this;
+    while (curr.parentElement) curr = curr.parentElement;
+    return curr;
+  }
+
+  get ownerDocument() {
+    const root = this.getRootNode();
+    return root.tagName === '#DOCUMENT' ? root : (this._ownerDocument || globalThis.document);
+  }
+
+  set ownerDocument(doc) {
+    this._ownerDocument = doc;
+  }
+
+  closest(selector) {
+    let curr = this;
+    while (curr) {
+      if (curr.matches && curr.matches(selector)) return curr;
+      curr = curr.parentElement;
+    }
+    return null;
+  }
+
+  contains(node) {
+    let curr = node;
+    while (curr) {
+      if (curr === this) return true;
+      curr = curr.parentElement;
+    }
+    return false;
+  }
+
+  matchesSingle(selector) {
+    let sel = selector.trim();
+    if (!sel) return false;
+
+    const parts = sel.split(/\s+/);
+    if (parts.length > 1) {
+      sel = parts[parts.length - 1];
+    }
+    sel = sel.replace(/\s+[is]\]$/, ']');
+
+    const tagMatch = sel.match(/^([a-z0-9_-]+)/i);
+    let tag = '';
+    if (tagMatch && !sel.startsWith('.') && !sel.startsWith('[')) {
+      tag = tagMatch[1];
+      sel = sel.slice(tag.length);
+    }
+    if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
+    if (!sel) return true;
+
+    if (sel.startsWith('.')) {
+      const cls = sel.slice(1).split(/[\.\[]/)[0].toLowerCase();
+      const hasCls = (this.getAttribute('class') || '').split(/\s+/).some(c => c.toLowerCase() === cls);
+      if (!hasCls) return false;
+    }
+
+    const attrMatch = sel.match(/\[([a-z0-9_-]+)(?:([*^$]?=)(?:"|')?([^"'\]]+)(?:"|')?)?\]/i);
+    if (attrMatch) {
+      const [, attr, op, val] = attrMatch;
+      const attrVal = this.getAttribute(attr);
+      if (attrVal === null) return false;
+      if (!op) return true;
+      if (op === '=') return attrVal.toLowerCase() === val.toLowerCase();
+      if (op === '*=') return attrVal.toLowerCase().includes(val.toLowerCase());
+      if (op === '^=') return attrVal.toLowerCase().startsWith(val.toLowerCase());
+      if (op === '$=') return attrVal.toLowerCase().endsWith(val.toLowerCase());
+    }
+
+    return true;
+  }
+
+  matches(selector) {
+    const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
+    return parts.some(part => this.matchesSingle(part));
+  }
+
+  querySelector(selector) {
+    return this.querySelectorAll(selector)[0] || null;
+  }
+
+  querySelectorAll(selector) {
+    const results = [];
+    const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
+    const walk = node => {
+      for (const child of node.children) {
+        if (parts.some(p => child.matchesSingle(p))) results.push(child);
+        walk(child);
+      }
+    };
+    walk(this);
+    return results;
+  }
+
+  appendChild(child) {
+    child.parentElement = this;
+    this.children.push(child);
+    return child;
+  }
+}
+
+class MockInputElement extends MockNode {
+  constructor(attrs = {}) {
+    super('INPUT', attrs);
+    this._checked = false;
+  }
+  get checked() { return this._checked; }
+  set checked(v) { this._checked = Boolean(v); }
+}
+
+Object.defineProperty(MockInputElement.prototype, 'value', {
+  get() { return this._value ?? ''; },
+  set(v) { this._value = String(v ?? ''); },
+  configurable: true,
+  enumerable: true
+});
+
+class MockSelectElement extends MockNode {
+  constructor(attrs = {}) {
+    super('SELECT', attrs);
+    this.options = [];
+    this.selectedIndex = -1;
+  }
+}
+
+Object.defineProperty(MockSelectElement.prototype, 'value', {
+  get() { return this._value ?? ''; },
+  set(v) { this._value = String(v ?? ''); },
+  configurable: true,
+  enumerable: true
+});
+
+class MockTextAreaElement extends MockNode {
+  constructor(attrs = {}) {
+    super('TEXTAREA', attrs);
+  }
+}
+
+Object.defineProperty(MockTextAreaElement.prototype, 'value', {
+  get() { return this._value ?? ''; },
+  set(v) { this._value = String(v ?? ''); },
+  configurable: true,
+  enumerable: true
+});
+
+// Setup globals
+globalThis.Event = MockEvent;
+globalThis.PointerEvent = MockPointerEvent;
+globalThis.MouseEvent = MockMouseEvent;
+globalThis.KeyboardEvent = MockKeyboardEvent;
+globalThis.FocusEvent = MockFocusEvent;
+globalThis.HTMLInputElement = MockInputElement;
+globalThis.HTMLSelectElement = MockSelectElement;
+globalThis.HTMLTextAreaElement = MockTextAreaElement;
+
+const mockDoc = new MockNode('#document');
+mockDoc.defaultView = globalThis;
+mockDoc.getElementById = id => {
+  const all = mockDoc.querySelectorAll('*');
+  return all.find(n => n.id === id) || null;
+};
+globalThis.document = mockDoc;
+mockDoc.body = new MockNode('BODY');
+mockDoc.appendChild(mockDoc.body);
+globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
+
+// Load core modules
+await import('../jobright_extension/core/field-mapping.js');
+await import('../jobright_extension/core/form-discovery.js');
+await import('../jobright_extension/core/field-writer.js');
+
+const writer = globalThis.NextkinFieldWriter;
+
+test.beforeEach(() => {
+  mockDoc.body.children = [];
+});
+
+test('1. Programmatic writes use native prototype descriptors and fire input, change, and blur events', () => {
+  assert.equal(typeof writer.setNativeValue, 'function', 'setNativeValue must be exported');
+
+  // Input element with prototype property descriptor tracking
+  const input = new MockInputElement();
+  input.id = 'applicant-first-name';
+  mockDoc.body.appendChild(input);
+
+  // Track descriptor setter calls on prototype
+  let protoSetterCalled = false;
+  const originalInputDesc = Object.getOwnPropertyDescriptor(MockInputElement.prototype, 'value');
+  Object.defineProperty(MockInputElement.prototype, 'value', {
+    get: originalInputDesc.get,
+    set(v) {
+      protoSetterCalled = true;
+      originalInputDesc.set.call(this, v);
+    },
+    configurable: true
+  });
+
+  // Track React value tracker reset
+  let trackerReset = false;
+  input._valueTracker = {
+    setValue(v) {
+      if (v === '') trackerReset = true;
+    }
+  };
+
+  try {
+    // Also simulate React overriding the instance property
+    let instanceSetterCalled = false;
+    Object.defineProperty(input, 'value', {
+      get() { return this._value; },
+      set(v) {
+        instanceSetterCalled = true;
+        // React controlled input may ignore plain assignment if not via native setter
+        this._value = v;
+      },
+      configurable: true
+    });
+
+    writer.setNativeValue(input, 'Samantha');
+
+    assert.equal(protoSetterCalled, true, 'Must call prototype descriptor setter');
+    assert.equal(input.value, 'Samantha');
+    assert.equal(trackerReset, true, 'Must reset React _valueTracker');
+    assert.ok(input.eventLog.includes('input'), 'Must dispatch input event');
+    assert.ok(input.eventLog.includes('change'), 'Must dispatch change event');
+    assert.ok(input.eventLog.includes('blur'), 'Must dispatch blur event');
+  } finally {
+    Object.defineProperty(MockInputElement.prototype, 'value', originalInputDesc);
+  }
+
+  // TextArea element
+  const textarea = new MockTextAreaElement();
+  mockDoc.body.appendChild(textarea);
+  writer.setNativeValue(textarea, 'Experienced software architect with 8 years...');
+  assert.equal(textarea.value, 'Experienced software architect with 8 years...');
+  assert.ok(textarea.eventLog.includes('input'), 'Textarea receives input event');
+  assert.ok(textarea.eventLog.includes('change'), 'Textarea receives change event');
+  assert.ok(textarea.eventLog.includes('blur'), 'Textarea receives blur event');
+
+  // Select element
+  const select = new MockSelectElement();
+  const opt = new MockNode('OPTION');
+  opt.value = 'US';
+  opt.textContent = 'United States';
+  select.options.push(opt);
+  mockDoc.body.appendChild(select);
+  writer.setNativeValue(select, 'US');
+  assert.equal(select.value, 'US');
+  assert.ok(select.eventLog.includes('input'), 'Select receives input event');
+  assert.ok(select.eventLog.includes('change'), 'Select receives change event');
+});
+
+test('2. Custom combobox ([role="combobox"], [aria-haspopup="listbox"]) triggers option list opening, selects matching option text, and verifies selected value', async () => {
+  const combo = new MockNode('DIV');
+  combo.setAttribute('role', 'combobox');
+  combo.setAttribute('aria-haspopup', 'listbox');
+  combo.setAttribute('aria-expanded', 'false');
+
+  const trigger = new MockNode('BUTTON');
+  trigger.setAttribute('class', 'select-trigger');
+  combo.appendChild(trigger);
+
+  const display = new MockNode('SPAN');
+  display.setAttribute('class', 'select-value');
+  combo.appendChild(display);
+
+  const listbox = new MockNode('UL');
+  listbox.setAttribute('role', 'listbox');
+  listbox.getClientRects = () => [{ width: 200, height: 100 }];
+
+  const opt1 = new MockNode('LI');
+  opt1.setAttribute('role', 'option');
+  opt1.textContent = 'Frontend Engineer';
+  opt1.setAttribute('data-value', 'fe');
+
+  const opt2 = new MockNode('LI');
+  opt2.setAttribute('role', 'option');
+  opt2.textContent = 'Senior Product Manager';
+  opt2.setAttribute('data-value', 'pm');
+
+  listbox.appendChild(opt1);
+  listbox.appendChild(opt2);
+
+  // Trigger click opens listbox in DOM and sets aria-expanded true
+  trigger.addEventListener('click', () => {
+    combo.setAttribute('aria-expanded', 'true');
+    mockDoc.body.appendChild(listbox);
+  });
+
+  // Clicking option updates combobox display, sets aria-selected, and closes listbox
+  opt2.addEventListener('click', () => {
+    display.textContent = 'Senior Product Manager';
+    opt2.setAttribute('aria-selected', 'true');
+    combo.setAttribute('aria-expanded', 'false');
+    if (listbox.parentElement) listbox.parentElement.children = listbox.parentElement.children.filter(c => c !== listbox);
+  });
+
+  mockDoc.body.appendChild(combo);
+
+  const field = {
+    key: 'field:job_role',
+    label: 'Desired Role',
+    kind: 'combobox',
+    element: combo
+  };
+
+  const res = await writer.fillCombo(field, 'Senior Product Manager', () => true);
+  assert.ok(res, 'fillCombo must succeed');
+  assert.equal(res.expected, 'Senior Product Manager');
+  assert.ok(trigger.eventLog.includes('click'), 'Trigger must be clicked to open combobox');
+  assert.ok(opt2.eventLog.includes('click'), 'Target option must be clicked');
+  assert.equal(display.textContent, 'Senior Product Manager', 'Readback must verify selected value');
+});
+
+test('3. Post-fill readback verification reads back element state 50ms after write and flags dropped writes as unverified', async () => {
+  // Input 1: persists write normally
+  const inputValid = new MockInputElement();
+  inputValid.id = 'applicant-city';
+  mockDoc.body.appendChild(inputValid);
+
+  const planValid = {
+    field: { key: 'field:city', label: 'City', kind: 'text', element: inputValid },
+    value: 'San Francisco',
+    status: 'supported'
+  };
+
+  // Input 2: simulates an asynchronous framework (React/Angular) wiping/dropping value 15ms after write
+  const inputDropped = new MockInputElement();
+  inputDropped.id = 'applicant-company';
+  mockDoc.body.appendChild(inputDropped);
+
+  inputDropped.addEventListener('input', () => {
+    setTimeout(() => {
+      // Framework wipes value back to empty string
+      inputDropped.value = '';
+    }, 15);
+  });
+
+  const planDropped = {
+    field: { key: 'field:company', label: 'Current Company', kind: 'text', element: inputDropped },
+    value: 'Acme Corp',
+    status: 'supported'
+  };
+
+  const report = await writer.applyFill([planValid, planDropped], { isCurrent: () => true });
+
+  // Verified field appears in filled
+  assert.ok(report.filled.some(r => r.field.key === 'field:city'), 'Persisted write must be in filled');
+  assert.equal(inputValid.value, 'San Francisco');
+
+  // Dropped field appears in unverified
+  assert.ok(report.unverified.some(r => r.field.key === 'field:company'), 'Dropped write must be in unverified');
+  assert.equal(inputDropped.value, '', 'Element value was wiped in DOM');
+});
+
+test('4. Returns a structured verification report { filled: [...], unverified: [...], manual: [...], unmapped: [...] }', async () => {
+  const input1 = new MockInputElement();
+  input1.id = 'applicant-first-name';
+  mockDoc.body.appendChild(input1);
+
+  const inputDropped = new MockInputElement();
+  inputDropped.id = 'applicant-title';
+  inputDropped.addEventListener('input', () => {
+    setTimeout(() => { inputDropped.value = ''; }, 10);
+  });
+  mockDoc.body.appendChild(inputDropped);
+
+  const manualInput = new MockInputElement();
+  manualInput.id = 'extra-url';
+  mockDoc.body.appendChild(manualInput);
+
+  const unmappedInput = new MockInputElement();
+  unmappedInput.id = 'custom-unknown';
+  mockDoc.body.appendChild(unmappedInput);
+
+  const plans = [
+    {
+      field: { key: 'field:first_name', label: 'First Name', kind: 'text', element: input1 },
+      value: 'Elena',
+      status: 'supported'
+    },
+    {
+      field: { key: 'field:title', label: 'Title', kind: 'text', element: inputDropped },
+      value: 'Lead Architect',
+      status: 'supported'
+    },
+    {
+      field: { key: 'field:other_url', label: 'Other URL', kind: 'text', element: manualInput },
+      status: 'manual',
+      reason: 'Unmapped link field; enter manually.'
+    },
+    {
+      field: { key: 'field:unknown_q', label: 'Unknown Question', kind: 'text', element: unmappedInput },
+      status: 'unmapped',
+      reason: 'No matching profile fact found.'
+    }
+  ];
+
+  const report = await writer.applyFill(plans, { isCurrent: () => true });
+
+  // Structured report verification
+  assert.ok(Array.isArray(report.filled), 'report.filled must be an array');
+  assert.ok(Array.isArray(report.unverified), 'report.unverified must be an array');
+  assert.ok(Array.isArray(report.manual), 'report.manual must be an array');
+  assert.ok(Array.isArray(report.unmapped), 'report.unmapped must be an array');
+
+  assert.equal(report.filled.length, 1, 'Exactly 1 field filled');
+  assert.equal(report.filled[0].field.key, 'field:first_name');
+  assert.equal(report.filled[0].writtenValue, 'Elena');
+
+  assert.equal(report.unverified.length, 1, 'Exactly 1 field unverified');
+  assert.equal(report.unverified[0].field.key, 'field:title');
+
+  assert.equal(report.manual.length, 1, 'Exactly 1 field manual');
+  assert.equal(report.manual[0].field.key, 'field:other_url');
+
+  assert.equal(report.unmapped.length, 1, 'Exactly 1 field unmapped');
+  assert.equal(report.unmapped[0].field.key, 'field:unknown_q');
+
+  // Verify standalone verifyWrites function
+  assert.equal(typeof writer.verifyWrites, 'function', 'verifyWrites must be exported');
+  const standaloneReport = writer.verifyWrites(plans);
+  assert.ok(standaloneReport.filled);
+  assert.ok(standaloneReport.unverified);
+  assert.ok(standaloneReport.manual);
+  assert.ok(standaloneReport.unmapped);
+
+  // Backwards compatibility with receipts array callers
+  assert.ok(Array.isArray(report), 'Return value must remain array-like for legacy callers');
+  assert.equal(report.length, 1, 'report.length equals filled count');
+  assert.equal(report[0].writtenValue, 'Elena');
+  const mapped = report.map(r => r.writtenValue);
+  assert.deepEqual(mapped, ['Elena']);
+});

`