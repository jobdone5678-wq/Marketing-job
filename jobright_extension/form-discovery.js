(function(root){'use strict';
  const excluded = /password|secret|token|credential|bank|routing|payment|credit.?card|ssn|social.?security|tax.?id|birth|dob|medical|health|disabil|ethnic|race|gender|veteran|religion|captcha|otp|one.?time.?code|search|emergency/i;

  function label(el){
    const tree = el.getRootNode();
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    let found = (el.getAttribute('aria-label') || ids.map(id => tree.getElementById?.(id)?.textContent).filter(Boolean).join(' ') || Array.from(el.labels || []).map(l => l.textContent).filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
    
    if (!found && el.id) {
      try {
        const explicitLbl = tree.querySelector ? tree.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        if (explicitLbl && explicitLbl.textContent) found = explicitLbl.textContent.trim();
      } catch(e) {}
    }
    
    if (!found) {
      const parentLbl = el.closest('label');
      if (parentLbl && parentLbl.textContent) found = parentLbl.textContent.trim();
    }
    
    if (!found) {
      // Modern ATS container search: Ashby, Greenhouse, Lever, Workday, BambooHR
      const qContainer = el.closest('.application-question, [class*="application-question"], [class*="fieldContainer"], [class*="field-container"], [class*="field_container"], [class*="fieldWrapper"], [class*="field-wrapper"], .form-group, .form-item, [class*="question"], [class*="formRow"], [class*="form-row"]');
      if (qContainer) {
        const qLbl = qContainer.querySelector('.application-label, [class*="application-label"], [class*="labelContainer"], [class*="label"], [class*="title"], [class*="header"], [class*="heading"], h3, h4, h5, strong, b');
        if (qLbl && qLbl.textContent && qLbl.textContent.trim().length < 200) {
          found = qLbl.textContent.trim();
        }
      }
    }
    
    if (!found) {
      let prev = el.previousElementSibling;
      if (!prev && el.parentElement) prev = el.parentElement.previousElementSibling;
      if (prev && (prev.classList.contains('application-label') || /label|title|header/i.test(prev.className) || prev.tagName === 'LABEL' || prev.tagName === 'DIV' || prev.tagName === 'SPAN')) {
        if (prev.textContent && prev.textContent.trim().length < 200) found = prev.textContent.trim();
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

    return found.replace(/\s+/g, ' ').trim() || el.getAttribute('placeholder') || '';
  }

  function discoverFields(tree = document) {
    const fields = [], seen = new Set();
    const adapter = [...(root.NextkinAdapters || [])].reverse().find(a => a.matches(location.hostname));
    const walk = scope => {
      for (const el of scope.querySelectorAll('input, textarea, select, [role="combobox"], [role="checkbox"], [aria-haspopup="listbox"], iframe')) {
        if (el.closest('#mp-copilot-root') || el.disabled || el.readOnly || !el.getClientRects().length) continue;
        if (el.tagName === 'IFRAME') {
          try {
            if (el.contentDocument && el.contentDocument.body) {
              walk(el.contentDocument);
              continue;
            }
          } catch(e) {}
          fields.push({ element: el, key: 'frame:' + fields.length, label: 'Embedded application requires manual review', kind: 'inaccessible', scope: '' });
          continue;
        }
        if (['hidden', 'file', 'password', 'submit', 'reset', 'button'].includes(el.type) && el.getAttribute('role') !== 'combobox' && el.getAttribute('role') !== 'checkbox' && el.getAttribute('aria-haspopup') !== 'listbox') continue;
        const text = label(el), hint = adapter?.hint(el) || '', group = el.closest('fieldset, [data-automation-id="workExperience"], [data-automation-id="education"]');
        const groupLabel = group?.querySelector('legend')?.textContent?.trim() || group?.getAttribute('data-automation-id') || '';
        const isCombo = el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox';
        const isCheck = el.type === 'checkbox' || el.getAttribute('role') === 'checkbox';
        const kind = isCombo ? 'combobox' : el.tagName === 'SELECT' ? 'select' : el.type === 'radio' ? 'radio' : isCheck ? 'checkbox' : 'text';
        let elements = [el];
        if (kind === 'radio') {
          elements = Array.from(scope.querySelectorAll('input[type="radio"]')).filter(r => r.name === el.name && r.form === el.form);
          if (elements.some(r => seen.has(r))) continue; elements.forEach(r => seen.add(r));
        }
        const options = kind === 'select' ? Array.from(el.options).filter(o => !o.disabled && o.value).map(o => ({ label: o.textContent.trim(), value: o.value, element: o })) : kind === 'radio' ? elements.map(r => ({ label: label(r) || r.value, value: r.value, element: r })) : [];
        fields.push({ element: el, elements, key: 'field:' + fields.length + ':' + (el.id || el.name || hint), label: kind === 'radio' ? groupLabel || text : text, hint, kind, options, scope: groupLabel, excluded: excluded.test([text, hint, el.id, el.name, groupLabel].join(' ').replace(/[_-]/g, ' ')), adapter: adapter?.id || 'generic' });
      }
      for (const el of scope.querySelectorAll('*')) if (el.shadowRoot && el.id !== 'mp-copilot-root') walk(el.shadowRoot);
    };
    walk(tree);
    return fields;
  }

  root.NextkinForms = { discoverFields, label };
})(globalThis);
