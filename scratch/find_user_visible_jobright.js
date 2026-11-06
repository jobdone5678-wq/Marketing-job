const fs = require('fs');
const c = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const regex = /children:\s*["'][^"']*jobright[^"']*["']/gi;
let m;
while ((m = regex.exec(c)) !== null) {
  console.log(m[0]);
}

const regex2 = /title:\s*["'][^"']*jobright[^"']*["']/gi;
while ((m = regex2.exec(c)) !== null) {
  console.log(m[0]);
}
