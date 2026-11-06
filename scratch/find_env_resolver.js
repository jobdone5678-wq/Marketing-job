const fs = require('fs');
const code = fs.readFileSync('jobright_extension/static/background/index.js', 'utf8');
let pos = code.indexOf('"~api/env-resolver":');
console.log(code.substring(pos, pos + 100));
let modId = code.substring(pos + 20, pos + 30).match(/[a-zA-Z0-9_$]+/)[0];
console.log('modId:', modId);
let defIdx = code.indexOf(modId + ':[function(');
console.log(code.substring(defIdx, defIdx + 600));
