const fs = require('fs');
const c = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = c.indexOf('function s({entryFunction:e})');
console.log('Index of function s:', idx);

const moduleEnd = c.indexOf('},{"', idx);
console.log('moduleEnd:', moduleEnd);
console.log('Code near module end:\n', c.slice(moduleEnd - 300, moduleEnd + 200));
