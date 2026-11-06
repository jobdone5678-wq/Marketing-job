const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
let idx = 0;
while ((idx = c.indexOf('data-nextkin-filled', idx)) !== -1) {
  console.log('at', idx, ':', c.slice(Math.max(0, idx - 40), Math.min(c.length, idx + 80)));
  idx += 19;
}
