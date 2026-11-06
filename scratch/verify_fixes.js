const fs = require('fs');

console.log('--- Verifying helper-app.41ea2652.js logic ---');

const code = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

// Check that no hardcoded 82 or fallbacks exist
const forbidden = [
  'score = 82',
  'score=82',
  'Math.max(score, 75)',
  'Linkedin Innovations',
  'Senior Software Developer (Full Stack) - Python',
  'Role specifically evaluates AI coding agents'
];

let allClean = true;
forbidden.forEach(term => {
  if (code.includes(term)) {
    console.error('FAIL: Found forbidden hardcoded string:', term);
    allClean = false;
  } else {
    console.log('PASS: Clean of:', term);
  }
});

// Check that LinkedIn selectors are present in JD extraction
if (code.includes('#job-details, .jobs-description__content')) {
  console.log('PASS: LinkedIn #job-details selector present in getCleanJdText');
} else {
  console.error('FAIL: LinkedIn JD selector missing');
  allClean = false;
}

// Check that live dynamic header observer is present in hfEAA
if (code.includes('job-details-jobs-unified-top-card__job-title') && code.includes('MutationObserver')) {
  console.log('PASS: Live dynamic top card observer present in header component');
} else {
  console.error('FAIL: Live header observer missing');
  allClean = false;
}

console.log('Overall Verification:', allClean ? 'ALL CHECKS PASSED ✅' : 'CHECKS FAILED ❌');
