const fs = require('fs');

// ========================================================
// 1. UPDATE outside-job-engine.js
// ========================================================
let engine = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

// A. Expose loadActiveCandidate globally
const loadActiveCandEndMarker = '// Real-time listener for candidate updates';
const loadActiveCandIdx = engine.indexOf(loadActiveCandEndMarker);
if (loadActiveCandIdx !== -1 && !engine.includes('root.loadActiveCandidate = loadActiveCandidate')) {
  const insertCode = `
  // Expose loadActiveCandidate globally for frames, adapters, and sidepanels
  root.loadActiveCandidate = loadActiveCandidate;
  if (typeof window !== 'undefined') window.loadActiveCandidate = loadActiveCandidate;
  if (typeof globalThis !== 'undefined') globalThis.loadActiveCandidate = loadActiveCandidate;

  `;
  engine = engine.slice(0, loadActiveCandIdx) + insertCode + engine.slice(loadActiveCandIdx);
  console.log('✓ 1. Exposed loadActiveCandidate globally');
} else {
  console.log('- 1. loadActiveCandidate global exposure already present or marker not found');
}

// B. Update getControlDescriptor to use el.ownerDocument and expand container matching
const descStartMarker = 'if (el.id) {\r\n      try {\r\n        const explicitLabel = document.querySelector';
const descStartMarkerLF = 'if (el.id) {\n      try {\n        const explicitLabel = document.querySelector';
const descEndMarker = '[class*="input-container"], [class*="question"]\');';

let dStart = engine.indexOf(descStartMarker);
if (dStart === -1) dStart = engine.indexOf(descStartMarkerLF);

if (dStart !== -1) {
  const dEnd = engine.indexOf(descEndMarker, dStart);
  if (dEnd !== -1) {
    const fullEnd = dEnd + descEndMarker.length;
    const replacement = `const doc = el.ownerDocument || document;
    if (el.id) {
      try {
        const explicitLabel = (rootNode.querySelector ? rootNode : doc).querySelector(\`label[for="\${CSS.escape(el.id)}"]\`);
        if (explicitLabel && explicitLabel.innerText) parts.push(explicitLabel.innerText);
      } catch {}
    }
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.innerText) parts.push(parentLabel.innerText);

    // 4. Surrounding Group Context (Fieldsets, tables, iCIMS, Workday, Ashby automation containers)
    const group = el.closest('fieldset, [data-automation-id="workExperience"], [data-automation-id="education"], tr, td, th, [role="group"], .application-question, [class*="application-question"], .form-group, .form-item, .field-wrapper, [class*="form-row" i], [class*="form-field" i], [class*="formField" i], [class*="input-container" i], [class*="question" i], [class*="iCIMS" i], [class*="ControlGroup" i], [class*="fieldContainer" i], [class*="field_container" i]');`;
    engine = engine.slice(0, dStart) + replacement + engine.slice(fullEnd);
    console.log('✓ 2. Enhanced getControlDescriptor with el.ownerDocument and iCIMS containers');
  } else {
    console.log('- 2. descEndMarker not found');
  }
} else {
  console.log('- 2. descStartMarker not found');
}

// C. Add iCIMS title extraction from URL and filter out "Your browser is unsupported"
if (!engine.includes("'your browser is unsupported'")) {
  const invMarker = "'prompt'";
  const invIdx = engine.indexOf(invMarker);
  if (invIdx !== -1) {
    engine = engine.slice(0, invIdx + invMarker.length) + ",\n    'your browser is unsupported', 'unsupported browser', 'candidate profile', 'create a login', 'enter your information', 'careers-ice'" + engine.slice(invIdx + invMarker.length);
    console.log('✓ 3. Filtered out "your browser is unsupported" from INVALID_JOB_TITLES');
  }
}

// Add URL-based title fallback in scrapeJobFromDOM
if (!engine.includes('urlJobMatch')) {
  const titleSelMarker = 'if (!title) {\r\n      const titleSelectors = [';
  const titleSelMarkerLF = 'if (!title) {\n      const titleSelectors = [';
  let tIdx = engine.indexOf(titleSelMarker);
  if (tIdx === -1) tIdx = engine.indexOf(titleSelMarkerLF);
  if (tIdx !== -1) {
    const urlTitleFallback = `// Extract job title from standard ATS URLs (e.g. /jobs/13120/full-stack-developer/...)
    if (!title && window.location.pathname.includes('/jobs/')) {
      const urlJobMatch = window.location.pathname.match(/\\/jobs\\/\\d+\\/([^/?#]+)/);
      if (urlJobMatch && urlJobMatch[1]) {
        const decoded = decodeURIComponent(urlJobMatch[1]).replace(/[-_]/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase()).trim();
        if (isValidJobTitle(decoded)) {
          title = decoded;
        }
      }
    }

    `;
    engine = engine.slice(0, tIdx) + urlTitleFallback + engine.slice(tIdx);
    console.log('✓ 4. Added ATS URL title extraction fallback');
  }
}

