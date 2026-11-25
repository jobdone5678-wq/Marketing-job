import fs from 'node:fs';

const files = [
  'jobright_extension/core/site-registry.js',
  'jobright_extension/core/site-rules.js',
  'jobright_extension/adapters/ats-adapters.js',
  'jobright_extension/core/job-capture.js',
  'jobright_extension/core/field-mapping.js',
  'jobright_extension/core/field-writer.js',
  'jobright_extension/core/form-discovery.js',
  'jobright_extension/core/application.js'
];

const bundleContent = files
  .map(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    return `// === File: ${filePath} ===\n${content}`;
  })
  .join('\n\n');

fs.writeFileSync('tests/autofill-bundle.js', bundleContent);
console.log(`Successfully generated tests/autofill-bundle.js (${bundleContent.length} bytes) from ${files.length} sources.`);
