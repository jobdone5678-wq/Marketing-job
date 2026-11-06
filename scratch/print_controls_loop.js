const fs = require('fs');
const c = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');
const idx = c.indexOf('// PHONE NUMBER CHECK FIRST');
if (idx !== -1) {
  console.log('Found // PHONE NUMBER CHECK FIRST');
} else {
  const idx2 = c.indexOf('targetVal = phone;');
  console.log('targetVal = phone; at', idx2);
  console.log(c.slice(idx2 - 200, idx2 + 2500));
}
