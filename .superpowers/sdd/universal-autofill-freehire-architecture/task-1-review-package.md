# Review Package: Task 1

## Commits
c4de859 feat(autofill): enforce unconditional 1-to-1 URL slotting and zero duplication

## Stat
 jobright_extension/core/field-mapping.js |  71 +++++++----
 tests/strict-url-slotting.test.mjs       | 210 +++++++++++++++++++++++++++++++
 2 files changed, 259 insertions(+), 22 deletions(-)

## Diff
`diff
diff --git a/jobright_extension/core/field-mapping.js b/jobright_extension/core/field-mapping.js
index 2274588..db1e100 100644
--- a/jobright_extension/core/field-mapping.js
+++ b/jobright_extension/core/field-mapping.js
@@ -58,21 +58,21 @@
       'employment country',
       'country you intend to work from',
       'intended employment country',
       'intended work country'
     ],
     full_address: ['street address', 'address line1', 'address line 1', 'address', 'street', 'address1', 'home address', 'mailing address', 'current address', 'address line one', 'street address line 1'],
     date_of_birth: ['date of birth', 'birth date', 'birthdate', 'date of birth dob', 'dob', 'date of birth mm dd yyyy'],
     citizenship_status: ['citizenship status', 'country of citizenship', 'nationality', 'are you a us citizen', 'are you a u s citizen', 'are you a united states citizen'],
     linkedin_url: ['linkedin', 'linkedin profile', 'linkedin url', 'urls linkedin', 'linkedin profile url', 'linked in'],
     github_url: ['github', 'github url', 'github profile', 'urls github', 'github com'],
-    website: ['website', 'portfolio', 'personal website', 'portfolio url', 'urls portfolio', 'urls other', 'personal url', 'homepage', 'home page', 'personal site', 'other url', 'blog url'],
+    website: ['website', 'portfolio', 'personal website', 'portfolio url', 'urls portfolio', 'personal url', 'homepage', 'home page', 'personal site', 'blog url'],
     current_employer: ['current employer', 'current company', 'most recent company', 'employer', 'company', 'org', 'current organization', 'organization', 'company name', 'present employer', 'most recent employer', 'last employer', 'current organisation'],
     current_title: ['current title', 'current job title', 'most recent title', 'headline', 'current role', 'job title', 'present title', 'current position', 'designation', 'most recent job title'],
     total_experience_years: ['years of experience', 'total experience', 'experience years', 'how many years of experience', 'total years of experience', 'years of professional experience', 'years of work experience', 'relevant experience', 'total work experience', 'overall experience'],
     primary_skills: ['skills', 'primary skills', 'technical skills', 'key skills', 'ideal tech stack', 'tech stack', 'languages frameworks', 'strongest in', 'languages and frameworks', 'programming languages', 'skills and abilities', 'core competencies', 'technologies', 'expertise', 'programming languages and frameworks', 'skills list', 'your skills'],
     authorized_in_usa: [
       'are you legally authorized to work in the country for which you are applying',
       'are you legally authorized to work in the united states',
       'legally authorized to work in the country for which you are applying',
       'legally authorized to work in the united states',
       'authorized to work in the country for which you are applying',
@@ -501,21 +501,22 @@
       country: facts.country ?? candidate.country ?? candFacts.country ?? (locationParts.length >= 3 ? locationParts[2] : ''),
       intended_work_country: intendedCountry,
       full_address: facts.full_address || candidate.full_address || candidate.address || candidate.street_address || '',
       date_of_birth: dateOfBirth,
       citizenship_status: facts.citizenship_status || candidate.citizenship_status || facts.citizenship || candidate.citizenship || '',
       current_employer: facts.current_employer || candidate.current_employer || facts.current_company || candidate.current_company || candidate.company || '',
       current_title: facts.current_job_title || candidate.current_job_title || candidate.headline || facts.headline || candFacts.headline || candFacts.current_job_title || '',
       headline: facts.headline || candidate.headline || candFacts.headline || facts.current_job_title || candidate.current_job_title || '',
       linkedin_url: linkedin,
       github_url: facts.github_url || candidate.github_url || '',
-      website: facts.website || candidate.website || candidate.portfolio_url || '',
+      portfolio_url: facts.portfolio_url || candidate.portfolio_url || facts.website || candidate.website || '',
+      website: facts.website || candidate.website || facts.portfolio_url || candidate.portfolio_url || '',
       total_experience_years: facts.total_experience_years !== undefined ? facts.total_experience_years
         : (candidate.total_experience_years !== undefined ? candidate.total_experience_years
           : (candidate.experience_years !== undefined ? candidate.experience_years : (candidate.years_of_experience ?? ''))),
       primary_skills: skills,
       authorized_in_usa: authKnown,
       needs_sponsorship: sponsorKnown,
       visa_status: visaStatus,
       work_authorization: workAuth,
       open_to_relocation: relocationVal,
       end_client: facts.end_client || candidate.end_client || '',
@@ -600,85 +601,104 @@
   }
 
   function linkMetadata(value) {
     return norm(String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^a-z\d]+/gi, ' '))
       .replace(/^(?:(?:please|your|provide|enter|share|paste)\s+)+/, '')
       .replace(/\bgit hub\b/g, 'github')
       .replace(/\s+(?:optional|required)$/, '');
   }
 
   function linkFieldKey(field) {
-    const element = field.element;
-    const candidates = [element?.name, element?.id, field.name, field.id, field.hint, field.label];
+    const element = field?.element;
+    const candidates = [element?.name, element?.id, field?.name, field?.id, field?.key, field?.hint, field?.label];
     for (const value of candidates) {
+      if (!value) continue;
       const name = linkMetadata(value);
-      if (/^(?:urls? )?(?:twitter|x twitter|twitter x)(?: (?:profile|url|link)){0,2}$|^(?:urls? x|x (?:profile|url|link))$/.test(name))
-        return 'twitter_url';
       if (aliases.github_url.includes(name) || /^(?:urls? )?git ?hub(?: (?:profile|url|link)){0,2}$/.test(name)) return 'github_url';
       if (aliases.linkedin_url.includes(name) || /^(?:urls? )?linked ?in(?: (?:profile|url|link)){0,2}$/.test(name)) return 'linkedin_url';
       if (/^(?:urls? )?(?:personal |professional )?portfolio(?: (?:website|url|link)){0,2}$/.test(name)) return 'portfolio_url';
-      if (/^(?:urls? other|other (?:url|link|website))$/.test(name)) return 'other_url';
       if (aliases.website.includes(name) || /^(?:urls? )?(?:personal (?:website|site|url)|website|blog)(?: (?:website|url|link)){0,2}$/.test(name))
         return 'website';
     }
     return null;
   }
 
   function isUrlField(field) {
+    if (!field) return false;
     if (field.type === 'url' || field.kind === 'url' || field.element?.type === 'url' || linkFieldKey(field)) return true;
-    return [field.label, field.name, field.id, field.hint, field.element?.name, field.element?.id].some(value =>
-      /^(?:urls?|(?:profile|social|personal|professional|website|external) (?:urls?|links?))$/
-        .test(linkMetadata(value))
-    );
+    const candidates = [field.label, field.name, field.id, field.hint, field.key, field.element?.name, field.element?.id];
+    return candidates.some(value => {
+      if (!value) return false;
+      const str = String(value);
+      if (/^urls?\[/i.test(str) || /[_-]urls?(?:[_-]|$)/i.test(str) || /[_-]links?(?:[_-]|$)/i.test(str)) return true;
+      const meta = linkMetadata(str);
+      return /^(?:urls?|links?|websites?)$/.test(meta) ||
+        /^(?:urls? )?(?:twitter|x twitter|twitter x|x|other|additional|social|blog|portfolio|website|github|linkedin|custom)(?: (?:profile|url|link|website)){0,2}$/.test(meta) ||
+        /^(?:profile|social|personal|professional|website|external|other|additional|custom) (?:urls?|links?)$/.test(meta) ||
+        /^(?:urls? )?(?:other|additional)$/.test(meta);
+    });
   }
 
   function candidateHttpUrl(value) {
     if (typeof value !== 'string') return null;
-    const text = value.trim();
-    if (!/^https?:\/\/[^\s\\/?#][^\s\\]*$/i.test(text)) return null;
+    if (/\s/.test(value)) return null;
+    if (!/^https?:\/\/[^\s\\/?#][^\s\\]*$/i.test(value)) return null;
     const UrlCtor = typeof URL !== 'undefined' ? URL : (typeof globalThis !== 'undefined' ? globalThis.URL : null);
-    if (!UrlCtor) return text;
+    if (!UrlCtor) return value;
     try {
-      const url = new UrlCtor(text);
-      return url.hostname && !url.username && !url.password ? text : null;
+      const url = new UrlCtor(value);
+      return url.hostname && !url.username && !url.password ? value : null;
     } catch {
       return null;
     }
   }
 
   function screeningJobKey(job) {
     if (!job?.externalId && !job?.jobUrl && !(job?.title && job?.company)) return null;
     return JSON.stringify([job.externalId || '', job.jobUrl || '', job.title || '', job.company || '']);
   }
 
   function planFill(fields, candidate, options = {}) {
     const values = buildValues(candidate);
     const aiPlan = (field, reason) => ({ field, status: 'ai', reason, options: (field.options || []).map(o => optionText(o)), aiPrompt: field.label });
+    const consumedUrls = new Set();
 
     const plans = fields.map(field => {
       if (field.kind === 'inaccessible' || field.excluded) {
         return { field, status: 'manual', reason: 'Manual or protected field.' };
       }
       if (HISTORY_SCOPE.test(field.scope)) {
         return { field, status: 'needs_review', reason: 'Repeated history requires explicit record-to-section review.' };
       }
       if (isUrlField(field)) {
         const factKey = linkFieldKey(field);
+        if (!factKey) {
+          return { field, factKey: null, status: 'manual', reason: 'Unmapped link field; enter manually.' };
+        }
         const facts = candidate.confirmed_facts || candidate;
         const candidateLink = factKey === 'linkedin_url'
           ? (facts.linkedin_url || facts.linkedin || candidate.linkedin_url || candidate.linkedin)
           : facts[factKey];
-        const fallback = factKey === 'portfolio_url' ? (values.portfolio_url || values.website) : values[factKey];
-        const value = factKey && candidateHttpUrl(candidateLink || fallback);
-        return value
-          ? { field, factKey, status: 'supported', value }
-          : { field, factKey, status: 'manual', reason: 'Enter a valid profile URL manually.' };
+        const fallback = (factKey === 'portfolio_url' || factKey === 'website')
+          ? (facts.portfolio_url || facts.website || candidate.portfolio_url || candidate.website || values.portfolio_url || values.website)
+          : values[factKey];
+        const rawUrl = candidateLink || fallback;
+        const value = candidateHttpUrl(rawUrl);
+        if (!value) {
+          return { field, factKey, status: 'manual', reason: 'Enter a valid profile URL manually.' };
+        }
+        const normalizedUrl = value.toLowerCase();
+        if (consumedUrls.has(normalizedUrl)) {
+          return { field, factKey: null, status: 'manual', reason: 'Unmapped link field; enter manually.' };
+        }
+        consumedUrls.add(normalizedUrl);
+        return { field, factKey, status: 'supported', value };
       }
 
       const nl = norm(field.label);
       const nh = norm(field.hint);
       if (/\b(referrer|referred|referral|who\s*referred|employee\s*who|relation\s*to)\b/i.test(nl + ' ' + nh)) {
         return { field, status: 'manual', reason: 'Employee referral question.' };
       }
       // A job target or second-choice field is not a profile fact.
       if (/\bapplying (to|for)\b|\bdesired (job |role|title)\b|\bpreferred (job |role|title)\b|\btarget (job |role|title)\b|\bselect the (job|role|position)\b/i.test(nl)) {
         return { field, status: 'needs_review', reason: 'Job target field is not a profile fact.' };
@@ -1008,12 +1028,19 @@
       const company = companyName?.trim().toLowerCase();
       const role = jobTitle?.trim().toLowerCase();
       if (!company || !role) return null;
       const scope = [company, role].map(part => part.replace(/%/g, '%25').replace(/\|/g, '%7C'));
       return [normKey, ...scope].join('|');
     }
     return normKey; // Factual question cached globally
   }
 
   root.NextkinFieldMapping = { planFill, resolveFact, buildValues, pickOption, pickBooleanOption, normalizeBoolean, isChoiceKind, isMultiKind, CANONICAL_FACTS, CONSEQUENTIAL_FACTS, isCompanySpecificQuestion, computeCacheKey, isUrlField, candidateHttpUrl, screeningJobKey };
-  if (typeof exports !== 'undefined') exports.isUrlField = isUrlField;
+  if (typeof exports !== 'undefined') {
+    exports.isUrlField = isUrlField;
+    exports.planFill = planFill;
+    exports.candidateHttpUrl = candidateHttpUrl;
+    exports.resolveFact = resolveFact;
+    exports.buildValues = buildValues;
+    exports.NextkinFieldMapping = root.NextkinFieldMapping;
+  }
 })(globalThis);
diff --git a/tests/strict-url-slotting.test.mjs b/tests/strict-url-slotting.test.mjs
new file mode 100644
index 0000000..8a84da5
--- /dev/null
+++ b/tests/strict-url-slotting.test.mjs
@@ -0,0 +1,210 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { readFileSync } from 'node:fs';
+import { runInNewContext } from 'node:vm';
+
+const application = new URL('https://jobs.lever.co/fixture/01234567-0123-4567-89ab-0123456789ab/apply');
+const source = (file) => readFileSync(new URL(`../jobright_extension/${file}`, import.meta.url), 'utf8');
+const prose = 'You can review my recent projects on GitHub.';
+
+class Input extends EventTarget {
+  tagName = 'INPUT';
+  isConnected = true;
+  value = '';
+  getAttribute() { return null; }
+  closest() { return null; }
+}
+
+function createHarness(fieldDefs) {
+  const fields = fieldDefs.map(([label, name, type = 'text']) => ({
+    key: name,
+    label,
+    name,
+    kind: 'text',
+    options: [],
+    element: Object.assign(new Input(), { name, type }),
+  }));
+  const context = {
+    location: application,
+    document: { querySelectorAll: () => [] },
+    crypto,
+    Event,
+    URL,
+    HTMLInputElement: Input,
+    NextkinJobCapture: { read: () => null },
+    NextkinForms: { discoverFields: () => fields },
+  };
+  for (const file of ['core/field-mapping.js', 'core/field-writer.js', 'core/application.js']) {
+    runInNewContext(source(file), context);
+  }
+  const lookup = (key) => fields.find((f) => f.key === key || f.name === key);
+  return { context, fields, lookup };
+}
+
+test('multi-URL form slots LinkedIn, GitHub, Portfolio 1-to-1, marks Twitter and Other manual, and avoids duplicate URLs', () => {
+  const { context, fields, lookup } = createHarness([
+    ['LinkedIn Profile', 'urls[LinkedIn]'],
+    ['GitHub Profile', 'urls[GitHub]', 'url'],
+    ['Twitter URL', 'urls[Twitter]'],
+    ['Portfolio', 'urls[Portfolio]'],
+    ['Other', 'urls[Other]'],
+    ['Personal Website', 'urls[Website]'],
+  ]);
+
+  const candidate = {
+    confirmed_facts: {
+      full_name: 'Test Candidate',
+      email: 'candidate@example.test',
+      linkedin_url: 'https://linkedin.com/in/testcandidate',
+      github_url: 'https://github.com/testcandidate',
+      portfolio_url: 'https://testcandidate.dev',
+      website: 'https://testcandidate.dev', // duplicate of portfolio
+    },
+  };
+
+  const plans = context.NextkinFieldMapping.planFill(fields, candidate);
+
+  // 1. LinkedIn maps 1-to-1 to linkedin_url
+  const linkedinPlan = plans.find((p) => p.field === lookup('urls[LinkedIn]'));
+  assert.equal(linkedinPlan.status, 'supported');
+  assert.equal(linkedinPlan.factKey, 'linkedin_url');
+  assert.equal(linkedinPlan.value, 'https://linkedin.com/in/testcandidate');
+
+  // 2. GitHub maps 1-to-1 to github_url
+  const githubPlan = plans.find((p) => p.field === lookup('urls[GitHub]'));
+  assert.equal(githubPlan.status, 'supported');
+  assert.equal(githubPlan.factKey, 'github_url');
+  assert.equal(githubPlan.value, 'https://github.com/testcandidate');
+
+  // 3. Portfolio maps once to portfolio_url
+  const portfolioPlan = plans.find((p) => p.field === lookup('urls[Portfolio]'));
+  assert.equal(portfolioPlan.status, 'supported');
+  assert.equal(portfolioPlan.factKey, 'portfolio_url');
+  assert.equal(portfolioPlan.value, 'https://testcandidate.dev');
+
+  // 4. Unmapped link fields (Twitter, Other) are marked manual
+  const twitterPlan = plans.find((p) => p.field === lookup('urls[Twitter]'));
+  assert.equal(twitterPlan.status, 'manual');
+  assert.equal(twitterPlan.reason, 'Unmapped link field; enter manually.');
+
+  const otherPlan = plans.find((p) => p.field === lookup('urls[Other]'));
+  assert.equal(otherPlan.status, 'manual');
+  assert.equal(otherPlan.reason, 'Unmapped link field; enter manually.');
+
+  // 5. Zero duplicate URLs across fields (urls[Website] attempting to reuse https://testcandidate.dev)
+  const websitePlan = plans.find((p) => p.field === lookup('urls[Website]'));
+  assert.equal(websitePlan.status, 'manual');
+  assert.equal(websitePlan.reason, 'Unmapped link field; enter manually.');
+
+  const supportedUrls = plans.filter((p) => p.status === 'supported').map((p) => p.value);
+  const uniqueUrls = new Set(supportedUrls);
+  assert.equal(supportedUrls.length, uniqueUrls.size, 'All slotted URLs must be strictly unique');
+});
+
+test('malformed URLs or strings containing whitespace or newlines are rejected', () => {
+  const { context } = createHarness([]);
+  const { candidateHttpUrl } = context.NextkinFieldMapping;
+
+  // Valid URLs pass
+  assert.equal(candidateHttpUrl('https://github.com/user'), 'https://github.com/user');
+  assert.equal(candidateHttpUrl('http://example.org/portfolio'), 'http://example.org/portfolio');
+
+  // Whitespace and newlines rejected
+  assert.equal(candidateHttpUrl('https://example.com/with space'), null);
+  assert.equal(candidateHttpUrl('https://example.com\n'), null);
+  assert.equal(candidateHttpUrl('https://example.com\r\npath'), null);
+  assert.equal(candidateHttpUrl(' https://example.com'), null);
+  assert.equal(candidateHttpUrl('https://example.com '), null);
+  assert.equal(candidateHttpUrl(prose), null);
+
+  // Invalid protocol or syntax rejected
+  assert.equal(candidateHttpUrl('javascript:alert(1)'), null);
+  assert.equal(candidateHttpUrl('mailto:test@example.com'), null);
+  assert.equal(candidateHttpUrl('ftp://files.example.com'), null);
+  assert.equal(candidateHttpUrl('https://user:pass@example.com'), null);
+  assert.equal(candidateHttpUrl('https:///fixture.test'), null);
+  assert.equal(candidateHttpUrl('not a url'), null);
+  assert.equal(candidateHttpUrl(''), null);
+  assert.equal(candidateHttpUrl(null), null);
+});
+
+test('zero prose or screening text can be slotted into any URL field during application fill', async () => {
+  const { context, lookup } = createHarness([
+    ['LinkedIn Profile', 'urls[LinkedIn]'],
+    ['GitHub Profile', 'urls[GitHub]', 'url'],
+    ['Twitter URL', 'urls[Twitter]'],
+    ['Portfolio', 'urls[Portfolio]'],
+    ['Other', 'urls[Other]'],
+    ['Why do you want to join this company?', 'motivation'],
+  ]);
+
+  const candidate = {
+    provenance_status: 'confirmed',
+    confirmed_facts: {
+      full_name: 'Test Candidate',
+      email: 'candidate@example.test',
+      linkedin_url: 'https://linkedin.com/in/testcandidate',
+      github_url: 'https://github.com/testcandidate',
+      portfolio_url: 'https://testcandidate.dev',
+    },
+  };
+
+  const screeningProse = {
+    'linkedin profile': prose,
+    'github profile': prose,
+    'twitter url': prose,
+    'portfolio': prose,
+    'other': prose,
+    'urls[other]': prose,
+    'motivation': 'I am passionate about building great software.',
+  };
+
+  const results = await context.NextkinApplication.fill(
+    application.href,
+    candidate,
+    null,
+    false,
+    null,
+    { 'twitter url': { type: 'text', value: prose } },
+    screeningProse,
+  );
+
+  assert.equal(lookup('urls[LinkedIn]').element.value, 'https://linkedin.com/in/testcandidate');
+  assert.equal(lookup('urls[GitHub]').element.value, 'https://github.com/testcandidate');
+  assert.equal(lookup('urls[Portfolio]').element.value, 'https://testcandidate.dev');
+  assert.equal(lookup('urls[Twitter]').element.value, '');
+  assert.equal(lookup('urls[Other]').element.value, '');
+
+  // Verify only motivation is in screening questions, zero URL fields
+  assert.equal(results.questions.length, 1);
+  assert.match(results.questions[0].label, /why do you want/i);
+
+  // Verify no prose or AI filled into URL fields
+  for (const entry of results.filled) {
+    assert.notEqual(entry.key, 'urls[Twitter]');
+    assert.notEqual(entry.key, 'urls[Other]');
+    assert.ok(!entry.ai, 'No URL field should be filled by AI');
+    assert.ok(!entry.learned, 'No URL field should be filled by learned answer');
+  }
+});
+
+test('unrecognized or extra link fields receive manual status with specific unmapped reason', () => {
+  const { context, fields, lookup } = createHarness([
+    ['Twitter URL', 'urls[Twitter]'],
+    ['Other', 'urls[Other]'],
+    ['Substack Blog', 'urls[Substack]'],
+  ]);
+
+  const candidate = {
+    confirmed_facts: {
+      full_name: 'Test Candidate',
+      email: 'candidate@example.test',
+    },
+  };
+
+  const plans = context.NextkinFieldMapping.planFill(fields, candidate);
+  for (const plan of plans) {
+    assert.equal(plan.status, 'manual');
+    assert.equal(plan.reason, 'Unmapped link field; enter manually.');
+  }
+});

`