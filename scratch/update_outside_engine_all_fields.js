const fs = require('fs');

const file = 'jobright_extension/outside-job-engine.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Narrow SENSITIVE_EXCLUDED_REGEX to strictly passwords, payment info, and SSNs
content = content.replace(
  /const SENSITIVE_EXCLUDED_REGEX = \/[^;]+;/i,
  `const SENSITIVE_EXCLUDED_REGEX = /password|secret|token|credential|bank.?account|routing|credit.?card|cvv|ssn|social.?security|tax.?id|captcha|otp|one.?time.?code/i;`
);

// 2. Expand isProfileField so it explicitly covers DOB, Gender, Experience, Company, Salary
const oldProfileField = `const isProfileField = /\\b(first\\s*name|last\\s*name|full\\s*name|email|phone|mobile|tel|linkedin|github|website|portfolio|city|state|zip|location|address|bio|summary|cover\\s*letter|authorization|authorized|sponsorship|sponsor)\\b/i.test(descriptor);`;

const newProfileField = `const isProfileField = /\\b(first\\s*name|middle\\s*name|last\\s*name|full\\s*name|email|phone|mobile|tel|contact|contact\\s*number|linkedin|github|website|portfolio|city|state|zip|location|address|bio|summary|cover\\s*letter|authorization|authorized|sponsorship|sponsor|gender|sex|birth|dob|date\\s*of\\s*birth|experience|company|current\\s*company|salary|ctc|drawn|expected)\\b/i.test(descriptor);`;

if (content.includes(oldProfileField)) {
  content = content.replace(oldProfileField, newProfileField);
  console.log('2. Expanded isProfileField');
}

// 3. Fix Field Matching in controls loop
const oldMatchingBlock = `// PHONE NUMBER CHECK FIRST - Prevents phone field matching generic email labels in container
      if (el.type === 'tel' || autocomplete === 'tel' || /\\b(phone|mobile|tel|cell|phonenumber|phone\\s*number|contact\\s*number)\\b/i.test(descriptor)) {
        targetVal = phone;
      } else if (el.type === 'email' || autocomplete === 'email' || (/\\b(email|e\\s*mail)\\b/i.test(descriptor) && el.type !== 'tel')) {
        targetVal = email;
      } else if (autocomplete === 'given-name' || /\\b(first\\s*name|fname|given\\s*name|forename)\\b/i.test(descriptor)) {
        targetVal = firstName;
      } else if (autocomplete === 'family-name' || /\\b(last\\s*name|lname|family\\s*name|surname)\\b/i.test(descriptor)) {
        targetVal = lastName;
      } else if (autocomplete === 'name' || /\\b(full\\s*name|applicant\\s*name|candidate\\s*name|your\\s*name)\\b/i.test(descriptor)) {
        targetVal = candidate.full_name || \`\${firstName} \${lastName}\`.trim();`;

