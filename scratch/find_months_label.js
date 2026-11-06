const fs = require('fs');
const files = fs.readdirSync('jobright_extension').filter(f => f.endsWith('.js'));
for (const f of files) {
  const content = fs.readFileSync('jobright_extension/' + f, 'utf8');
  if (content.includes('(Months)') || content.includes('(Years)')) {
    console.log('Found in:', f);
  }
}
