const fs = require('fs');
const code = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

let pos = code.indexOf('SENSITIVE_EXCLUDED_REGEX');
console.log('pos:', pos);
console.log(code.substring(pos, pos + 400));
