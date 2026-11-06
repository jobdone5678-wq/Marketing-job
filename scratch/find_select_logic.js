const fs = require('fs');
const code = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

let pos = code.indexOf('if (el.tagName === "SELECT"');
if (pos === -1) pos = code.indexOf('el.tagName');
console.log('pos:', pos);
console.log(code.substring(pos, pos + 800));
