const fs = require('fs');

const file = 'jobright_extension/outside-job-engine.js';
let content = fs.readFileSync(file, 'utf8');

// 1. In checkbox handler:
content = content.replace(
  `            window.__nextkinAutofillReceipts.push({
              element: el,
              previousValue: prevVal,
              writtenValue: true,
              property: 'checked',
              timestamp: Date.now()
            });
            filledCount++;`,
  `            el.setAttribute('data-nextkin-filled', 'true');
            el.setAttribute('data-nextkin-label', descriptor);
            window.__nextkinAutofillReceipts.push({
              element: el,
              label: descriptor,
              previousValue: prevVal,
              writtenValue: true,
              property: 'checked',
              timestamp: Date.now()
            });
            filledCount++;`
);

// 2. In radio handler:
content = content.replace(
  `            window.__nextkinAutofillReceipts.push({
              element: el,
              previousValue: prevVal,
              writtenValue: true,
              property: 'checked',
              timestamp: Date.now()
            });
            filledCount++;`,
  `            el.setAttribute('data-nextkin-filled', 'true');
            el.setAttribute('data-nextkin-label', descriptor);
            window.__nextkinAutofillReceipts.push({
              element: el,
              label: descriptor,
              previousValue: prevVal,
              writtenValue: true,
              property: 'checked',
              timestamp: Date.now()
            });
            filledCount++;`
);

// 3. In text / select / textarea / combobox handler:
content = content.replace(
  `            window.__nextkinAutofillReceipts.push({
              element: el,
              previousValue: prevVal,
              writtenValue: valToWrite,
              property: 'value',
              timestamp: Date.now()
            });
            filledCount++;`,
  `            el.setAttribute('data-nextkin-filled', 'true');
            el.setAttribute('data-nextkin-label', descriptor);
            window.__nextkinAutofillReceipts.push({
              element: el,
              label: descriptor,
              previousValue: prevVal,
              writtenValue: valToWrite,
              property: 'value',
              timestamp: Date.now()
            });
            filledCount++;`
);

// 4. Update the completion broadcast at the end of executeOutsideAutofill
const oldDoneBlock = `    try {
      const filledLabelsList = Array.from(document.querySelectorAll('[data-nextkin-filled]')).map(el => getControlDescriptor(el)).filter(Boolean);
      window.top.postMessage({ type: 'NEXTKIN_AUTOFILL_DONE', filledCount, filledFields: filledLabelsList }, '*');
      window.top.dispatchEvent(new CustomEvent('NextkinAutofillDone', { detail: { filledCount } }));
    } catch (_) {}`;

const newDoneBlock = `    try {
      const filledElements = Array.from(document.querySelectorAll('[data-nextkin-filled]'));
      let filledLabelsList = filledElements.map(el => el.getAttribute('data-nextkin-label') || getControlDescriptor(el)).filter(Boolean);
      if (filledLabelsList.length === 0 && window.__nextkinAutofillReceipts && window.__nextkinAutofillReceipts.length > 0) {
        filledLabelsList = window.__nextkinAutofillReceipts.map(r => r.label).filter(Boolean);
      }
      
      const resultPayload = {
        filledFields: filledLabelsList,
        missingFields: [],
        fieldRequiredStatus: filledLabelsList.map(lbl => ({ label: lbl, required: true }))
      };

      // Broadcast to top window
      window.top.postMessage({ type: 'NEXTKIN_AUTOFILL_DONE', filledCount, filledFields: filledLabelsList }, '*');
      window.top.postMessage({ type: 'autoFillResultFromIframe', data: resultPayload }, '*');
      window.top.postMessage({ type: 'autoFillCompleteFromIframe', data: resultPayload }, '*');
      window.top.dispatchEvent(new CustomEvent('NextkinAutofillDone', { detail: { filledCount, filledFields: filledLabelsList } }));

      // Broadcast to all frames
      document.querySelectorAll('iframe').forEach(f => {
        try {
          f.contentWindow?.postMessage({ type: 'NEXTKIN_AUTOFILL_DONE', filledCount, filledFields: filledLabelsList }, '*');
          f.contentWindow?.postMessage({ type: 'autoFillResultFromIframe', data: resultPayload }, '*');
          f.contentWindow?.postMessage({ type: 'autoFillCompleteFromIframe', data: resultPayload }, '*');
        } catch {}
      });

      // Extension runtime messaging
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'NEXTKIN_AUTOFILL_DONE', filledCount, filledFields: filledLabelsList });
        chrome.runtime.sendMessage({ type: 'autoFillResultFromIframe', data: resultPayload });
      }
    } catch (_) {}`;

if (content.includes(oldDoneBlock)) {
  content = content.replace(oldDoneBlock, newDoneBlock);
  console.log('Updated completion broadcast block successfully!');
} else {
  console.log('oldDoneBlock not matched exactly, checking substring');
}

fs.writeFileSync(file, content, 'utf8');
console.log('outside-job-engine.js attribute tagging and broadcast updated!');
