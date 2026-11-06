const fs = require('fs');
const ha = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
let idx = 0;
while ((idx = ha.indexOf('82%', idx)) !== -1) {
  console.log('at', idx, ':', ha.slice(Math.max(0, idx - 50), Math.min(ha.length, idx + 80)));
  idx += 3;
}
