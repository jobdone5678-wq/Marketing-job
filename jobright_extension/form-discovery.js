(function(root){'use strict';
  const excluded = /password|secret|token|credential|bank|routing|payment|credit.?card|ssn|social.?security|tax.?id|birth|dob|medical|health|disabil|ethnic|race|gender|veteran|religion|captcha|otp|one.?time.?code|search|emergency|referr|referenc/i;

  // Every control shape a job application uses, across portals.
  const CONTROL_SELECTOR = 'input, textarea, select, [role="combobox"], [role="checkbox"], [aria-haspopup="listbox"], [contenteditable=""], [contenteditable="true"], button[class*="select-trigger" i], button[class*="selectTrigger" i], button[data-testid*="select" i], button[data-testid*="combobox" i], iframe';

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

  function label(el){
    const tree = el.getRootNode();
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    let found = clean(el.getAttribute('aria-label') || ids.map(id => tree.getElementById?.(id)?.textContent).filter(Boolean).join(' ') || Array.from(el.labels || []).map(l => l.textContent).filter(Boolean).join(' '));

    if (!found && el.id) {
      try {
        const scope = tree.querySelector ? tree : document;
        const explicitLbl = scope.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (explicitLbl && explicitLbl.textContent) found = clean(explicitLbl.textContent);
      } catch(e) {}
    }

    if (!found) {
      const parentLbl = el.closest('label');
      if (parentLbl && parentLbl.textContent) found = clean(parentLbl.textContent);
    }

    // Table based layouts (Taleo, PeopleSoft): the row header names the field.
    if (!found) {
      const row = el.closest('tr');
      if (row) {
        const head = row.querySelector('th, [class*="prompt" i], [class*="label" i]');
        if (head && head.textContent && head.textContent.trim().length < 200) found = clean(head.textContent);
      }
    }

    if (!found) {
      // Modern ATS container search: Ashby, Greenhouse, Lever, Workday, BambooHR
      const qContainer = el.closest(QUESTION_CONTAINER);
      if (qContainer) {
        const qLbl = qContainer.querySelector('label[class*="question-title"], [class*="question-title"], .application-label, [class*="application-label"], [class*="labelContainer"], [class*="label"], [class*="title"], [class*="header"], [class*="heading"], h3, h4, h5, strong, b');
        if (qLbl && qLbl.textContent && qLbl.textContent.trim().length < 200) {
          found = clean(qLbl.textContent);
        }
      }
    }

    if (!found) {
      let prev = el.previousElementSibling;
      if (!prev && el.parentElement) prev = el.parentElement.previousElementSibling;
      if (prev && (prev.classList.contains('application-label') || /label|title|header|prompt/i.test(prev.className) || prev.tagName === 'LABEL' || prev.tagName === 'DIV' || prev.tagName === 'SPAN')) {
        if (prev.textContent && prev.textContent.trim().length < 200) found = clean(prev.textContent);
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

    if (!found && (el.getAttribute('role') === 'checkbox' || el.tagName !== 'INPUT') && el.textContent && el.textContent.trim().length < 200) {
      found = clean(el.textContent);
    }

    return found || clean(el.getAttribute('placeholder')) || '';
  }

  // Question text for a control group: its own legend/label, else the label of the enclosing question entry.
  function questionTitle(group){
    const container = group.closest('fieldset, [role="group"], [role="radiogroup"], .application-question, [class*="application-question"], [class*="field-entry"], [class*="fieldEntry"], [class*="question"]');
    const inner = container?.querySelector('legend, label, [class*="question-title"], [class*="label"], [class*="title"], h3, h4, strong');
    const text = (inner?.textContent || group.textContent || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 200);
  }

  // Title of a container that asks one question about several boxes.
  function groupTitle(group){
    const legend = group.querySelector('legend');
    if (legend && legend.textContent && legend.textContent.trim()) return clean(legend.textContent).slice(0, 200);
    const title = group.querySelector('label[class*="question-title" i], [class*="question-title" i], [class*="application-label" i], [class*="labelContainer" i], label, h3, h4, h5, strong');
    if (title && title.textContent && title.textContent.trim().length < 200) return clean(title.textContent).slice(0, 200);
    return '';
  }

  // The portal adapter for this page: a specific one always beats the generic fallback.
  function activeAdapter(){
    const host = (typeof location !== 'undefined' ? location.hostname : '');
    if (typeof root.resolveActiveAdapter === 'function') return root.resolveActiveAdapter(host);
    const list = root.NextkinAdapters || [];
    for (const a of list) {
      if (!a || a.id === 'generic' || typeof a.matches !== 'function') continue;
      try { if (a.matches(host)) return a; } catch(e) {}
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
        const boxes = Array.from(group.querySelectorAll('input[type="checkbox"], [role="checkbox"]')).filter(b => b.getClientRects().length);
        if (!boxes.length || boxes.some(b => seen.has(b))) continue;
        const title = groupTitle(group);
        if (!title) continue;
        boxes.forEach(b => seen.add(b));
        const groupHint = adapter?.hint(group) || '';
        fields.push({
          element: group, elements: boxes, key: 'checkbox-group:' + fields.length,
          label: title, hint: groupHint, kind: 'checkbox', options: [], scope: '',
          excluded: excluded.test([title, groupHint, group.id || ''].join(' ').replace(/[_-]/g, ' ')),
          adapter: adapter?.id || 'generic'
        });
      }

      for (const el of scope.querySelectorAll(CONTROL_SELECTOR)) {
        if (el.closest('#mp-copilot-root') || el.disabled || el.readOnly || !el.getClientRects().length) continue;
        if (seen.has(el)) continue;
        if (el.tagName === 'IFRAME') {
          let inner = 0;
          try {
            if (el.contentDocument && el.contentDocument.body) {
              const before = fields.length;
              walk(el.contentDocument);
              inner = fields.length - before;
              if (inner > 0) continue;
            }
          } catch(e) {}
          fields.push({ element: el, key: 'frame:' + fields.length, label: 'Embedded application requires manual review', kind: 'inaccessible', scope: '' });
          continue;
        }
        const role = el.getAttribute('role');
        if (['hidden', 'file', 'password', 'submit', 'reset', 'button'].includes(el.type) && role !== 'combobox' && role !== 'checkbox' && el.getAttribute('aria-haspopup') !== 'listbox') continue;
        // A yes/no group owns the hidden box behind its buttons.
        if (el.type === 'checkbox' && el.closest('.ashby-application-form-input-yesno, [class*="yesno" i], [class*="yes-no" i], [data-option]')) continue;
        const text = label(el), hint = adapter?.hint(el) || '';
        const group = el.closest(HISTORY_SELECTOR);
        const groupLabel = group?.querySelector('legend')?.textContent?.trim() || group?.getAttribute('data-automation-id') || '';
        const isCombo = role === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox' || (el.tagName === 'BUTTON' && /select|combobox/i.test(el.getAttribute('data-testid') || el.className || ''));
        const isCheck = el.type === 'checkbox' || role === 'checkbox';
        const isEditable = el.getAttribute('contenteditable') === '' || el.getAttribute('contenteditable') === 'true';
        const kind = isCombo ? 'combobox' : el.tagName === 'SELECT' ? 'select' : el.type === 'radio' ? 'radio' : isCheck ? 'checkbox' : 'text';
        let elements = [el];
        if (kind === 'radio') {
          elements = Array.from(scope.querySelectorAll('input[type="radio"]')).filter(r => r.name === el.name && r.form === el.form);
          if (elements.some(r => seen.has(r))) continue; elements.forEach(r => seen.add(r));
        }
        const options = kind === 'select' ? Array.from(el.options).filter(o => !o.disabled && o.value).map(o => ({ label: o.textContent.trim(), value: o.value, element: o })) : kind === 'radio' ? elements.map(r => ({ label: label(r) || r.value, value: r.value, element: r })) : [];
        fields.push({ element: el, elements, key: 'field:' + fields.length + ':' + (el.id || el.name || hint), label: kind === 'radio' ? groupLabel || text : text, hint, kind, options, scope: groupLabel, excluded: excluded.test([text, hint, el.id, el.name, groupLabel].join(' ').replace(/[_-]/g, ' ')), adapter: adapter?.id || 'generic', editable: isEditable });
      }

      // Button-based choice groups (Ashby/Greenhouse/Lever Yes/No and segmented radio groups)
      for (const group of scope.querySelectorAll('fieldset, [role="group"], [role="radiogroup"], .application-question, [class*="application-question"], [class*="question"], div[data-testid*="question"]')) {
        if (group.closest('#mp-copilot-root') || !group.getClientRects().length) continue;
        const buttons = Array.from(group.querySelectorAll('button, [role="radio"], [role="button"]')).filter(b => {
          const t = (b.textContent || '').trim();
          return t && t.length <= 40 && b.getClientRects().length && !/submit|apply|continue|next|back|save|upload|attach|remove|delete|cancel|sign in|log in/i.test(t);
        });
        const yesNo = buttons.filter(b => /^(yes|no)$/i.test((b.textContent || '').trim()));
        const isChoice = yesNo.length >= 2 || (group.getAttribute('role') === 'radiogroup' && buttons.length >= 2);
        if (!isChoice) continue;
        const opts = yesNo.length >= 2 ? yesNo : buttons;
        if (opts.some(b => seen.has(b))) continue;
        opts.forEach(b => seen.add(b));
        const qLabel = clean(group.querySelector('legend, label, [class*="label"], [class*="title"], h3, h4, strong, p')?.textContent || questionTitle(group)).slice(0, 200);
        fields.push({ element: group, elements: opts, key: 'choice:' + fields.length, label: qLabel, hint: adapter?.hint(group) || '', kind: 'choice', options: opts.map(b => ({ label: (b.textContent || '').trim(), value: (b.textContent || '').trim(), element: b })), scope: '', excluded: excluded.test(qLabel.replace(/[_-]/g, ' ')), adapter: adapter?.id || 'generic' });
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

  root.NextkinForms = { discoverFields, label };
})(globalThis);
