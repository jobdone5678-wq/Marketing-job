const fs = require('fs');
const code = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

let pos = code.indexOf('// Handle radio buttons');
console.log(code.substring(pos, pos + 2500));
