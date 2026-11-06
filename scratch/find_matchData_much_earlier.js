const fs = require('fs');
const ha = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = ha.indexOf('children:matchData.score+"%"');
console.log(ha.slice(idx - 6500, idx - 3500));
