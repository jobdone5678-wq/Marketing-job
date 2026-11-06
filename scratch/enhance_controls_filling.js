const fs = require('fs');

const file = 'jobright_extension/outside-job-engine.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Update collectControls to include [role="checkbox"]
content = content.replace(
  `let list = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([type="password"]), textarea, select, [role="combobox"]'));`,
  `let list = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([type="password"]), textarea, select, [role="combobox"], [role="checkbox"]'));`
);

// 2. Add visual highlight and role="checkbox" handling in checkboxes block
const oldCheckboxBlock = `if (shouldCheck && !el.checked) {
          const prevVal = el.checked;
          clickLabelOrInput(el);
          if (setNativeChecked(el, true) || el.checked) {
            window.__nextkinAutofillReceipts.push({
              element: el,
              descriptor: descriptor,
              value: 'checked'
            });
            filledCount++;
          }
        }`;

const newCheckboxBlock = `if (shouldCheck) {
          highlightFieldBeingFilled(el);
          if (el.getAttribute && el.getAttribute('role') === 'checkbox') {
            if (setNativeRoleCheckbox(el, true)) {
              filledCount++;
              el.setAttribute('data-nextkin-filled', 'true');
            }
          } else if (!el.checked) {
            if (setNativeChecked(el, true)) {
              window.__nextkinAutofillReceipts.push({
                element: el,
                descriptor: descriptor,
                value: 'checked'
              });
              filledCount++;
              el.setAttribute('data-nextkin-filled', 'true');
            }
          }
        }`;

if (content.includes('if (shouldCheck && !el.checked) {')) {
  content = content.replace(oldCheckboxBlock, newCheckboxBlock);
  console.log('1. Updated checkbox block with highlight and role=checkbox');
} else {
  console.log('Old checkbox block not matched exactly, checking regex');
  content = content.replace(
    /if\s*\(shouldCheck\s*&&\s*!el\.checked\)[\s\S]*?filledCount\+\+;\s*\}\s*\}/,
    newCheckboxBlock
  );
  console.log('1. Updated checkbox block via regex');
}

// 3. Add field highlight to setNativeValue calls
content = content.replace(
  `if (setNativeValue(el, targetVal)) {`,
  `highlightFieldBeingFilled(el); el.setAttribute('data-nextkin-filled', 'true'); updateAutofillProgressOverlay('Filling ' + (descriptor || 'field'), filledCount + 1, controls.length); if (setNativeValue(el, targetVal)) {`
);

// 4. Clean up progress overlay at end of executeOutsideAutofill
const oldDoneBlock = `if (filledCount > 0) {
      showInPageToast(\`✅ Autofilled \${filledCount} field\${filledCount === 1 ? '' : 's'} with \${candidate.full_name || 'candidate profile'}!\`, 4500);
    } else {
      showInPageToast('ℹ️ Autofill completed. All detectable fields already have values.', 3500);
    }`;

const newDoneBlock = `setTimeout(removeAutofillProgressOverlay, 1200);
    if (filledCount > 0) {
      showInPageToast(\`✅ Autofilled \${filledCount} field\${filledCount === 1 ? '' : 's'} with \${candidate.full_name || 'candidate profile'}!\`, 4500);
    } else {
      showInPageToast('ℹ️ Autofill completed. All detectable fields already have values.', 3500);
    }`;

content = content.replace(oldDoneBlock, newDoneBlock);

fs.writeFileSync(file, content, 'utf8');
console.log('Enhanced controls filling in outside-job-engine.js successfully!');
