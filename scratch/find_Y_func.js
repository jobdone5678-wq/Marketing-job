const fs = require('fs');
const path = require('path');
const file = path.resolve('jobright_extension', 'contents.d42e7fcf.js');
const content = fs.readFileSync(file, 'utf8');
const idx = content.indexOf('failed to activate helper runtime:');
console.log(content.slice(idx - 2500, idx - 1000));
