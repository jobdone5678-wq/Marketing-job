const fs = require('fs');
const path = require('path');
const file = path.resolve('jobright_extension', 'contents.d42e7fcf.js');
const content = fs.readFileSync(file, 'utf8');
const idx = content.indexOf('let t=await Q()');
console.log(content.slice(idx - 600, idx + 100));
