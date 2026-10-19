import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deflateRawSync} from 'node:zlib';
import {chromium} from '@playwright/test';
import {PDFDocument, StandardFonts} from 'pdf-lib';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
async function extract(t,name,bytes,type='',assetOrigin='https://resume.test') {
 const page=await browser.newPage();t.after(()=>page.close());
 await page.route(/https:\/\/(resume|assets)\.test\//,async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/')return route.fulfill({body:'<!doctype html><title>Import test</title>',contentType:'text/html'});
  try {return route.fulfill({body:await readFile(new URL(`../browser-extension${path}`,import.meta.url)),contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}});} catch {return route.fulfill({status:404,body:''});}
 });
 await page.goto('https://resume.test/');
 await page.evaluate(origin=>{globalThis.chrome={runtime:{getURL:path=>`${origin}/${path}`}};},assetOrigin);
 const code=await readFile(new URL('../browser-extension/resume-import.js',import.meta.url),'utf8').catch(()=> '');
 await page.addScriptTag({content:code});
 return page.evaluate(async ({name,bytes,type})=>{
  if(!globalThis.NextkinResumeImport)return {error:'Resume importer is not available'};
  try{return await globalThis.NextkinResumeImport.extract(new File([new Uint8Array(bytes)],name,{type}));}catch(error){return {error:error.message};}
 },{name,bytes:[...bytes],type});
}
const utf8=text=>Buffer.from(text);
// Removing structured JSON traversal would lose employment history while still accepting the file.
test('structured JSON includes skills, nested employment, and education',async t=>{
 const result=await extract(t,'resume.json',utf8(JSON.stringify({name:'Alex Example',skills:['Python','SQL'],history:[{employer:'Example Co',role:'Engineer',bullets:['Built data pipelines']}],education:{degree:'BSc Computer Science'}})));
 assert.equal(result.error,undefined);for(const value of ['Alex Example','Python','SQL','Example Co','Engineer','Built data pipelines','BSc Computer Science'])assert.ok(result.text.includes(value),value);
});
test('text and Markdown retain candidate details',async t=>{
 for(const name of ['resume.txt','resume.md'])assert.equal((await extract(t,name,utf8('Alex Example\nBuilt Python systems.'))).text,'Alex Example\nBuilt Python systems.');
});
test('compressed PDF content is extracted through a real PDF parser',async t=>{
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),page=doc.addPage();page.drawText('Alex Example - Python Engineer',{x:50,y:700,size:12,font});
 const result=await extract(t,'resume.pdf',await doc.save());assert.equal(result.error,undefined);assert.match(result.text,/Alex Example - Python Engineer/);
});
test('PDF extraction loads its local worker across the page origin boundary',async t=>{
 const doc=await PDFDocument.create();doc.addPage().drawText('Alex Example cross-origin resume');
 const result=await extract(t,'resume.pdf',await doc.save(),'','https://assets.test');
 assert.equal(result.error,undefined);assert.match(result.text,/Alex Example cross-origin resume/);
});
function descriptorDocx(xml) {
 const name=Buffer.from('word/document.xml'),raw=Buffer.from(xml),compressed=deflateRawSync(raw);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,6);local.writeUInt16LE(8,8);local.writeUInt16LE(name.length,26);
 const descriptor=Buffer.alloc(16);descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(compressed.length,8);descriptor.writeUInt32LE(raw.length,12);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,8);central.writeUInt16LE(8,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);
 const offset=local.length+name.length+compressed.length+descriptor.length,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([local,name,compressed,descriptor,central,name,end]);
}
test('DOCX central directory handles data descriptors and XML paragraphs/entities',async t=>{
 const result=await extract(t,'resume.docx',descriptorDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Alex &amp; Example</w:t></w:r></w:p><w:p><w:r><w:t>Python Engineer</w:t></w:r></w:p></w:body></w:document>'));
 assert.equal(result.error,undefined);assert.equal(result.text,'Alex & Example\nPython Engineer');
});
test('unreadable and scanned PDFs request pasted text instead of guessing binary',async t=>{
 const doc=await PDFDocument.create();doc.addPage();
 for(const bytes of [await doc.save(),utf8('%PDF-1.7\nAlex Example is only arbitrary binary metadata')]) {
  const result=await extract(t,'resume.pdf',bytes);assert.match(result.error,/paste.*text/i);assert.equal(result.text,undefined);
 }
});
test('rejects oversized, unsupported, malformed JSON and empty text files',async t=>{
 for(const [name,bytes,pattern] of [['resume.exe',utf8('Alex Example'),/TXT|supported/i],['resume.json',utf8('{broken'),/JSON/i],['resume.txt',utf8('   '),/text/i]])assert.match((await extract(t,name,bytes)).error,pattern);
 const page=await browser.newPage();t.after(()=>page.close());await page.goto('about:blank');await page.addScriptTag({content:await readFile(new URL('../browser-extension/resume-import.js',import.meta.url),'utf8').catch(()=> '')});
 const error=await page.evaluate(async()=>{try{await globalThis.NextkinResumeImport?.extract(new File([new Uint8Array(10*1024*1024+1)],'large.txt'));return '';}catch(e){return e.message;}});assert.match(error,/10 MB/i);
});
