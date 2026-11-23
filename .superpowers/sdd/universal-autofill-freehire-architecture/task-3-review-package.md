# Review Package: Task 3

## Commits
135d137 feat(mapping): add anchored prefix matching and universal generic adapter

## Stat
 jobright_extension/adapters/ats-adapters.js |   7 ++
 jobright_extension/core/field-mapping.js    | 100 +++++++++++++++----
 tests/anchored-field-mapping.test.mjs       | 144 ++++++++++++++++++++++++++++
 3 files changed, 233 insertions(+), 18 deletions(-)

## Diff
`diff
diff --git a/jobright_extension/adapters/ats-adapters.js b/jobright_extension/adapters/ats-adapters.js
index 66c2d5f..d138e1d 100644
--- a/jobright_extension/adapters/ats-adapters.js
+++ b/jobright_extension/adapters/ats-adapters.js
@@ -77,20 +77,27 @@
       if (re.test(desc)) return key;
     }
     return '';
   }
 
   root.canonicalHint = canonicalHint;
 
   const hostIs = re => host => re.test(String(host || '').toLowerCase());
 
   const adapters = [
+    // 0. Generic Universal ATS Fallback
+    {
+      id: 'generic',
+      name: 'Universal ATS Generic Adapter',
+      matches: () => true,
+      hint: el => canonicalHint(el)
+    },
     // 1. Ashby
     {
       id: 'ashby',
       name: 'Ashby',
       matches: hostIs(/(^|\.)ashbyhq\.com$/i),
       hint: el => {
         const name = el.getAttribute('name') || '';
         if (name === '_systemfield_name') return 'full_name';
         if (name === '_systemfield_email') return 'email';
         if (name === '_systemfield_location') return 'current_location';
diff --git a/jobright_extension/core/field-mapping.js b/jobright_extension/core/field-mapping.js
index db1e100..9a7ebb8 100644
--- a/jobright_extension/core/field-mapping.js
+++ b/jobright_extension/core/field-mapping.js
@@ -28,20 +28,39 @@
 
   // Consequential or voluntary disclosure fields that should be flagged for candidate review
   const CONSEQUENTIAL_FACTS = new Set([
     'authorized_in_usa', 'needs_sponsorship', 'visa_status', 'work_authorization', 'date_of_birth', 'citizenship_status',
     'gender', 'race', 'race_ethnicity', 'veteran', 'veteran_status', 'disability', 'disability_status'
   ]);
 
   // Adapters spell a fact as "current_state" or "current state"; normalise before lookup.
   const CANONICAL_BY_NORM = new Map([...CANONICAL_FACTS].map(k => [norm(k), k]));
 
+  // Anchored prefix matching: synonym must open the label at a word/token boundary.
+  function opensWith(label, synonym) {
+    if (typeof label !== 'string' || typeof synonym !== 'string') return false;
+    const l = norm(label);
+    const s = norm(synonym);
+    if (!s) return false;
+    if (!l.startsWith(s)) return false;
+    return !/[a-z0-9]/i.test(l.charAt(s.length));
+  }
+
+  const NON_BOOLEAN_FACTS = new Set([
+    'country', 'first_name', 'preferred_first_name', 'last_name', 'full_name', 'email', 'phone',
+    'current_city', 'current_state', 'current_location', 'current_employer',
+    'current_title', 'headline', 'zip_code', 'full_address', 'salary_expectation',
+    'summary', 'bio', 'website', 'linkedin_url', 'github_url', 'total_experience_years',
+    'primary_skills', 'school', 'graduation_year', 'end_client', 'point_of_contact', 'pay_rate',
+    'vendor_email', 'personal_email', 'contract_type', 'current_salary'
+  ]);
+
   // Field labels seen across job boards, ATS platforms and bespoke career sites.
   const aliases = {
     first_name: ['first name', 'given name', 'forename', 'fname', 'first and middle name', 'first/given name', 'middle and first name'],
     preferred_first_name: ['preferred name', 'preferred first name', 'preferred given name', 'nickname', 'chosen name', 'preferred'],
     last_name: ['last name', 'family name', 'surname', 'lname', 'last/family name'],
     full_name: ['full name', 'applicant name', 'candidate name', 'your name', 'legal name', 'full legal name', 'applicant full name', 'name of applicant', 'your full name', 'preferred full name'],
     e_signature: ['e signature', 'signature', 'sign here', 'certify by entering your name', 'by entering your name into the field below', 'typed signature', 'electronic signature'],
     email: ['email', 'email address', 'e mail', 'email id', 'work email', 'personal email', 'contact email', 'business email', 'primary email'],
     phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'tel', 'cell phone', 'contact number', 'contact phone', 'telephone', 'telephone number', 'best phone number', 'primary phone', 'work phone', 'mobile number', 'phone or cell'],
     current_city: ['city', 'current city', 'town', 'municipality', 'present city', 'where do you live', 'city of residence', 'address level2', 'which city do you live in', 'city you currently reside in'],
@@ -64,39 +83,51 @@
     date_of_birth: ['date of birth', 'birth date', 'birthdate', 'date of birth dob', 'dob', 'date of birth mm dd yyyy'],
     citizenship_status: ['citizenship status', 'country of citizenship', 'nationality', 'are you a us citizen', 'are you a u s citizen', 'are you a united states citizen'],
     linkedin_url: ['linkedin', 'linkedin profile', 'linkedin url', 'urls linkedin', 'linkedin profile url', 'linked in'],
     github_url: ['github', 'github url', 'github profile', 'urls github', 'github com'],
     website: ['website', 'portfolio', 'personal website', 'portfolio url', 'urls portfolio', 'personal url', 'homepage', 'home page', 'personal site', 'blog url'],
     current_employer: ['current employer', 'current company', 'most recent company', 'employer', 'company', 'org', 'current organization', 'organization', 'company name', 'present employer', 'most recent employer', 'last employer', 'current organisation'],
     current_title: ['current title', 'current job title', 'most recent title', 'headline', 'current role', 'job title', 'present title', 'current position', 'designation', 'most recent job title'],
     total_experience_years: ['years of experience', 'total experience', 'experience years', 'how many years of experience', 'total years of experience', 'years of professional experience', 'years of work experience', 'relevant experience', 'total work experience', 'overall experience'],
     primary_skills: ['skills', 'primary skills', 'technical skills', 'key skills', 'ideal tech stack', 'tech stack', 'languages frameworks', 'strongest in', 'languages and frameworks', 'programming languages', 'skills and abilities', 'core competencies', 'technologies', 'expertise', 'programming languages and frameworks', 'skills list', 'your skills'],
     authorized_in_usa: [
+      'are you legally authorized to work in this country',
+      'are you authorized to work in this country',
+      'authorized to work in this country',
+      'legally authorized to work in this country',
       'are you legally authorized to work in the country for which you are applying',
       'are you legally authorized to work in the united states',
       'legally authorized to work in the country for which you are applying',
       'legally authorized to work in the united states',
       'authorized to work in the country for which you are applying',
       'authorized to work in the united states',
       'are you legally authorized to work',
       'are you authorized to work',
       'authorized to work',
       'legally authorized',
       'authorized to work in the us',
       'are you authorized to work in the country where the job is located',
       'authorized to work in the country where the job is located',
       'do you have the legal right to work in the united states',
       'are you legally permitted to work in the united states',
       'right to work',
       'work authorization'
     ],
     needs_sponsorship: [
+      'will your employer need to sponsor your visa status',
+      'will your employer need to sponsor your visa',
+      'will your employer need to sponsor',
+      'will your employer require sponsorship',
+      'will an employer need to sponsor',
+      'will you or your employer require sponsorship',
+      'will you or your employer need sponsorship',
+      'employer sponsorship',
       'will you now or in the future require sponsorship for employment visa status',
       'will you now or in the future require sponsorship',
       'do you now or in the future require sponsorship for employment visa status',
       'will you require visa sponsorship',
       'will you require visa sponsorship now or in the future',
       'do you require visa sponsorship',
       'do you require visa sponsorship now or in the future',
       'require visa sponsorship now or in the future',
       'require sponsorship for employment visa status',
       'do you require sponsorship for employment visa status',
@@ -421,27 +452,27 @@
       } else {
         const parts = fullName.replace(/\.[^.]+$/, '').split(/[_\s]+/).filter(Boolean);
         if (parts.length >= 2) {
           fullName = parts.slice(0, 2).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
         }
       }
     }
     const names = fullName.split(/\s+/);
 
     // An explicit null means "not known"; an absent value keeps the portal default.
-    const rawAuth = facts.authorized_in_usa !== undefined ? facts.authorized_in_usa : candidate.authorized_in_usa;
+    const rawAuth = facts.authorized_in_usa !== undefined ? facts.authorized_in_usa : (candidate.authorized_in_usa !== undefined ? candidate.authorized_in_usa : candFacts.authorized_in_usa);
     const authKnown = normalizeBoolean(rawAuth);
-    const sponsorPrimary = facts.need_sponsorship_now !== undefined ? facts.need_sponsorship_now : candidate.need_sponsorship_now;
-    const sponsorFuture = facts.need_sponsorship_future !== undefined ? facts.need_sponsorship_future : candidate.need_sponsorship_future;
+    const sponsorPrimary = facts.need_sponsorship_now !== undefined ? facts.need_sponsorship_now : (candidate.need_sponsorship_now !== undefined ? candidate.need_sponsorship_now : candFacts.need_sponsorship_now);
+    const sponsorFuture = facts.need_sponsorship_future !== undefined ? facts.need_sponsorship_future : (candidate.need_sponsorship_future !== undefined ? candidate.need_sponsorship_future : candFacts.need_sponsorship_future);
     const nowSponsor = normalizeBoolean(sponsorPrimary);
     const futureSponsor = normalizeBoolean(sponsorFuture);
-    const directSponsor = normalizeBoolean(facts.needs_sponsorship ?? candidate.needs_sponsorship);
+    const directSponsor = normalizeBoolean(facts.needs_sponsorship ?? candidate.needs_sponsorship ?? candFacts.needs_sponsorship);
     const sponsorKnown = nowSponsor === true || futureSponsor === true ? true
       : nowSponsor === false && futureSponsor === false ? false : directSponsor;
     const skills = facts.primary_skills || candidate.primary_skills || (Array.isArray(candidate.skills) ? candidate.skills.join(', ') : candidate.skills || '');
 
     const rawPhone = String(facts.phone || candidate.phone || candFacts.phone || candFacts.phone_number || candidate.phone_number || '').trim();
     const phoneDigits = rawPhone.replace(/\D/g, '');
     const phone = rawPhone.startsWith('+') && !rawPhone.startsWith('+1') ? rawPhone
       : /^1\d{10}$/.test(phoneDigits) ? phoneDigits.slice(1)
       : phoneDigits.length === 10 ? phoneDigits : rawPhone;
 
@@ -548,47 +579,77 @@
     };
   }
 
   // United States work authorization only answers a question about the United States.
   const US_QUESTION = /\b(?:united states|usa|(?:in (?:the )?)us|u s(?: a)?)\b/i;
   function isUSQuestion(text) {
     return US_QUESTION.test(norm(text));
   }
 
   // Which profile fact a control is asking for, and how sure we are.
-  function resolveFact(label, hint) {
-    const nh = norm(hint);
+  function resolveFact(label, hint, context) {
+    const field = (typeof label === 'object' && label !== null) ? label : (typeof context === 'object' && context !== null ? context : null);
+    const rawLabel = (typeof label === 'string' ? label : field?.label) || '';
+    const rawHint = (typeof hint === 'string' ? hint : field?.hint) || '';
+    const kind = field?.kind || '';
+    const options = field?.options || [];
+
+    const nl = norm(rawLabel);
+    const cleanLabel = nl.replace(/^(?:(?:please|your|provide|enter|share|paste|input|select|choose)\s+)+/, '');
+    let nh = norm(rawHint);
+    const cleanHint = nh.replace(/^(?:(?:please|your|provide|enter|share|paste|input|select|choose)\s+)+/, '');
+
+    const hasBooleanOptions = Boolean(
+      (options && options.length > 0 && pickBooleanOption(options, true) && pickBooleanOption(options, false)) ||
+      (kind === 'checkbox')
+    );
+
+    const isAuthLabel = aliases.authorized_in_usa.some(a => opensWith(cleanLabel, a) || opensWith(nl, a));
+    const isSponsorLabel = aliases.needs_sponsorship.some(a => opensWith(cleanLabel, a) || opensWith(nl, a)) ||
+      (/\b(?:sponsor|sponsorship)\b/i.test(nl) && /\b(?:visa|work|employment|require|need)\b/i.test(nl));
+
+    // Tier 1 adapter hint sanitization through Tier 2 safety rules
+    if (nh) {
+      if (hasBooleanOptions && NON_BOOLEAN_FACTS.has(nh)) {
+        nh = '';
+      } else if (isAuthLabel && nh !== 'authorized_in_usa' && nh !== 'work_authorization' && nh !== 'visa_status') {
+        nh = '';
+      } else if (isSponsorLabel && nh !== 'needs_sponsorship' && nh !== 'visa_status') {
+        nh = '';
+      }
+    }
+
     if (nh) {
       const canonical = CANONICAL_BY_NORM.get(nh);
       if (canonical) return { key: canonical, exact: true, length: nh.length };
     }
 
-    if (isDOBQuestion(label, hint)) return { key: 'date_of_birth', exact: true, length: 13 };
-    if (/\b(?:citizen|citizenship|nationality)\b/i.test(label) && !/\bsponsor/i.test(label)) {
+    if (isDOBQuestion(rawLabel, rawHint, field?.element)) return { key: 'date_of_birth', exact: true, length: 13 };
+    if (/\b(?:citizen|citizenship|nationality)\b/i.test(rawLabel) && !/\bsponsor/i.test(rawLabel)) {
       return { key: 'citizenship_status', exact: true, length: 11 };
     }
 
-    const nl = norm(label);
     if (nl === 'name') return { key: 'full_name', exact: true, length: 4 };
     if (/\bcountry code\b/i.test(nl) && /\b(?:number|phone|mobile|tel)\b/i.test(nl)) {
       return { key: 'phone', exact: true, length: nl.length };
     }
 
     const matches = [];
     for (const key of Object.keys(aliases)) {
+      if (hasBooleanOptions && NON_BOOLEAN_FACTS.has(key)) continue;
       for (const a of aliases[key]) {
         const na = norm(a);
-        if (nl === na || (nh && nh === na)) matches.push({ key, exact: true, length: na.length });
-        else if (na.length <= 4) {
-          const re = new RegExp('\\b' + na.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
-          if (re.test(nl) || (nh && re.test(nh))) matches.push({ key, exact: false, length: na.length });
-        } else if (nl.includes(na) || (nh && nh.includes(na))) {
+        if (nl === na || (nh && nh === na)) {
+          matches.push({ key, exact: true, length: na.length });
+        } else if (opensWith(nl, na) || (cleanLabel && opensWith(cleanLabel, na))) {
+          matches.push({ key, exact: true, length: na.length });
+        } else if (nh && (opensWith(nh, na) || (cleanHint && opensWith(cleanHint, na)))) {
           matches.push({ key, exact: false, length: na.length });
         }
       }
     }
 
     const exactMatches = matches.filter(m => m.exact);
     const candidatesList = (exactMatches.length ? exactMatches : matches).sort((a, b) => b.length - a.length);
     let uniqueKeys = [...new Set(candidatesList.map(m => m.key))];
     if (uniqueKeys.includes('veteran') && uniqueKeys.includes('veteran_status')) uniqueKeys = uniqueKeys.filter(k => k !== 'veteran_status');
     if (uniqueKeys.includes('disability') && uniqueKeys.includes('disability_status')) uniqueKeys = uniqueKeys.filter(k => k !== 'disability_status');
@@ -720,32 +781,32 @@
           consequential: true, exactMatch: true, reason: 'Candidate-provided date of birth.' };
       }
       // A generic date input is not necessarily an availability question.
       if (field.kind === 'text' && /\b(start date|availability date|when can you start|earliest start date|available to start)\b/i.test(nl + ' ' + nh)) {
         const avail = values.availability || candidate.availability || candidate.available_to_join;
         if (avail) {
           return { field, factKey: 'availability', value: String(avail), status: 'supported', reason: 'Candidate availability.' };
         }
         return { field, factKey: 'availability', status: 'unknown', reason: 'Candidate availability not provided.' };
       }
-      if (field.kind === 'text' && isDateInput(field.element) && !resolveFact(field.label, field.hint)) {
+      if (field.kind === 'text' && isDateInput(field.element) && !resolveFact(field.label, field.hint, field)) {
         return { field, status: 'needs_review', reason: 'Unrecognized date field; do not substitute availability.' };
       }
       // Legal acknowledgements and signatures:
       if (field.kind === 'checkbox' && /\b(agree|consent|terms|privacy|arbitration|acknowledg\w*|certify|declare|confirm|read the above|understand)\b/i.test(nl)) {
         return { field, factKey: 'consent', status: 'manual', reason: 'Candidate consent is required.' };
       }
       if (/\b(signature|sign here|certify by entering your name)\b/i.test(nl)) {
         return { field, factKey: 'e_signature', status: 'manual', reason: 'Candidate signature is required.' };
       }
 
-      const resolved = resolveFact(field.label, field.hint);
+      const resolved = resolveFact(field.label, field.hint, field);
       if (!resolved) {
         if (isChoiceKind(field.kind)) return aiPlan(field, 'Select an option supported by the candidate profile.');
         const isContactOrPersonal = /\b(name|first|last|given|surname|email|phone|tel|cell|city|state|zip|postal|address|country|linkedin|github|website|portfolio|date|when can you start|start date)\b/i.test(nl);
         const isBioOrScreening = !isContactOrPersonal && (field.element?.tagName === 'TEXTAREA' || field.editable ||
           /\?/.test(field.label || '') ||
           (field.label || '').trim().length > 25 ||
           /\b(bio|biography|summary|about\s*(you|yourself)?|cover\s*letter|tell\s*us|interest(ed)?\s*in|why|experience\s*with|describe|explain|qualification|overview|motivation|background|statement)\b/i.test(field.label || '') ||
           /\b(bio|summary|cover\s*letter|describe|explain)\b/i.test(field.hint || ''));
         if ((field.kind === 'textarea' || field.kind === 'text') && isBioOrScreening) return aiPlan(field, 'Write a concise first-person answer grounded in the resume.');
         return { field, status: 'needs_review', reason: 'No unambiguous profile fact.' };
@@ -758,21 +819,23 @@
       if (factKey === 'e_signature') {
         return { field, factKey, status: 'manual', reason: 'Candidate signature is required.' };
       }
       // A work permit is not citizenship. Never answer a citizenship yes/no
       // question from authorized_in_usa or from an inferred visa category.
       if (factKey === 'citizenship_status' && isChoiceKind(field.kind) &&
         pickBooleanOption(field.options, true) && pickBooleanOption(field.options, false)) {
         return { field, factKey, status: 'needs_review', reason: 'Citizenship requires an explicit yes/no answer.' };
       }
       // A known United States authorization must not answer a question about an unrelated foreign country.
-      if (factKey === 'authorized_in_usa' && !isUSQuestion(nl) && !/^(?:are you (?:legally )?authorized to work|legally authorized|work authorization|authorized to work|authorized in usa)$/.test(nl || nh)) {
+      if (factKey === 'authorized_in_usa' && !isUSQuestion(nl) &&
+        !/^(?:are you\s+)?(?:legally\s+)?authorized to work(?:\s+in\s+(?:this country|the country\b[^?]*))?[?.\s]*$/i.test(nl || nh) &&
+        !/^(?:are you (?:legally )?authorized to work|legally authorized|work authorization|authorized to work|authorized in usa)[?.\s]*$/i.test(nl || nh)) {
         return { field, factKey, status: 'unknown', reason: 'Question is not about United States work authorization.' };
       }
 
       let val = values[factKey];
 
       // Phone formatting for international / country code prompts
       if (factKey === 'phone' && val) {
         const question = nl + ' ' + nh + ' ' + norm(field.placeholder);
         if (/\b(?:\+country code|country code|\+1|international)\b/i.test(question) || /^\s*\+\s*/.test(field.placeholder || '')) {
           const rawDigits = String(val).replace(/\D/g, '');
@@ -1027,20 +1090,21 @@
     if (isCompanySpecificQuestion(question, companyName)) {
       const company = companyName?.trim().toLowerCase();
       const role = jobTitle?.trim().toLowerCase();
       if (!company || !role) return null;
       const scope = [company, role].map(part => part.replace(/%/g, '%25').replace(/\|/g, '%7C'));
       return [normKey, ...scope].join('|');
     }
     return normKey; // Factual question cached globally
   }
 
-  root.NextkinFieldMapping = { planFill, resolveFact, buildValues, pickOption, pickBooleanOption, normalizeBoolean, isChoiceKind, isMultiKind, CANONICAL_FACTS, CONSEQUENTIAL_FACTS, isCompanySpecificQuestion, computeCacheKey, isUrlField, candidateHttpUrl, screeningJobKey };
+  root.NextkinFieldMapping = { planFill, resolveFact, opensWith, buildValues, pickOption, pickBooleanOption, normalizeBoolean, isChoiceKind, isMultiKind, CANONICAL_FACTS, CONSEQUENTIAL_FACTS, isCompanySpecificQuestion, computeCacheKey, isUrlField, candidateHttpUrl, screeningJobKey };
   if (typeof exports !== 'undefined') {
     exports.isUrlField = isUrlField;
     exports.planFill = planFill;
     exports.candidateHttpUrl = candidateHttpUrl;
     exports.resolveFact = resolveFact;
+    exports.opensWith = opensWith;
     exports.buildValues = buildValues;
     exports.NextkinFieldMapping = root.NextkinFieldMapping;
   }
 })(globalThis);
diff --git a/tests/anchored-field-mapping.test.mjs b/tests/anchored-field-mapping.test.mjs
new file mode 100644
index 0000000..7773213
--- /dev/null
+++ b/tests/anchored-field-mapping.test.mjs
@@ -0,0 +1,144 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { readFileSync } from 'node:fs';
+import { runInNewContext } from 'node:vm';
+
+class MockElement {
+  constructor(tagName = 'INPUT', attrs = {}) {
+    this.tagName = tagName.toUpperCase();
+    this.attrs = { ...attrs };
+    this.id = attrs.id || '';
+    this.name = attrs.name || '';
+    this.type = attrs.type || 'text';
+  }
+  getAttribute(name) {
+    const key = name.toLowerCase();
+    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
+  }
+}
+
+function createHarness() {
+  const context = {
+    URL,
+    crypto,
+    Event,
+    EventTarget,
+    console,
+    HTMLInputElement: MockElement,
+  };
+  context.globalThis = context;
+  const source = (file) => readFileSync(new URL(`../jobright_extension/${file}`, import.meta.url), 'utf8');
+  runInNewContext(source('adapters/ats-adapters.js'), context);
+  runInNewContext(source('core/field-mapping.js'), context);
+  return context;
+}
+
+test('1. "Are you legally authorized to work in this country?" matches authorized_in_usa, NOT country', () => {
+  const { NextkinFieldMapping } = createHarness();
+  const { resolveFact } = NextkinFieldMapping;
+
+  // Standalone label without hint
+  const resNoHint = resolveFact('Are you legally authorized to work in this country?');
+  assert.ok(resNoHint, 'Expected resolved fact');
+  assert.equal(resNoHint.key, 'authorized_in_usa');
+  assert.notEqual(resNoHint.key, 'country');
+
+  // Incidental or misattributed Tier 1 adapter hint "country" must be sanitized
+  const resWithHint = resolveFact('Are you legally authorized to work in this country?', 'country');
+  assert.ok(resWithHint, 'Expected resolved fact');
+  assert.equal(resWithHint.key, 'authorized_in_usa');
+  assert.notEqual(resWithHint.key, 'country');
+});
+
+test('2. "First Name (required) id_1234" matches first_name because first name opens the label', () => {
+  const { NextkinFieldMapping } = createHarness();
+  const { resolveFact, opensWith } = NextkinFieldMapping;
+
+  assert.equal(typeof opensWith, 'function', 'opensWith must be exported on NextkinFieldMapping');
+  assert.equal(opensWith('first name (required) id 1234', 'first name'), true);
+  assert.equal(opensWith('firstname', 'first'), false);
+  assert.equal(opensWith('first name', 'first name'), true);
+
+  const res = resolveFact('First Name (required) id_1234');
+  assert.ok(res, 'Expected resolved fact for First Name (required) id_1234');
+  assert.equal(res.key, 'first_name');
+});
+
+test('3. Unlisted portal domains on custom URLs fall back to registered generic adapter rather than returning null', () => {
+  const { resolveActiveAdapter, NextkinAdapters } = createHarness();
+
+  // Known ATS domain returns its specialized adapter
+  const leverAdapter = resolveActiveAdapter('https://jobs.lever.co/fixture/123/apply');
+  assert.ok(leverAdapter);
+  assert.equal(leverAdapter.id, 'lever');
+
+  // Unlisted domain on custom URL must return generic adapter, not null
+  const genericAdapter = resolveActiveAdapter('https://careers.customenterpriseportal.com/jobs/123');
+  assert.ok(genericAdapter, 'Expected active generic adapter for unlisted domain, got null');
+  assert.equal(genericAdapter.id, 'generic');
+  assert.equal(typeof genericAdapter.hint, 'function');
+
+  // Verify generic adapter returns canonical hints
+  const emailInput = new MockElement('INPUT', { name: 'email', id: 'candidate_email' });
+  assert.equal(genericAdapter.hint(emailInput), 'email');
+
+  const fnInput = new MockElement('INPUT', { name: 'first_name', id: 'first_name' });
+  assert.equal(genericAdapter.hint(fnInput), 'first_name');
+
+  // Verify total registered adapters includes generic
+  const hasGeneric = (NextkinAdapters || []).some(a => a.id === 'generic');
+  assert.ok(hasGeneric, 'Generic adapter must be registered in NextkinAdapters');
+});
+
+test('4. Multi-factor semantic evaluation checks question context, question kind, and options to prevent false positive keyword collisions', () => {
+  const { NextkinFieldMapping } = createHarness();
+  const { resolveFact, planFill } = NextkinFieldMapping;
+
+  // Case A: Question contains keyword "employer", but is a choice question with Yes/No asking for sponsorship
+  const sponsorshipField = {
+    key: 'sponsor_q',
+    label: 'Will your employer need to sponsor your visa status?',
+    hint: 'current_employer', // Erroneous / incidental adapter hint
+    kind: 'choice',
+    options: [{ label: 'Yes' }, { label: 'No' }]
+  };
+  const resolvedSponsor = resolveFact(sponsorshipField.label, sponsorshipField.hint, sponsorshipField);
+  assert.ok(resolvedSponsor);
+  assert.equal(resolvedSponsor.key, 'needs_sponsorship', 'Should resolve to needs_sponsorship, not current_employer');
+  assert.notEqual(resolvedSponsor.key, 'current_employer');
+
+  // Case B: Authorization question evaluated through planFill
+  const authField = {
+    key: 'auth_q',
+    label: 'Are you legally authorized to work in this country?',
+    kind: 'choice',
+    options: [{ label: 'Yes' }, { label: 'No' }]
+  };
+  const countryField = {
+    key: 'country_q',
+    label: 'Country of residence',
+    kind: 'text',
+    options: []
+  };
+
+  const candidate = {
+    confirmed_facts: {
+      authorized_in_usa: true,
+      country: 'United States'
+    }
+  };
+
+  const plans = planFill([authField, countryField], candidate);
+  const authPlan = plans.find(p => p.field.key === 'auth_q');
+  const countryPlan = plans.find(p => p.field.key === 'country_q');
+
+  assert.ok(authPlan);
+  assert.equal(authPlan.factKey, 'authorized_in_usa');
+  assert.equal(authPlan.status, 'supported');
+  assert.equal(authPlan.value, 'Yes');
+
+  assert.ok(countryPlan);
+  assert.equal(countryPlan.factKey, 'country');
+  assert.equal(countryPlan.status, 'supported');
+  assert.equal(countryPlan.value, 'United States');
+});

`