const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
let idx = 0;
while ((idx = content.indexOf('Total experience', idx)) !== -1) {
  console.log('Total experience match at', idx, ':', content.slice(Math.max(0, idx - 100), Math.min(content.length, idx + 150)));
  idx += 16;
}
