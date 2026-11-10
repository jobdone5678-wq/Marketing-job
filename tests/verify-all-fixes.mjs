import fs from 'fs';
import assert from 'assert';

console.log('=== Verifying Syntax and Logic ===');

// Check outside-job-engine.js syntax
try {
  const engineCode = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
  // Simple check for syntax error by evaluating non-DOM functions
  const cleanerMatch = engineCode.match(/function cleanCandidateFullName\(rawName, resumeText\) \{([\s\S]*?)\n  \}/);
  assert(cleanerMatch, 'cleanCandidateFullName must be present');
  
  // Test cleanCandidateFullName logic
  const testFn = new Function('rawName', 'resumeText', cleanerMatch[1]);
  
  const test1 = testFn("Bhargav_Reddy_G2i_Inc_Full_Stack_Developer_G2I_Talent_Pool_8cc336c08501.pdf", "");
  console.log('Test 1 - Filename with G2i, Full Stack, hex hash:', test1);
  assert.strictEqual(test1, "Bhargav Reddy", 'Should cleanly extract Bhargav Reddy');

  const test2 = testFn("John_Doe_Software_Engineer_Resume_v2.docx", "");
  console.log('Test 2 - Resume v2 with job title:', test2);
  assert.strictEqual(test2, "John Doe", 'Should cleanly extract John Doe');

  const test3 = testFn("resume-alice-smith.pdf", "");
  console.log('Test 3 - resume- prefix:', test3);
  assert.strictEqual(test3, "Alice Smith", 'Should cleanly extract Alice Smith');

  console.log('✓ cleanCandidateFullName passes all unit tests!');
} catch (err) {
  console.error('Syntax / logic error in outside-job-engine.js:', err);
  process.exit(1);
}

// Check helper-app.41ea2652.js
const helperApp = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

// Check branding
assert(helperApp.includes('children:"NextKinHR"'), 'NextKinHR branding text must be in helper-app');
assert(!helperApp.includes('viewBox:"0 0 58 16"'), 'Jobright 58x16 SVG should no longer be in helper-app');
console.log('✓ Branding: NextKinHR is rendered, Jobright SVG removed');

// Check dummy 8 fallback removal
assert(!helperApp.includes('ev.detail?.filledCount || 8'), 'ev.detail?.filledCount || 8 must be removed');
assert(!helperApp.includes('ev.data.data.filledFields.length) || 8'), 'dummy 8 fallback in onMsg must be removed');
console.log('✓ Dummy 8 count fallbacks removed from onDone and onMsg');

// Check 0-count message
assert(helperApp.includes('No matching fields to autofill on this step'), 'Zero-count info banner must be present');
console.log('✓ Zero-count banner is properly configured');

// Check outside-job-engine.js referral skip
const engineCode = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
assert(engineCode.includes('// Skip referral / employee who referred you questions'), 'Referral skip check must be present');
assert(engineCode.includes('who\\s*referred|employee\\s*who'), 'Referral regex must be present');
assert(engineCode.includes('email\\s*\\/?\\s*login'), 'Email/Login regex must be present');
console.log('✓ Referral question exclusion and Email/Login matching verified');

console.log('=== All Verifications Passed 100%! ===');

