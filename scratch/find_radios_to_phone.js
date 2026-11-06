const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
const idx = c.indexOf('// Handle radio buttons');
const nextIdx = c.indexOf('// PHONE NUMBER CHECK FIRST', idx);
console.log('After radios to phone number check:', c.slice(idx, nextIdx + 200));
