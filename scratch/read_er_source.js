const fs = require('fs');
const c = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = 1480697;
console.log(c.slice(idx - 1000, idx + 200));
