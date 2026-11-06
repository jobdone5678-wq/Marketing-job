const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
const idx = c.indexOf('targetVal = candidate.authorized_us !== false ?');
console.log(c.slice(idx, idx + 2500));
