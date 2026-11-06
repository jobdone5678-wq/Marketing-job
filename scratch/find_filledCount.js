const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
let idx = 0;
while ((idx = c.indexOf('filledCount++', idx)) !== -1) {
  console.log('filledCount++ at', idx, ':', c.slice(Math.max(0, idx - 80), Math.min(c.length, idx + 80)));
  idx += 13;
}