// D. Expand and strengthen Autofill matching rules in outside-job-engine.js
const rulesStartMarker = '// --- MATCHING RULES ---';
const rulesEndMarker = 'else if (el.type === \'email\'';
const rStart = engine.indexOf(rulesStartMarker);
if (rStart !== -1) {
  const rEnd = engine.indexOf(rulesEndMarker, rStart);
  if (rEnd !== -1) {
    const newRules = `// --- MATCHING RULES ---
      // 0. SALUTATION / HONORIFIC TITLE (e.g. Mr., Ms., Mrs., Dr. on iCIMS)
      if ((isSelect || isComboTrigger) && (/\\b(salutation|honorific|^title$)\\b/i.test(descriptor) || selectHtml.includes('mr.') || selectHtml.includes('ms.'))) {
        const candG = (candidate.gender || candidate.confirmed_facts?.gender || 'male').toLowerCase();
        targetVal = (candG.includes('female') || candG === 'woman') ? 'Ms.' : 'Mr.';
      }
      // A. MIDDLE NAME: Explicit check FIRST. Prevents full_name matching
      else if (autocomplete === 'additional-name' || /\\b(middle\\s*name|mname|middle\\s*initial)\\b/i.test(descriptor)) {
        targetVal = candidate.middle_name || (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '');
      }
      // B. FIRST NAME
      else if (autocomplete === 'given-name' || /\\b(first\\s*name|fname|given\\s*name|forename)\\b/i.test(descriptor)) {
        targetVal = firstName;
      }
      // C. LAST NAME
      else if (autocomplete === 'family-name' || /\\b(last\\s*name|lname|family\\s*name|surname)\\b/i.test(descriptor)) {
        targetVal = lastName;
      }
      // D. FULL NAME (Strictly excludes middle/first/last name fields and referral fields)
      else if ((autocomplete === 'name' || /\\b(full\\s*name|applicant\\s*name|candidate\\s*name|your\\s*name|^name$|\\bname\\b)\\b/i.test(descriptor) || el.name === '_systemfield_name' || el.placeholder?.toLowerCase() === 'full name') && !/\\b(middle|first|last|family|given|user|company|school|file|vendor|domain|referr|referred|referral|employee|colleague|friend|relative|manager|supervisor|emergency|reference)\\b/i.test(descriptor)) {
        targetVal = candidate.full_name || \`\${firstName} \${lastName}\`.trim();
      }
      // E1. PHONE TYPE DROPDOWN (Mobile / Cell on iCIMS and ATS phone tables)
      else if ((isSelect || isComboTrigger) && /\\b(phone.*type|type.*phone|phones?\\s*\\(?\\d*\\)?\\s*type|category)\\b/i.test(descriptor)) {
        targetVal = selectHtml.includes('mobile') ? 'Mobile' : (selectHtml.includes('cell') ? 'Cell' : 'Home');
      }
      // E2. CONTACT NUMBER / PHONE: Strict raw digits for portals with strict validators
      else if (el.type === 'tel' || autocomplete === 'tel' || /\\b(phone|mobile|tel|cell|phonenumber|phone\\s*number|phones?\\s*\\(?\\d*\\)?\\s*number|contact\\s*number|contact)\\b/i.test(descriptor)) {
        targetVal = standard10DigitPhone;
      }
      `;
    engine = engine.slice(0, rStart) + newRules + engine.slice(rEnd);
    console.log('✓ 5. Added Salutation and Phone Type dropdown matching rules');
  }
}

