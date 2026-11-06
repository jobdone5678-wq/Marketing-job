const fs = require('fs');
const code = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

let pos = 3052998;
console.log(code.substring(pos - 1500, pos + 200));
