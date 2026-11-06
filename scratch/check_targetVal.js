const fs = require('fs');
const file = 'jobright_extension/outside-job-engine.js';
const content = fs.readFileSync(file, 'utf8');
const idx = content.indexOf('// 1. MIDDLE NAME EXPLICIT CHECK');
console.log(content.slice(idx - 100, idx + 1200));
