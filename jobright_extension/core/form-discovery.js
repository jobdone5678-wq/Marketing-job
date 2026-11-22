(function(root){'use strict';
  const excluded = /\b(?:password|secret|token|credential|bank|routing|payment|credit.?card|ssn|social.?security|tax.?id|captcha|otp|one.?time.?code)\b/i;

  // Every control shape a job application uses, across portals.
  const COMBO_SELECTOR = '[role="combobox"], [aria-haspopup="listbox"], input[list], .select2-selection, .ng-select, kendo-dropdownlist, kendo-multiselect, button[class*="select-trigger" i], button[class*="selectTrigger" i], button[data-testid*="select" i], button[data-testid*="combobox" i], [data-slot="select-trigger"], [data-automation-id*="prompt" i], [data-automation-id*="select" i], [id^="headlessui-listbox-button"]';
  const CHECK_SELECTOR = 'input[type="checkbox"], [role="checkbox"], [role="switch"], [data-slot="checkbox"], [data-slot="switch"]';
  const CONTROL_SELECTOR = 'input, textarea, select, ' + CHECK_SELECTOR + ', [contenteditable=""], [contenteditable="true"], iframe, ' + COMBO_SELECTOR;
  const available = el => !el.disabled && !el.readOnly && el.getAttribute('aria-disabled') !== 'true' && el.getAttribute('aria-hidden') !== 'true';
  const visible = el => available(el) && !!el.getClientRects().length && el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden';
  const visibleChoice = el => available(el) && (visible(el) || [...(el.labels || [])].some(visible));
  const multiComboSelector = '[aria-multiselectable="true"], [multiple], [data-multiple="true"], .ng-select-multiple, .select2-selection--multiple, kendo-multiselect';

  // Containers that hold a repeated history: a single fact never fills those.
  const HISTORY_SELECTOR = 'fieldset, [data-automation-id="workExperience"], [data-automation-id="education"], [data-automation-id*="workexperience" i], [data-automation-id*="education" i], [class*="work-experience" i], [class*="workexperience" i], [class*="employment-history" i], [class*="education-history" i]';

  // Containers that name the question a control answers.
  const QUESTION_CONTAINER = '.application-question, [class*="application-question"], [class*="fieldContainer"], [class*="field-container"], [class*="field_container"], [class*="fieldWrapper"], [class*="field-wrapper"], [class*="field-entry"], [class*="fieldEntry"], .form-group, .form-item, [class*="question"], [class*="formRow"], [class*="form-row"], [class*="form-field" i], [class*="formField" i]';

  // Portals decorate labels with required markers and punctuation.
  function clean(text){
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/[*:]+$/, '')
      .replace(/\s*\(\s*(required|optional)\s*\)\s*$/i, '')
      .trim();
  }

  function querySelectorAllDeep(selector, rootNode = document) {
    const results = [];
    function search(node) {
      if (!node) return;
      if (node.querySelectorAll) {
        try {
          const matches = node.querySelectorAll(selector);
          for (let i = 0; i < matches.length; i++) {
            results.push(matches[i]);
          }
        } catch {}
      }
      const children = node.querySelectorAll ? node.querySelectorAll('*') : [];
      for (let i = 0; i < children.length; i++) {
        if (children[i].shadowRoot && children[i].id !== 'mp-copilot-root' && children[i].id !== 'nextkin-floating-widget-root') {
          search(children[i].shadowRoot);
        }
      }
    }
    search(rootNode);
    return results;
  }

  function isResumeInput(el, text = '') {
    if (!el || el.tagName !== 'INPUT' || el.type !== 'file') return false;
    const combined = [
      text,
      el.name || '',
      el.id || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('placeholder') || '',
      el.getAttribute('accept') || '',
      el.closest('.application-question, [class*="question"], fieldset, [class*="field"]')?.textContent || '',
    ].join(' ').toLowerCase();
    const resumeRegex = /resume|cv|curriculum[\s_-]*vitae/i;
    if (/cover[\s_-]*letter|portfolio|transcript/i.test(combined) && !resumeRegex.test(combined)) {
      return false;
    }
    return resumeRegex.test(combined);
  }

  function labelText(node) {
    if (!node?.querySelector('select, textarea, button, [role="listbox"]')) return node?.textContent;
    const copy = node.cloneNode(true);
    copy.querySelectorAll('select, textarea, button, [role="listbox"]').forEach(control => control.remove());
    return copy.textContent;
  }

  function label(el){
    const tree = el.getRootNode();
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    let found = clean(el.getAttribute('aria-label') || ids.map(id => labelText(tree.getElementById?.(id))).filter(Boolean).join(' ') || Array.from(el.labels || []).map(labelText).filter(Boolean).join(' '));

    if (!found && el.id) {
      try {
        const scope = tree.querySelector ? tree : document;
        const explicitLbl = scope.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (explicitLbl) found = clean(labelText(explicitLbl));
      } catch {}
    }

    if (!found) {
      const parentLbl = el.closest('label');
      if (parentLbl) found = clean(labelText(parentLbl));
    }

    if (!found && (el.matches(`${CHECK_SELECTOR}, [role="radio"]`))) {
      const ownLabel = clean(el.textContent);
      if (ownLabel.length <= 200) found = ownLabel;
    }

    // Table based layouts (Taleo, PeopleSoft): the row header names the field.
    if (!found) {
      const row = el.closest('tr');
      if (row) {
        const head = row.querySelector('th, [class*="prompt" i], [class*="label" i]');
        if (head && head.textContent && head.textContent.trim().length < 2500) found = clean(head.textContent);
      }
    }

    if (!found) {
      // Modern ATS container search: Ashby, Greenhouse, Lever, Workday, BambooHR
      const qContainer = el.closest(QUESTION_CONTAINER + ', [class*="select__container"], .select, .phone-input__country');
      if (qContainer) {
        const qLbl = qContainer.querySelector('label[class*="question-title"], [class*="question-title"], .application-label, [class*="application-label"], [class*="labelContainer"], [class*="label"], [class*="title"], [class*="header"], [class*="heading"], h3, h4, h5, strong, b');
        if (qLbl && qLbl.textContent && qLbl.textContent.trim().length < 2500) {
          found = clean(labelText(qLbl));
        }
      }
    }

    if (!found) {
      let prev = el.previousElementSibling;
      if (!prev && el.parentElement) prev = el.parentElement.previousElementSibling;
      if (prev && (prev.classList.contains('application-label') || /label|title|header|prompt/i.test(prev.className) || prev.tagName === 'LABEL' || prev.tagName === 'DIV' || prev.tagName === 'SPAN')) {
        if (prev.textContent && prev.textContent.trim().length < 2500) found = clean(prev.textContent);
      }
    }

    // Direct ATS system field attribute hint
    if (!found && el.name) {
      if (el.name === '_systemfield_name') found = 'Full Name';
      else if (el.name === '_systemfield_email') found = 'Email';
      else if (el.name === '_systemfield_location') found = 'Location';
      else if (el.name === '_systemfield_phone') found = 'Phone';
      else if (/urls\[([^\]]+)\]/i.test(el.name)) found = RegExp.$1;
    }

    if (!found && (el.getAttribute('role') === 'checkbox' || el.tagName !== 'INPUT') && el.textContent && el.textContent.trim().length < 2500) {
      found = clean(el.textContent);
    }

    return found || clean(el.getAttribute('placeholder')) || clean(el.getAttribute('name')?.replace(/[_-]+/g, ' '));
  }

  // Question text for a control group: its own legend/label, else the label of the enclosing question entry.
  function questionTitle(group){
    const container = group.closest('fieldset, [role="group"], [role="radiogroup"], .application-question, [class*="application-question"], [class*="field-entry"], [class*="fieldEntry"], [class*="question"]');
    const inner = container?.querySelector('legend, label, [class*="question-title"], [class*="label"], [class*="title"], h3, h4, strong');
    const text = (inner?.textContent || group.textContent || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 2000);
  }

  // Title of a container that asks one question about several boxes.
  function groupTitle(group){
    const accessibleName = group.getAttribute('aria-label') || group.getAttribute('aria-labelledby')?.split(/\s+/)
      .map(id => group.getRootNode().getElementById?.(id)?.textContent).filter(Boolean).join(' ');
    if (accessibleName) return clean(accessibleName).slice(0, 2000);
    const legend = group.querySelector('legend');
    if (legend && legend.textContent && legend.textContent.trim()) return clean(legend.textContent).slice(0, 2000);
    const title = group.querySelector('[class*="question-title" i], [class*="application-label" i], [class*="labelContainer" i], h3, h4, h5, strong, p') ||
      [...group.querySelectorAll('label')].find(el => !el.control && !el.querySelector('input, [role="radio"], [role="checkbox"]'));
    if (title && title.textContent && title.textContent.trim().length < 2500) return clean(title.textContent).slice(0, 2000);
    return '';
  }

  function choiceQuestion(el) {
    const selector = '[role="radiogroup"], [role="group"], fieldset, ' + QUESTION_CONTAINER;
    for (let group = el.closest(selector); group; group = group.parentElement?.closest(selector)) {
      const title = groupTitle(group);
      if (title) return title;
    }
    return '';
  }

  const controlName = el => clean((el.name || el.id || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '));
  const booleanFacts = new Set(['authorized_in_usa', 'needs_sponsorship', 'open_to_relocation', 'consent']);

  // The portal adapter for this page: a specific one always beats the generic fallback.
  function activeAdapter(){
    const host = (typeof location !== 'undefined' ? location.hostname : '');
    if (typeof root.resolveActiveAdapter === 'function') return root.resolveActiveAdapter(host);
    const list = root.NextkinAdapters || [];
    for (const a of list) {
      if (!a || a.id === 'generic' || typeof a.matches !== 'function') continue;
      try { if (a.matches(host)) return a; } catch {}
    }
    return list.find(a => a && a.id === 'generic') || null;
  }

  function discoverFields(tree = document) {
    const fields = [], seen = new Set();
    const adapter = activeAdapter();
    const walk = scope => {
      // A checkbox group asks one question about several boxes, so the group is the field.
      for (const group of scope.querySelectorAll('fieldset, [role="group"], [class*="checkbox-group" i], [class*="checkboxGroup" i], [class*="checkbox_group" i], [data-testid*="checkbox" i]')) {
        if (group.closest('#mp-copilot-root') || !group.getClientRects().length) continue;
        if (group.querySelector('button[data-option]')) continue; // yes/no groups are choices
        const boxes = Array.from(group.querySelectorAll(CHECK_SELECTOR)).filter(visibleChoice);
        if (boxes.length < 2 || boxes.some(b => seen.has(b)) ||
          group.querySelector('input:not([type=checkbox]):not([type=hidden]), select, textarea, fieldset')) continue;
        const title = groupTitle(group);
        if (!title) continue;
        if (boxes.some(box => booleanFacts.has(root.NextkinFieldMapping?.resolveFact(label(box), controlName(box))?.key))) continue;
        boxes.forEach(b => seen.add(b));
        const groupHint = adapter?.hint(group) || '';
        fields.push({
          element: group, elements: boxes, key: 'checkbox-group:' + fields.length,
          label: title, hint: groupHint, kind: 'checkbox-group',
          options: boxes.map(box => ({ label: label(box), value: box.value || '', element: box })), scope: '',
          excluded: excluded.test([title, groupHint, group.id || ''].join(' ').replace(/[_-]/g, ' ')),
          adapter: adapter?.id || 'generic'
        });
      }

      for (const el of scope.querySelectorAll(CONTROL_SELECTOR)) {
        if (el.closest('#mp-copilot-root') || !visibleChoice(el)) continue;
        if (seen.has(el)) continue;
        if (el.tagName === 'INPUT' && el.tabIndex === -1 && !el.id && !el.name && !el.getAttribute('role')) continue;
        if (el.tagName === 'INPUT' && el.id && el.id.startsWith('iti-') && el.id.endsWith('search-input')) continue;
        if (el.tagName === 'IFRAME') {
          let inner = 0;
          try {
            if (el.contentDocument && el.contentDocument.body) {
              const before = fields.length;
              walk(el.contentDocument);
              inner = fields.length - before;
              if (inner > 0) continue;
            }
          } catch {}
          fields.push({ element: el, key: 'frame:' + fields.length, label: 'Embedded application requires manual review', kind: 'inaccessible', scope: '' });
          continue;
        }
        const role = el.getAttribute('role');
        const isCheck = el.matches(CHECK_SELECTOR);
        const text = label(el), hint = adapter?.hint(el) || '';
        const isFile = el.tagName === 'INPUT' && el.type === 'file';
        const isResume = isFile && isResumeInput(el, text);
        if (['hidden', 'password', 'submit', 'reset', 'button'].includes(el.type) && role !== 'combobox' && !isCheck && el.getAttribute('aria-haspopup') !== 'listbox') continue;
        if (isFile && !isResume) continue;
        // A yes/no group owns the hidden box behind its buttons.
        if (el.type === 'checkbox' && el.closest('.ashby-application-form-input-yesno, [class*="yesno" i], [class*="yes-no" i], [data-option]')) continue;
        const group = el.closest(HISTORY_SELECTOR);
        const groupLabel = group?.querySelector('legend')?.textContent?.trim() || group?.getAttribute('data-automation-id') || '';
        const isCombo = el.tagName !== 'SELECT' && el.matches(COMBO_SELECTOR);
        if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA' && el.querySelector('input[role="combobox"], input.select__input, select, textarea')) continue;
        if (el.parentElement?.closest(COMBO_SELECTOR) && (isCombo || el.tagName === 'INPUT') && !el.matches('[role="combobox"]')) continue;
        const isEditable = el.getAttribute('contenteditable') === '' || el.getAttribute('contenteditable') === 'true';
        const controlledList = isCombo && el.getRootNode().getElementById?.(el.getAttribute('aria-controls'));
        const multiCombo = isCombo && (el.matches(multiComboSelector) || controlledList?.matches(multiComboSelector));
        const kind = isResume ? 'resume-file'
          : isCombo ? (multiCombo ? 'multi-combobox' : 'combobox')
          : el.tagName === 'SELECT' ? (el.multiple ? 'multi-select' : 'select') : el.type === 'radio' ? 'radio' : isCheck ? 'checkbox' : 'text';
        let elements = [el];
        if (kind === 'radio') {
          const radioGroup = el.closest('[role="radiogroup"], fieldset, ' + QUESTION_CONTAINER);
          elements = Array.from((el.name ? scope : radioGroup || scope).querySelectorAll('input[type="radio"]'))
            .filter(r => visibleChoice(r) && (el.name ? r.name === el.name && r.form === el.form : radioGroup ? !r.name : r === el));
          if (elements.some(r => seen.has(r))) continue; elements.forEach(r => seen.add(r));
        }
        const options = ['select', 'multi-select'].includes(kind)
          ? Array.from(el.options).filter(o => !o.disabled && !o.parentElement.disabled && o.value).map(o => ({ label: o.textContent.trim(), value: o.value, element: o }))
          : kind === 'radio' ? elements.map(r => ({ label: label(r) || r.value, value: r.value, element: r }))
          : el.list ? [...el.list.options].filter(available).map(o => ({ label: o.label || o.value, value: o.value, element: o })) : [];
        const question = kind === 'radio' ? choiceQuestion(el) || controlName(el) || text : text;
        const factHint = hint || (kind === 'radio' || isCheck ? controlName(el) : '');
        fields.push({ element: el, elements, key: 'field:' + fields.length + ':' + (el.id || el.name || factHint), label: question, hint: factHint, kind, options, scope: groupLabel, excluded: excluded.test([question, factHint, el.id, el.name, groupLabel].join(' ').replace(/[_-]/g, ' ')), adapter: adapter?.id || 'generic', editable: isEditable });
      }

      // Button-based choice groups (Ashby/Greenhouse/Lever Yes/No and segmented radio groups)
      for (const group of scope.querySelectorAll('fieldset, [role="group"], [role="radiogroup"], .application-question, [class*="application-question"], [class*="question"], div[data-testid*="question"]')) {
        if (group.closest('#mp-copilot-root') || !group.getClientRects().length) continue;
        const buttons = Array.from(group.querySelectorAll('button, [role="radio"], [role="button"]')).filter(b => {
          if (b.type === 'radio') return false;
          const t = label(b);
          return t && t.length <= 200 && visible(b) && !/^(submit|apply|continue|next|back|save|upload|attach|remove|delete|cancel|sign in|log in)\b/i.test(t);
        });
        const yesNo = buttons.filter(b => /^(yes|no)$/i.test((b.textContent || '').trim()));
        const isChoice = yesNo.length >= 2 || (group.getAttribute('role') === 'radiogroup' && buttons.length >= 2);
        if (!isChoice) continue;
        const radios = buttons.filter(button => button.getAttribute('role') === 'radio');
        const opts = radios.length >= 2 ? radios : yesNo.length >= 2 ? yesNo : buttons;
        if (opts.some(b => seen.has(b))) continue;
        opts.forEach(b => seen.add(b));
        const qLabel = groupTitle(group) || questionTitle(group);
        fields.push({ element: group, elements: opts, key: 'choice:' + fields.length, label: qLabel, hint: adapter?.hint(group) || '', kind: 'choice', options: opts.map(b => ({ label: label(b), value: b.getAttribute('data-value') || label(b), element: b })), scope: '', excluded: excluded.test(qLabel.replace(/[_-]/g, ' ')), adapter: adapter?.id || 'generic' });
      }
      // Yes/No button groups that carry no question text of their own (Ashby keeps them in a labelled field entry
      // and backs them with a hidden input that is not the visible control).
      const yesNoGroups = new Set();
      for (const btn of scope.querySelectorAll('button[data-option]')) {
        const group = btn.parentElement;
        if (!group || yesNoGroups.has(group) || group.closest('#mp-copilot-root') || !group.getClientRects().length) continue;
        const opts = Array.from(group.querySelectorAll('button[data-option]'));
        if (opts.length < 2 || opts.some(b => seen.has(b))) continue;
        yesNoGroups.add(group);
        opts.forEach(b => seen.add(b));
        const qLabel = questionTitle(group);
        fields.push({ element: group, elements: opts, key: 'choice:' + fields.length, label: qLabel, hint: adapter?.hint(group) || '', kind: 'choice', options: opts.map(b => ({ label: (b.textContent || '').trim(), value: (b.textContent || '').trim(), element: b })), scope: '', excluded: excluded.test(qLabel.replace(/[_-]/g, ' ')), adapter: adapter?.id || 'generic' });
      }
      for (const el of scope.querySelectorAll('*')) if (el.shadowRoot && el.id !== 'mp-copilot-root') walk(el.shadowRoot);
    };
    walk(tree);
    return fields;
  }

  // Wizard / Multi-Step transition support
  const NEXT_TEXT_REGEX = /^(next|continue|proceed|save and continue|save & continue|next step|review & submit|review|next page|step \d+)\b/i;

  function isStepNavigation(button) {
    if (!button || !visibleChoice(button)) return false;
    const text = clean(button.textContent || button.value || button.getAttribute('aria-label'));
    if (/\b(?:submit|complete|finish|send)\b/i.test(text)) return false;
    const id = button.getAttribute('data-automation-id') || button.getAttribute('data-testid') || '';
    return NEXT_TEXT_REGEX.test(text) || /(?:^|[_-])(?:next|continue|nextstep)(?:$|[_-])/i.test(id);
  }

  function findStepNavigation(scope = document) {
    const root = scope?.nodeType === 9 ? scope : (scope?.ownerDocument || document);
    const container = scope?.nodeType === 9 ? (scope.body || scope) : scope;
    const buttons = Array.from(container.querySelectorAll('button, input[type=button], input[type=submit], a[role=button], [role="button"]'));
    const nextButton = buttons.find(isStepNavigation) || null;
    return { nextButton };
  }

  function detectNewFields(previousFields, currentFields) {
    if (!Array.isArray(previousFields) || !previousFields.length) return currentFields || [];
    return (currentFields || []).filter(field => !previousFields.some(previous =>
      previous.element === field.element && previous.label === field.label && previous.kind === field.kind));
  }

  function observeStepTransitions(scope = document, callback) {
    let prevFields = discoverFields(scope);
    let timer = null;

    const check = triggerType => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const currentFields = discoverFields(scope);
          const newFields = detectNewFields(prevFields, currentFields);
          if (newFields.length > 0 || currentFields.length !== prevFields.length) {
            const oldFields = prevFields;
            prevFields = currentFields;
            callback?.({ newFields, allFields: currentFields, oldFields, triggerType });
          }
        } catch (err) {
          console.error('[NextkinForms] Step transition error:', err);
        }
      }, 150);
    };

    const clickHandler = event => {
      const target = event.target?.closest?.('button, input[type=submit], input[type=button], a[role=button], [role="button"]');
      if (!target) return;
      const text = clean(target.textContent || target.value || target.getAttribute('aria-label'));
      const autoId = target.getAttribute('data-automation-id') || target.getAttribute('data-testid') || '';
      if (NEXT_TEXT_REGEX.test(text) || /(?:^|[_-])(?:next|continue)(?:$|[_-])/i.test(autoId)) {
        check('next_click');
      }
    };

    const doc = scope?.nodeType === 9 ? scope : (scope?.ownerDocument || document);
    doc.addEventListener('click', clickHandler, true);

    let observer = null;
    const targetNode = scope.body || (scope.nodeType === 1 ? scope : doc.body);
    if (targetNode && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(mutations => {
        let significant = false;
        for (const m of mutations) {
          if (m.addedNodes.length > 0) {
            for (const node of m.addedNodes) {
              if (node.nodeType === 1 && (node.matches?.('input, select, textarea, [role="combobox"], [role="radiogroup"], fieldset, form') || node.querySelector?.('input, select, textarea, [role="combobox"]'))) {
                significant = true;
                break;
              }
            }
          }
            if (m.removedNodes.length || m.type === 'characterData' || m.type === 'attributes') {
            significant = true;
          }
          if (significant) break;
        }
        if (significant) check('mutation');
      });
      observer.observe(targetNode, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'aria-label', 'aria-labelledby'] });
    }

    return {
      disconnect() {
        if (timer) clearTimeout(timer);
        doc.removeEventListener('click', clickHandler, true);
        observer?.disconnect();
      },
      triggerCheck() {
        check('manual');
      }
    };
  }

  root.NextkinForms = {
    discoverFields,
    label,
    findStepNavigation,
    isStepNavigation,
    detectNewFields,
    observeStepTransitions,
    querySelectorAllDeep,
    isResumeInput,
    discoverUniversal: discoverFields,
  };
})(globalThis);
