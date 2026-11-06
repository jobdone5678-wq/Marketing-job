const fs = require('fs');
const code = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

let pos = 0;
while ((pos = code.indexOf('getFillProgressCounts', pos)) !== -1) {
  console.log('at', pos, code.substring(pos - 30, pos + 80));
  pos += 20;
}
