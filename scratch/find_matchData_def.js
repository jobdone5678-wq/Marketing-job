const fs = require('fs');
const ha = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = ha.indexOf('const matchData');
console.log(ha.slice(idx, idx + 1000));
