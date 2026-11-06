const fs = require('fs');
const code = fs.readFileSync('jobright_extension/static/background/index.js', 'utf8');
let idx = code.indexOf('"6nlTt":[');
if (idx === -1) idx = code.indexOf('6nlTt:[');
console.log('idx:', idx);
console.log(code.substring(idx, idx + 800));
