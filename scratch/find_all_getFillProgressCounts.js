const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
let idx = 0;
while ((idx = content.indexOf('getFillProgressCounts', idx)) !== -1) {
  console.log('at', idx, ':', content.slice(Math.max(0, idx - 50), Math.min(content.length, idx + 80)));
  idx += 21;
}
