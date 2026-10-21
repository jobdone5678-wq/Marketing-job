import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {zipSync,unzipSync,strFromU8} from 'fflate';

const root=fileURLToPath(new URL('../browser-extension/',import.meta.url));
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(manifest.version))throw new Error('Invalid extension version.');
const files={};
async function include(directory=''){
 for(const entry of await readdir(path.join(root,directory),{withFileTypes:true})){
  const relative=path.posix.join(directory,entry.name);
  if(entry.isDirectory())await include(relative);
  else if(!relative.endsWith('.d.ts'))files[relative]=new Uint8Array(await readFile(path.join(root,relative)));
 }
}
await include();
const bytes=zipSync(files,{level:6});
const verified=unzipSync(bytes);
const includedManifest=JSON.parse(strFromU8(verified['manifest.json']));
for(const filename of ['background.js','resume-engine.js','candidate-context.js','job-context.js','fill-session.js','embedded-support.js','stripe-job.js','frame-agent.js','form-discovery.js','field-mapping.js','field-writer.js','adapters/generic.js','adapters/greenhouse.js','adapters/lever.js','adapters/ashby.js','adapters/workday.js','resume-workflows.js','resume-import.js','popup-resumes.js','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs'])if(!verified[filename])throw new Error('Missing runtime asset: '+filename);
if(includedManifest.version!==manifest.version)throw new Error('Package verification failed.');
const output=fileURLToPath(new URL(`../browser-extension-v${manifest.version}.zip`,import.meta.url));
await writeFile(output,bytes);
console.log(`Packaged ${Object.keys(verified).length} files, ${bytes.length} bytes: ${output}`);
