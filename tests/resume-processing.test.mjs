import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {zipSync,strToU8} from 'fflate';
const load=()=>import('../src/lib/resumes/validation.ts');
test('valid PDF text is extracted and PDF page/size limits are enforced',async()=>{
  const {readResume}=await load();const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Alex Example | alex@example.test | SQL Python',{font});
  const parsed=await readResume(Buffer.from(await pdf.save()),'resume.pdf');assert.ok(parsed.text.includes('Alex Example'));assert.equal(parsed.pages,1);
  for(let i=0;i<20;i++)pdf.addPage();await assert.rejects(readResume(Buffer.from(await pdf.save()),'resume.pdf'),/20 pages/);
  await assert.rejects(readResume(Buffer.alloc(10*1024*1024+1),'resume.pdf'),/10 MiB/);
  await assert.rejects(readResume(Buffer.from('not a PDF'),'resume.pdf'),/valid PDF/);
});
test('DOCX signature and actual document content are validated',async()=>{
  const {readResume}=await load();
  const archive=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Alex Example</w:t></w:r></w:p></w:body></w:document>')});
  assert.ok((await readResume(Buffer.from(archive),'resume.docx')).text.includes('Alex Example'));
  await assert.rejects(readResume(Buffer.from(zipSync({'other.txt':strToU8('hello')})),'resume.docx'),/valid DOCX/);
});
test('AI extraction keeps missing facts unknown and rejects unsupported evidence',async()=>{
  const {validateResumeExtraction,estimateExperience}=await import('../src/lib/ai/schemas.ts');
  const extracted=validateResumeExtraction({fields:{full_name:'Alex Example',visa_status:'H1B'},evidence:[{field:'full_name',snippet:'Alex Example',page:1},{field:'visa_status',snippet:'H1B approved',page:1}],employmentHistory:[],educationHistory:[],warnings:[]},'Alex Example\nSQL');
  assert.equal(extracted.fields.full_name,'Alex Example');assert.equal(extracted.fields.visa_status,null);assert.equal(extracted.fields.authorized_in_usa,null);
  assert.equal(estimateExperience([{start:'2020-01',end:'2022-01'},{start:'2021-01',end:'2023-01'}]),3);
  assert.equal(estimateExperience([{start:'2020',end:null}]),null);
});
