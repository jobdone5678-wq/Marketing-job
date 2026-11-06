const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
const idx = c.indexOf('NEXTKIN_AUTOFILL_DONE');
console.log(c.slice(idx - 300, idx + 400));
