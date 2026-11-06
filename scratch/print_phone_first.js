const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
const idx = c.indexOf('// PHONE NUMBER CHECK FIRST');
console.log(c.slice(idx - 100, idx + 1000));
