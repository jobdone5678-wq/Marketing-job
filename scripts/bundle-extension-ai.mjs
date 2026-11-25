import esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = path.resolve('.');
const outDir = path.join(rootDir, 'jobright_extension/core/ai');
const outfile = path.join(outDir, 'planner-bundle.js');
const distDir = path.join(rootDir, 'dist');
const metafilePath = path.join(distDir, 'planner-bundle.meta.json');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const entryContent = `
export { planFormBatch, inferQuestionDescriptor } from './src/lib/ai/planner.ts';
export { chooseComboboxOption } from './src/lib/ai/chooser.ts';
export { validateGroundedAnswer } from './src/lib/ai/grounded.ts';
export { buildVerifiedFacts } from './src/lib/ai/verified-facts.ts';
export { ProviderClient, ProviderError } from './src/lib/ai/provider-client.ts';
`;

try {
  const result = await esbuild.build({
    stdin: {
      contents: entryContent,
      resolveDir: rootDir,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    target: ['chrome116', 'es2022'],
    platform: 'browser',
    minifyWhitespace: true,
    minifySyntax: true,
    outfile,
    metafile: true,
    sourcemap: false,
    logLevel: 'info',
  });

  fs.writeFileSync(metafilePath, JSON.stringify(result.metafile, null, 2), 'utf8');

  const stat = fs.statSync(outfile);
  console.log(`Successfully generated ${outfile} (${stat.size} bytes) and metafile ${metafilePath}.`);
} catch (err) {
  console.error(`Failed to bundle extension AI module: ${err.message}`);
  process.exit(1);
}
