const fs = require('fs');
const code = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

let pos = code.indexOf('"66cuE":[') + 2500;
console.log(code.substring(pos, pos + 2000));
