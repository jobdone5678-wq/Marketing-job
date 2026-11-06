const fs = require('fs');
const code = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

let pos = code.indexOf('for (const el of controls) {');
console.log('controls loop at:', pos);
console.log(code.substring(pos, pos + 2000));