// E. Add Address 1 vs 2, Country, State, City, Zip, and Text Consent
const locStartMarker = '// O. LOCATION & DEMOGRAPHICS';
const locEndMarker = 'else if (/\\b(city|location|address|start\\s*typing)\\b/i.test(descriptor)) {';
const lStart = engine.indexOf(locStartMarker);
if (lStart !== -1) {
  const lEnd = engine.indexOf(locEndMarker, lStart);
  if (lEnd !== -1) {
    const endOfCityBlock = engine.indexOf('}', lEnd) + 1;
    const newLocRules = `// O. LOCATION & DEMOGRAPHICS
      // O1. TEXT MESSAGE / SMS CONSENT DROPDOWNS & COMBOBOXES
      else if (/\\b(text\\s*consent|sms|text\\s*message|receive\\s*text|text\\s*communication)\\b/i.test(descriptor)) {
        targetVal = (isSelect || isComboTrigger) ? 'Yes' : 'true';
      }
      // O2. E-SIGNATURE (Enter full name as signature)
      else if (/\\b(e-?signature|sign\\s*here|signature|certify\\s*by\\s*entering|by\\s*entering\\s*your\\s*name)\\b/i.test(descriptor)) {
        targetVal = \`\${firstName} \${lastName}\`.trim();
      }
      // O3. COUNTRY
      else if (/\\b(country|nation)\\b/i.test(descriptor)) {
        targetVal = candidate.country || 'United States';
      }
      // O4. STATE / PROVINCE
      else if (/\\b(state|province|region)\\b/i.test(descriptor)) {
        targetVal = candidate.current_state || candidate.state || 'California';
      }
      // O5. ZIP / POSTAL CODE
      else if (/\\b(zip|postal|zipcode|postal\\s*code)\\b/i.test(descriptor)) {
        targetVal = candidate.zip_code || candidate.addressInfo?.zipCode || '94105';
      }
      // O6. ADDRESS LINE 2 (Suite, Apt - blank if none)
      else if (/\\b(address\\s*2|address\\s*line\\s*2|apt|suite|unit)\\b/i.test(descriptor)) {
        targetVal = candidate.address_line_2 || '';
      }
      // O7. ADDRESS LINE 1 (Street Address)
      else if (/\\b(street\\s*address|address\\s*line\\s*1|address\\s*1|^address$|\\baddress\\b)\\b/i.test(descriptor) && !/\\b(email|web|ip)\\b/i.test(descriptor)) {
        targetVal = candidate.street_address || candidate.address || candidate.full_address || '100 Main St';
      }
      // O8. CITY
      else if (/\\b(city|town)\\b/i.test(descriptor)) {
        targetVal = candidate.current_city || candidate.city || 'San Francisco';
      }
      else if (/\\b(how\\s*did\\s*you\\s*hear|source|referral\\s*source)\\b/i.test(descriptor)) {
        targetVal = 'LinkedIn';
      } else if (/\\b(race|ethnicity)\\b/i.test(descriptor)) {
        targetVal = 'Decline to Self Identify';
      } else if (/\\b(veteran)\\b/i.test(descriptor)) {
        targetVal = 'I am not a protected veteran';
      } else if (/\\b(disability)\\b/i.test(descriptor)) {
        targetVal = 'I do not have a disability';
      } else if (/\\b(location|start\\s*typing)\\b/i.test(descriptor)) {
        targetVal = location;
      }`;
    engine = engine.slice(0, lStart) + newLocRules + engine.slice(endOfCityBlock);
    console.log('✓ 6. Added Text Consent, E-Signature, Address 1 & 2, City, State, Country matching rules');
  }
}

fs.writeFileSync('jobright_extension/outside-job-engine.js', engine, 'utf8');

// ========================================================
// 2. UPDATE helper-app.41ea2652.js
// ========================================================
let helper = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

const helperScrapeMarker = 'if (!foundTitle) {\r\n          var h1 = topDoc.querySelector("h1[data-cy=\'jobTitle\']';
const helperScrapeMarkerLF = 'if (!foundTitle) {\n          var h1 = topDoc.querySelector("h1[data-cy=\'jobTitle\']';
let hIdx = helper.indexOf(helperScrapeMarker);
if (hIdx === -1) hIdx = helper.indexOf(helperScrapeMarkerLF);

if (hIdx !== -1 && !helper.includes('browser is unsupported')) {
  const helperOldBlockEnd = 'if (!foundTitle && topDoc.title) {';
  const endIdx = helper.indexOf(helperOldBlockEnd, hIdx);
  if (endIdx !== -1) {
    const helperScrapeNew = `if (!foundTitle) {
          var h1 = topDoc.querySelector("h1[data-cy='jobTitle'], h1.job-title, [data-testid='job-title'], h1.app-title, .job-details h1, main h1, h1");
          if (h1) {
            var rawH1 = (h1.textContent || "").trim();
            if (!/browser\\s*is\\s*unsupported|candidate\\s*profile|create\\s*(a\\s*)?login/i.test(rawH1)) {
              foundTitle = rawH1;
            }
          }
        }
        if (!foundTitle && topDoc.location?.pathname?.includes('/jobs/')) {
          var urlM = topDoc.location.pathname.match(/\\/jobs\\/\\d+\\/([^/?#]+)/);
          if (urlM && urlM[1]) {
            foundTitle = decodeURIComponent(urlM[1]).replace(/[-_]/g, ' ').replace(/\\b\\w/g, function(c){ return c.toUpperCase(); }).trim();
          }
        }
        `;
    helper = helper.slice(0, hIdx) + helperScrapeNew + helper.slice(endIdx);
    console.log('✓ 7. Updated helper-app scrapePage to ignore unsupported browser and extract ATS URL job title');
  }
}

fs.writeFileSync('jobright_extension/helper-app.41ea2652.js', helper, 'utf8');

console.log('All updates completed successfully.');
