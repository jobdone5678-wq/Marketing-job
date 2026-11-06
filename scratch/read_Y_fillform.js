const fs = require('fs');
const c = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = c.indexOf('let n=await t.fillForm();');
console.log(c.slice(idx - 100, idx + 1500));
