import fs from 'node:fs';
import path from 'node:path';
import * as fflate from 'fflate';

function getFiles(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = {};
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(result, getFiles(fullPath, relPath));
    } else {
      result[relPath] = fs.readFileSync(fullPath);
    }
  }
  return result;
}

const sourceDir = path.resolve('jobright_extension');
const targetZip = path.resolve('jobright_extension.zip');

const files = getFiles(sourceDir);
const zipped = fflate.zipSync(files, { level: 6 });

fs.writeFileSync(targetZip, zipped);
console.log(`Created ${targetZip} (${zipped.length} bytes) successfully!`);
