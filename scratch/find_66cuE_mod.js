const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = content.indexOf('\"66cuE\"');
console.log('66cuE at', idx);
console.log(content.slice(idx - 50, idx + 2000));
