const fs = require('fs');
const path = 'jobright_extension/helper-app.41ea2652.js';
let content = fs.readFileSync(path, 'utf8');
const regex = /var portalCandidates=\[\s*\{id:\"candidate\"[\s\S]*?\{id:\"sarah\"[^\}]*\}\s*\];/;
if (regex.test(content)) {
  content = content.replace(regex, 'var portalCandidates=[{id:"candidate",name:"",role:"Active Candidate",email:"",phone:"",city:"San Francisco, CA"}];');
  fs.writeFileSync(path, content, 'utf8');
  console.log('Replaced portalCandidates cleanly');
} else {
  console.log('Regex did not match');
}
