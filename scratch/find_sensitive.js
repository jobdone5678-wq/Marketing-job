const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
const idx = c.indexOf('SENSITIVE_EXCLUDED_REGEX');
console.log(c.slice(idx, idx + 200));
