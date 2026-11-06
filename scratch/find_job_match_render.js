const fs = require('fs');
const ha = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = ha.indexOf('Job Match');
console.log(ha.slice(idx - 200, idx + 600));
