const fs = require('fs');
const code = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

let pos = code.indexOf('"~store/autofillResult":');
console.log('pos:', pos);
console.log(code.substring(pos, pos + 200));
let modId = code.substring(pos + 25, pos + 35).match(/[a-zA-Z0-9_$]+/)[0];
console.log('modId:', modId);
let defIdx = code.indexOf(modId + ':[function(');
console.log(code.substring(defIdx, defIdx + 600));
