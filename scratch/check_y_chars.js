const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = content.indexOf('getAutofillInstance)();');
console.log(JSON.stringify(content.slice(idx - 10, idx + 45)));
