const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
const idx = c.indexOf('targetVal = candMajor;');
console.log(c.slice(idx, idx + 1800));
