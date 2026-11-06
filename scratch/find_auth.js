const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
const idx = c.indexOf('legally\\s*authorized');
console.log(c.slice(idx - 50, idx + 2000));
