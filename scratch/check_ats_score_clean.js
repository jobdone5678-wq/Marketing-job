const fs = require('fs');
const ha = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const oje = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

console.log('ha 82% occurrences:', (ha.match(/82%/g) || []).length);
console.log('ha Math.max(score occurrences:', (ha.match(/Math\.max\([^)]*score/g) || []).length);
console.log('ha hardcoded 82:', (ha.match(/\b82\b/g) || []).length);
console.log('oje 82% occurrences:', (oje.match(/82%/g) || []).length);
