const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
let idx = 0;
while ((idx = c.indexOf('SELECT', idx)) !== -1) {
  console.log('SELECT match at', idx, ':', c.slice(Math.max(0, idx - 80), Math.min(c.length, idx + 100)));
  idx += 6;
}
