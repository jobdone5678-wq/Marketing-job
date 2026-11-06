const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
let idx = 0;
while ((idx = content.indexOf('addEventListener("message"', idx)) !== -1) {
  console.log('addEventListener match at', idx, ':', content.slice(Math.max(0, idx - 80), Math.min(content.length, idx + 180)));
  idx += 24;
}
