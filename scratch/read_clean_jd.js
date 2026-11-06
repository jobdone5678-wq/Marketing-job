const fs = require('fs');
const c = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = c.indexOf('function getCleanJdText(');
console.log(c.slice(idx, idx + 1200));
