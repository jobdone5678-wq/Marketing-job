const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
let idx = 0;
while ((idx = content.indexOf('fields filled', idx)) !== -1) {
  console.log('fields filled at', idx, ':', content.slice(Math.max(0, idx - 100), Math.min(content.length, idx + 100)));
  idx += 13;
}
while ((idx = content.indexOf('required fields', idx)) !== -1) {
  console.log('required fields at', idx, ':', content.slice(Math.max(0, idx - 100), Math.min(content.length, idx + 100)));
  idx += 15;
}
