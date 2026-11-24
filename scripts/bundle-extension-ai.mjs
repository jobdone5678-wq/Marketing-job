import esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = path.resolve('.');
const outDir = path.join(rootDir, 'jobright_extension/core/ai');
const outfile = path.join(outDir, 'planner-bundle.js');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const entryContent = `
export { planFormBatch, inferQuestionDescriptor } from './src/lib/ai/planner.ts';
export { chooseComboboxOption } from './src/lib/ai/chooser.ts';
export { validateGroundedAnswer } from './src/lib/ai/grounded.ts';
export { buildVerifiedFacts } from './src/lib/ai/verified-facts.ts';
export { ProviderClient, ProviderError } from './src/lib/ai/provider-client.ts';
`;

try {
  await esbuild.build({
    stdin: {
      contents: entryContent,
      resolveDir: rootDir,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    target: ['chrome116', 'es2022'],
    platform: 'browser',
    outfile,
    sourcemap: false,
    logLevel: 'info',
  });

  const stat = fs.statSync(outfile);
  console.log(`Successfully generated ${outfile} (${stat.size} bytes).`);
} catch (err) {
  console.error(`Failed to bundle extension AI module: ${err.message}`);
  process.exit(1);
}
