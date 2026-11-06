const fs = require('fs');
const code = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

let pos = code.indexOf('function getFillProgressCounts');
if (pos === -1) pos = code.indexOf('getFillProgressCounts');
console.log('pos:', pos);
console.log(code.substring(pos, pos + 1000));
