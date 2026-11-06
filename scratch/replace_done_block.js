const fs = require('fs');

const file = 'jobright_extension/outside-job-engine.js';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `    try {
      const filledLabelsList = Array.from(document.querySelectorAll('[data-nextkin-filled]')).map(el => getControlDescriptor(el)).filter(Boolean);
      window.top.postMessage({ type: 'NEXTKIN_AUTOFILL_DONE', filledCount, filledFields: filledLabelsList }, '*');
      window.top.dispatchEvent(new CustomEvent('NextkinAutofillDone', { detail: { filledCount } }));
    } catch (_) {}`;

const replacement = `    try {
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

const idx = content.indexOf('const filledLabelsList = Array.from(document.querySelectorAll');
if (idx !== -1) {
  const tryStart = content.lastIndexOf('try {', idx);
  const catchEnd = content.indexOf('} catch (_) {}', idx) + '} catch (_) {}'.length;
  content = content.slice(0, tryStart) + replacement.trim() + content.slice(catchEnd);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully replaced done block!');
} else {
  console.error('Could not find done block prefix');
}
