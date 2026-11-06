const fs = require('fs');
const path = require('path');
const file = path.resolve('jobright_extension', 'contents.d42e7fcf.js');
const content = fs.readFileSync(file, 'utf8');
const idx = content.indexOf('failed to bootstrap helper:');
console.log(content.slice(idx - 1500, idx + 200));
