const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
let idx = 0;
while ((idx = c.indexOf('candidate.full_name', idx)) !== -1) {
  console.log('full_name match at', idx, ':', c.slice(Math.max(0, idx - 100), Math.min(c.length, idx + 200)));
  idx += 19;
}
