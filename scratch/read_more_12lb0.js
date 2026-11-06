const fs = require('fs');
const c = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = c.indexOf('"12lb0":[function');
console.log(c.slice(idx + 1200, idx + 3200));
