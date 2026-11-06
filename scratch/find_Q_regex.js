const fs = require('fs');
const path = require('path');
const file = path.resolve('jobright_extension', 'contents.d42e7fcf.js');
const content = fs.readFileSync(file, 'utf8');
const regex = /(?:function\s+Q\b|Q\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;
let m;
while ((m = regex.exec(content)) !== null) {
  console.log('Found Q at', m.index, ':', content.slice(m.index, m.index + 200));
}
