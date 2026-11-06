const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = content.indexOf('function x(');
if (idx !== -1) {
  console.log(content.slice(idx, idx + 1000));
} else {
  const idx2 = content.indexOf('function C(');
  console.log('from C:', content.slice(idx2, idx2 + 1500));
}
