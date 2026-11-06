const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = content.indexOf('NEXTKIN_AUTOFILL_DONE');
console.log(content.slice(idx - 100, idx + 600));
