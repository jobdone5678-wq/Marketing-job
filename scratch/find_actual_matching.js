const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
const idx = c.indexOf('autocomplete === \'given-name\'');
console.log(c.slice(idx - 300, idx + 800));
