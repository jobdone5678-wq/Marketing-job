import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const extensionDir = path.resolve('extension');
const result = spawnSync('pnpm', ['zip'], {
  cwd: extensionDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const outputDir = path.join(extensionDir, '.output');
if (fs.existsSync(outputDir)) {
  const zips = fs.readdirSync(outputDir).filter((file) => file.endsWith('.zip'));
  console.log(`Packaged WXT extension artifacts: ${zips.join(', ') || 'built in extension/.output'}`);
}
