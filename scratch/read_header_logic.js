const fs = require('fs');
const c = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = c.indexOf('if (compEl) companyName');
console.log(c.slice(Math.max(0, idx - 2000), idx + 200));
