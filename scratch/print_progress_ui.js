const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
console.log(content.slice(3030000, 3032500));
