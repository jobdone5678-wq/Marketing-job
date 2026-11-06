const fs = require('fs');
const content = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');
const idx = content.indexOf('function getFillProgressCounts(');
if (idx !== -1) {
  console.log(content.slice(idx, idx + 800));
} else {
  let idx2 = content.indexOf('getFillProgressCounts:');
  if (idx2 === -1) idx2 = content.indexOf('getFillProgressCounts');
  console.log('at', idx2, content.slice(idx2 - 100, idx2 + 500));
}
