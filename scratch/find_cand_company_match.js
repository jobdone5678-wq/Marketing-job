const fs = require('fs');
const code = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

let pos = code.indexOf('targetVal = candCompany');
console.log(code.substring(pos - 150, pos + 100));
