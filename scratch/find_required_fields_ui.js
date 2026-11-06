const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = content.indexOf('required fields filled');
console.log(content.slice(idx - 600, idx + 600));
