const fs = require('fs');
const content = fs.readFileSync('src/components/resume-upload-review.tsx', 'utf8');
const lines = content.split('\n');

const emDash = '—';
const newDateBlock = `{(exp.start || exp.end) && (
                    <p className="text-xs text-muted-foreground">
                      {exp.start || 'Start Date'} {exp.start && exp.end && '${emDash}'} {exp.end || 'Present'}
                    </p>
                  )}`;

const newEduDateBlock = `{(edu.start || edu.end) && (
                    <p className="text-xs text-muted-foreground">
                      {edu.start || 'Start Date'} {edu.start && edu.end && '${emDash}'} {edu.end || 'Present'}
                    </p>
                  )}`;

// Process line by line
const newLines = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Fix work experience date
  if (line.includes('{exp.start} — {exp.end}')) {
    // Skip the old <p> wrapper lines and insert new block
    // Line i should be: tab spaces {exp.start} — {exp.end}
    // Line i-1 should be: <p className...>
    // We need to skip line i-1 and i, and insert new block
    if (i > 0 && lines[i-1].includes('<p className="text-xs text-muted-foreground">')) {
      // Remove the <p> line we're replacing
      newLines.pop(); // Remove the last added line (the <p> tag)
      newLines.push(newDateBlock.split('\n')[0]); // Add first line of new block
      newLines.push(newDateBlock.split('\n')[1]);
      newLines.push(newDateBlock.split('\n')[2]);
      newLines.push(newDateBlock.split('\n')[3]);
      newLines.push(newDateBlock.split('\n')[4]);
      newLines.push(newDateBlock.split('\n')[5]);
      continue;
    }
  }

  // Fix education date
  if (line.includes('{edu.start} — {edu.end}')) {
    // Replace the entire line including the JSX tag
    newLines.push(newEduDateBlock.split('\n')[0]);
    continue;
  }

  newLines.push(line);
}

fs.writeFileSync('src/components/resume-upload-review.tsx', newLines.join('\n'));
console.log('Done');