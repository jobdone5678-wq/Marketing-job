const fs = require('fs');
const c = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = c.indexOf('Candidate profile selected');
const start = Math.max(0, idx - 2500);
console.log(c.slice(start, idx));
