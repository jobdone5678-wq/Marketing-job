const fs = require('fs');
const code = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

let pos = code.indexOf('candCompany');
console.log(code.substring(pos - 100, pos + 400));
