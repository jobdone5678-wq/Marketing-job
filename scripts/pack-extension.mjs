import fs from 'node:fs';
import path from 'node:path';
import * as fflate from 'fflate';

const manifestPath = path.resolve('jobright_extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version || '3.3.19';

const sourceDir = path.resolve('jobright_extension');
const distDir = path.resolve('dist');
const targetZip = path.join(distDir, `jobright_extension-v${version}.zip`);

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

function getFiles(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = {};
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      Object.assign(result, getFiles(fullPath, relPath));
    } else {
      if (entry.name.endsWith('.md') || entry.name.startsWith('.') || entry.name.includes('.env')) continue;
      result[relPath] = fs.readFileSync(fullPath);
    }
  }
  return result;
}

const files = getFiles(sourceDir);
const zipped = fflate.zipSync(files, { level: 9 });

fs.writeFileSync(targetZip, zipped);
console.log(`Created ${targetZip} (${zipped.length} bytes) successfully!`);