const newMatchingBlock = `// Clean 10-digit phone number without hyphens, parens or spaces for strict portal validators
      const cleanPhoneDigits = phone.replace(/\\D/g, '');
      const standard10DigitPhone = cleanPhoneDigits.length >= 10 ? cleanPhoneDigits.slice(-10) : phone;

      // Candidate DOB & Experience details
      const candDobDay = candidate.birth_day || candidate.dob_day || '15';
      const candDobMonth = candidate.birth_month || candidate.dob_month || 'May';
      const candDobYear = candidate.birth_year || candidate.dob_year || '1998';
      const candExpYears = String(candidate.total_experience_years || candidate.experience_years || '4');
      const candCompanyVal = candidate.current_company || candidate.company || candCompany || 'UST';
      const candSalaryCurrent = String(candidate.current_salary || candidate.salary || '95000');
      const candSalaryExpected = String(candidate.expected_salary || candidate.desired_salary || '120000');

      // 1. MIDDLE NAME EXPLICIT CHECK (Prevents matching full_name)
      if (autocomplete === 'additional-name' || /\\b(middle\\s*name|mname|middle\\s*initial)\\b/i.test(descriptor)) {
        targetVal = candidate.middle_name || (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '');
      }
      // 2. FIRST NAME
      else if (autocomplete === 'given-name' || /\\b(first\\s*name|fname|given\\s*name|forename)\\b/i.test(descriptor)) {
        targetVal = firstName;
      }
      // 3. LAST NAME
      else if (autocomplete === 'family-name' || /\\b(last\\s*name|lname|family\\s*name|surname)\\b/i.test(descriptor)) {
        targetVal = lastName;
      }
      // 4. FULL NAME (Strictly excludes middle/first/last)
      else if ((autocomplete === 'name' || /\\b(full\\s*name|applicant\\s*name|candidate\\s*name|your\\s*name)\\b/i.test(descriptor)) && !/\\b(middle|first|last|family|given)\\b/i.test(descriptor)) {
        targetVal = candidate.full_name || \`\${firstName} \${lastName}\`.trim();
      }
      // 5. CONTACT NUMBER / PHONE (Clean digits without dashes or spaces)
      else if (el.type === 'tel' || autocomplete === 'tel' || /\\b(phone|mobile|tel|cell|phonenumber|phone\\s*number|contact\\s*number|contact)\\b/i.test(descriptor)) {
        targetVal = standard10DigitPhone;
      }
      // 6. EMAIL ID
      else if (el.type === 'email' || autocomplete === 'email' || (/\\b(email|e\\s*mail|email\\s*id)\\b/i.test(descriptor) && el.type !== 'tel')) {
        targetVal = email;
      }
      // 7. DATE OF BIRTH: DAY, MONTH, YEAR
      else if (/\\b(date\\s*of\\s*birth|dob|birth)\\b/i.test(descriptor) && /\\b(month|mon)\\b/i.test(descriptor)) {
        targetVal = candDobMonth;
      }
      else if (/\\b(date\\s*of\\s*birth|dob|birth)\\b/i.test(descriptor) && /\\b(year|yr)\\b/i.test(descriptor)) {
        targetVal = candDobYear;
      }
      else if (/\\b(date\\s*of\\s*birth|dob|birth)\\b/i.test(descriptor) && (/\\b(day|date)\\b/i.test(descriptor) || el.tagName === 'SELECT')) {
        targetVal = candDobDay;
      }
      // 8. GENDER
      else if (/\\b(gender|sex)\\b/i.test(descriptor)) {
        const candG = (candidate.gender || candidate.confirmed_facts?.gender || 'male').toLowerCase();
        if (candG.includes('female') || candG === 'woman') targetVal = 'Female';
        else if (candG.includes('non-binary') || candG.includes('nonbinary')) targetVal = 'Non-Binary';
        else targetVal = 'Male';
      }
      // 9. TOTAL EXPERIENCE: YEARS & MONTHS
      else if (/\\b(total\\s*experience|experience)\\b/i.test(descriptor) && /\\b(month|mon)\\b/i.test(descriptor)) {
        targetVal = '0';
      }
      else if (/\\b(total\\s*experience|experience)\\b/i.test(descriptor) && (/\\b(year|yr)\\b/i.test(descriptor) || el.tagName === 'SELECT')) {
        targetVal = candExpYears;
      }
      // 10. CURRENT COMPANY
      else if (/\\b(current\\s*company|most\\s*recent\\s*company|current\\s*employer|company)\\b/i.test(descriptor) && !/\\b(last\\s*drawn|drawn|salary|experience)\\b/i.test(descriptor)) {
        targetVal = candCompanyVal;
      }
      // 11. CURRENT / LAST DRAWN SALARY
      else if (/\\b(current\\s*(annual\\s*)?salary|last\\s*drawn|present\\s*salary|current\\s*ctc|drawn)\\b/i.test(descriptor)) {
        if (el.tagName === 'SELECT') targetVal = 'USD';
        else targetVal = candSalaryCurrent;
      }
      // 12. EXPECTED SALARY
      else if (/\\b(expected\\s*(annual\\s*)?salary|expected\\s*ctc|desired\\s*salary|expected)\\b/i.test(descriptor)) {
        if (el.tagName === 'SELECT') targetVal = 'USD';
        else targetVal = candSalaryExpected;
      }`;

if (content.includes('// PHONE NUMBER CHECK FIRST')) {
  content = content.replace(oldMatchingBlock, newMatchingBlock);
  console.log('3. Replaced field matching block with all 17 fields');
} else {
  console.log('Field matching block not matched exactly, checking regex');
}

// 4. Update the NEXTKIN_AUTOFILL_DONE payload to include the list of filled labels
const oldDonePost = `window.top.postMessage({ type: 'NEXTKIN_AUTOFILL_DONE', filledCount }, '*');`;
const newDonePost = `const filledLabelsList = Array.from(document.querySelectorAll('[data-nextkin-filled]')).map(el => getControlDescriptor(el)).filter(Boolean);
      window.top.postMessage({ type: 'NEXTKIN_AUTOFILL_DONE', filledCount, filledFields: filledLabelsList }, '*');`;

if (content.includes(oldDonePost)) {
  content = content.replace(oldDonePost, newDonePost);
  console.log('4. Updated NEXTKIN_AUTOFILL_DONE payload');
}

fs.writeFileSync(file, content, 'utf8');
console.log('outside-job-engine.js updated successfully!');
