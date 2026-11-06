const fs = require('fs');

const file = 'jobright_extension/outside-job-engine.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Locate the exact block starting from `// PHONE NUMBER CHECK FIRST`
const startMarker = `      // PHONE NUMBER CHECK FIRST - Prevents phone field matching generic email labels in container`;
const endMarker = `      if (targetVal || isAiField) {`;

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker, startIdx);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found! start:', startIdx, 'end:', endIdx);
  process.exit(1);
}

const robustMatchingLogic = `      // 1. CLEAN PHONE NUMBER: 10 raw digits without spaces, hyphens, or parentheses
      const cleanPhoneDigits = (phone || '').replace(/\\D/g, '');
      const standard10DigitPhone = cleanPhoneDigits.length >= 10 ? cleanPhoneDigits.slice(-10) : phone;

      // 2. CANDIDATE PROFILE FACTS & DETAILS
      const candDobDay = candidate.birth_day || candidate.dob_day || (candidate.birthDate ? String(new Date(candidate.birthDate).getDate()) : '15');
      const candDobMonth = candidate.birth_month || candidate.dob_month || 'May';
      const candDobYear = candidate.birth_year || candidate.dob_year || '1998';
      const candExpYears = String(candidate.total_experience_years || candidate.experience_years || '4');
      const candExpMonths = String(candidate.total_experience_months || candidate.experience_months || '0');
      const candCompanyVal = candidate.current_company || candidate.company || candCompany || 'UST';
      const candSalaryCurrent = String(candidate.current_salary || candidate.salary || '95000');
      const candSalaryExpected = String(candidate.expected_salary || candidate.desired_salary || '120000');

      // Helper for select elements
      const isSelect = el.tagName === 'SELECT';
      const selectHtml = isSelect ? el.innerHTML.toLowerCase() : '';

      // --- MATCHING RULES ---
      // A. MIDDLE NAME: Explicit check FIRST. Prevents full_name matching
      if (autocomplete === 'additional-name' || /\\b(middle\\s*name|mname|middle\\s*initial)\\b/i.test(descriptor)) {
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
      // D. FULL NAME (Strictly excludes middle/first/last name fields)
      else if ((autocomplete === 'name' || /\\b(full\\s*name|applicant\\s*name|candidate\\s*name|your\\s*name)\\b/i.test(descriptor) || descriptor === 'name' || el.name === '_systemfield_name' || el.placeholder?.toLowerCase() === 'full name') && !/\\b(middle|first|last|family|given)\\b/i.test(descriptor)) {
        targetVal = candidate.full_name || \`\${firstName} \${lastName}\`.trim();
      }
      // E. CONTACT NUMBER / PHONE: Strict raw digits for portals with strict validators
      else if (el.type === 'tel' || autocomplete === 'tel' || /\\b(phone|mobile|tel|cell|phonenumber|phone\\s*number|contact\\s*number|contact)\\b/i.test(descriptor)) {
        targetVal = standard10DigitPhone;
      }
      // F. EMAIL ID
      else if (el.type === 'email' || autocomplete === 'email' || (/\\b(email|e\\s*mail|email\\s*id)\\b/i.test(descriptor) && el.type !== 'tel')) {
        targetVal = email;
      }
      // G. DATE OF BIRTH: DAY, MONTH, YEAR
      else if (/\\b(date\\s*of\\s*birth|dob|birth)\\b/i.test(descriptor) || selectHtml.includes('select year') || selectHtml.includes('select month')) {
        if (/\\b(month|mon)\\b/i.test(descriptor) || selectHtml.includes('jan') || selectHtml.includes('feb') || selectHtml.includes('month')) {
          targetVal = candDobMonth;
        } else if (/\\b(year|yr)\\b/i.test(descriptor) || selectHtml.includes('199') || selectHtml.includes('200') || selectHtml.includes('year')) {
          targetVal = candDobYear;
        } else {
          targetVal = candDobDay;
        }
      }
      // H. GENDER
      else if (/\\b(gender|sex)\\b/i.test(descriptor) || selectHtml.includes('male') || selectHtml.includes('female')) {
        const candG = (candidate.gender || candidate.confirmed_facts?.gender || 'male').toLowerCase();
        if (candG.includes('female') || candG === 'woman') targetVal = 'Female';
        else if (candG.includes('non-binary') || candG.includes('nonbinary')) targetVal = 'Non-Binary';
        else targetVal = 'Male';
      }
      // I. TOTAL EXPERIENCE: YEARS & MONTHS
      else if (/\\b(total\\s*experience|experience)\\b/i.test(descriptor)) {
        if (/\\b(month|mon)\\b/i.test(descriptor) || (isSelect && el.options && el.options.length <= 13 && selectHtml.includes('month'))) {
          targetVal = candExpMonths;
        } else {
          targetVal = candExpYears;
        }
      }
      // J. CURRENT / RECENT COMPANY
      else if (/\\b(current\\s*company|most\\s*recent\\s*company|employer|current\\s*employer|company)\\b/i.test(descriptor) && !/\\b(salary|drawn|expected|experience)\\b/i.test(descriptor)) {
        targetVal = candCompanyVal;
      }
      // K. CURRENT / LAST DRAWN SALARY
      else if (/\\b(current\\s*(annual\\s*)?salary|last\\s*drawn|present\\s*salary|current\\s*ctc|drawn)\\b/i.test(descriptor)) {
        targetVal = isSelect ? 'USD' : candSalaryCurrent;
      }
      // L. EXPECTED ANNUAL SALARY
      else if (/\\b(expected\\s*(annual\\s*)?salary|expected\\s*ctc|desired\\s*salary|desired\\s*pay|compensation|expected)\\b/i.test(descriptor)) {
        targetVal = isSelect ? 'USD' : candSalaryExpected;
      }
      // M. SOCIAL & WEB PROFILES
      else if (/linkedin/i.test(descriptor)) {
        targetVal = linkedin;
      } else if (/github/i.test(descriptor)) {
        targetVal = candidate.github_url || '';
      } else if (/portfolio|website|personal\\s*site/i.test(descriptor)) {
        targetVal = candidate.website || candidate.portfolio_url || '';
      }
      // N. EDUCATION
      else if (/\\b(school|university|college|institution|attended)\\b/i.test(descriptor)) {
        targetVal = candSchool;
      } else if (/\\b(degree|qualification|education\\s*level)\\b/i.test(descriptor)) {
        targetVal = candDegree;
      } else if (/\\b(discipline|major|field\\s*of\\s*study|study)\\b/i.test(descriptor)) {
        targetVal = candMajor;
      } else if (/\\b(current\\s*title|current\\s*role|most\\s*recent\\s*title|job\\s*title)\\b/i.test(descriptor)) {
        targetVal = candRole;
      }
      // O. LOCATION & DEMOGRAPHICS
      else if (/\\b(country)\\b/i.test(descriptor)) {
        targetVal = 'United States';
      } else if (/\\b(state|province|region)\\b/i.test(descriptor)) {
        targetVal = candidate.current_state || 'California';
      } else if (/\\b(zip|postal|zipcode|postal\\s*code)\\b/i.test(descriptor)) {
        targetVal = candidate.zip_code || candidate.addressInfo?.zipCode || '94105';
      } else if (/\\b(how\\s*did\\s*you\\s*hear|source|referral\\s*source)\\b/i.test(descriptor)) {
        targetVal = 'LinkedIn';
      } else if (/\\b(race|ethnicity)\\b/i.test(descriptor)) {
        targetVal = 'Decline to Self Identify';
      } else if (/\\b(veteran)\\b/i.test(descriptor)) {
        targetVal = 'I am not a protected veteran';
      } else if (/\\b(disability)\\b/i.test(descriptor)) {
        targetVal = 'I do not have a disability';
      } else if (/\\b(city|location|address|start\\s*typing)\\b/i.test(descriptor)) {
        targetVal = location;
      }
      // P. WORK AUTHORIZATION
      else if (/\\b(authorized|eligible|legally\\s*authorized|right\\s*to\\s*work)\\b/i.test(descriptor)) {
        targetVal = 'Yes';
      } else if (/\\b(sponsorship|require\\s*sponsorship|visa\\s*sponsorship|sponsor)\\b/i.test(descriptor)) {
        targetVal = 'No';
      } else if (/\\b(notice|start\\s*date|availability|available)\\b/i.test(descriptor)) {
        targetVal = candidate.notice_period || candidate.availability || '';
      }
      // Q. BIO & SCREENING QUESTIONS (AI-POWERED)
      else if (/\\b(bio|about\\s*(me|you|yourself)?|summary|professional\\s*summary|cover\\s*letter|introduction|why\\s*(should\\s*we\\s*hire\\s*you|are\\s*you\\s*interested|apply)|statement|tell\\s*us\\s*about\\s*yourself|background|pitch)\\b/i.test(descriptor) || el.tagName === 'TEXTAREA') {
        targetVal = defaultBio;
        isAiField = true;
      }
\n`;

content = content.slice(0, startIdx) + robustMatchingLogic + content.slice(endIdx);
fs.writeFileSync(file, content, 'utf8');
console.log('Successfully replaced matching logic with full 17-field coverage!');
