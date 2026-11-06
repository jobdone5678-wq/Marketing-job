const fs = require('fs');
const code = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

let pos = code.indexOf('el.tagName.toLowerCase() === "select"');
if (pos === -1) pos = code.indexOf("el.tagName.toLowerCase() === 'select'");
if (pos === -1) pos = code.indexOf('tagName === "SELECT"');
if (pos === -1) pos = code.indexOf("tagName === 'SELECT'");
if (pos === -1) pos = code.indexOf('setNativeSelect');
console.log('pos:', pos);
console.log(code.substring(pos, pos + 800));
