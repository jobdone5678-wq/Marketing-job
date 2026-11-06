const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = content.indexOf('n.export(r,"getFillProgressCounts",()=>x)');
console.log(content.slice(idx - 1000, idx + 2000));
