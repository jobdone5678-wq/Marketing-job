const fs = require('fs');
const code = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
let idx = code.indexOf("host.includes('linkedin.com')");
console.log('--- At isJobOrCareerPage ---');
console.log(code.substring(idx - 20, idx + 400));

let idxMode = code.indexOf("loc.hostname.includes('linkedin.com')");
console.log('--- At detectPageMode ---');
console.log(code.substring(idxMode - 20, idxMode + 400));
