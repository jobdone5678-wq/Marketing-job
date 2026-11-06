const fs = require('fs');
const path = require('path');
const file = path.resolve('jobright_extension', 'helper-app.41ea2652.js');
const content = fs.readFileSync(file, 'utf8');
const idx = content.indexOf('function eH(');
console.log(content.slice(idx, idx + 1000));
