const fs = require('fs');
const path = require('path');
const file = path.resolve('jobright_extension', 'contents.d42e7fcf.js');
const content = fs.readFileSync(file, 'utf8');
const regex = /(?:function\s+Y\b|Y\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;
let m;
while ((m = regex.exec(content)) !== null) {
  console.log('Found Y at', m.index, ':', content.slice(m.index, m.index + 200));
}
