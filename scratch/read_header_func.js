const fs = require('fs');
const c = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = c.indexOf('// Detect Job Title & Company');
console.log(c.slice(Math.max(0, idx - 2500), Math.max(0, idx - 1000)));
