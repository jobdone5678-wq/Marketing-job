import esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, 'dist');
const vendorDir = join(outDir, 'vendor');

// Clean and create output directories
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(vendorDir, { recursive: true });

// Build resume-import.js with mammoth + pdfjs-dist bundled
await esbuild.build({
  entryPoints: [join(__dirname, 'resume-import.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'NextkinResumeImport',
  outfile: join(outDir, 'resume-import.bundle.js'),
  external: ['chrome'],
  define: {
    'process.env.NODE_ENV': '"production"',
    'global': 'globalThis',
  },
  // pdf.js worker needs to be copied separately
  loader: {
    '.mjs': 'js',
    '.wasm': 'file',
  },
  conditions: ['browser', 'module', 'import'],
  mainFields: ['browser', 'module', 'main'],
  target: 'chrome100',
  minify: true,
  sourcemap: true,
});

// Copy pdf.js worker to vendor directory
const pdfjsWorkerSrc = join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const pdfjsWorkerDest = join(vendorDir, 'pdf.worker.min.mjs');
if (existsSync(pdfjsWorkerSrc)) {
  copyFileSync(pdfjsWorkerSrc, pdfjsWorkerDest);
  console.log('Copied pdf.worker.min.mjs');
} else {
  console.warn('pdf.worker.min.mjs not found at', pdfjsWorkerSrc);
}

// Copy pdf.js main file (ESM) for dynamic import fallback
const pdfjsMainSrc = join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.mjs');
const pdfjsMainDest = join(vendorDir, 'pdf.min.mjs');
if (existsSync(pdfjsMainSrc)) {
  copyFileSync(pdfjsMainSrc, pdfjsMainDest);
  console.log('Copied pdf.min.mjs');
}

console.log('Build complete! Output in dist/');