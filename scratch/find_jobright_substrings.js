const fs = require('fs');
const c = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
let idx = 0;
while ((idx = c.indexOf('Jobright', idx)) !== -1) {
  console.log(idx, '->', c.slice(Math.max(0, idx - 40), idx + 60));
  idx += 8;
}
