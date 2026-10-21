import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
test('shared extension source required by portal imports remains present',()=>{
 for(const file of ['resume-engine.js','resume-engine.d.ts','resume-import.js','content.js','manifest.json'])assert.ok(existsSync(path.resolve('browser-extension',file)),'Missing required source: '+file);
 const manifest=JSON.parse(readFileSync('browser-extension/manifest.json','utf8'));
 for(const entry of manifest.content_scripts)for(const file of entry.js)assert.ok(existsSync(path.resolve('browser-extension',file)),file);
});
