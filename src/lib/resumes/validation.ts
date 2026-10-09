import {unzipSync,zipSync} from 'fflate';
import mammoth from 'mammoth';

export async function readResume(raw:Buffer,filename:string):Promise<{text:string;pages:number|null;mime:string}> {
  if(raw.length>10*1024*1024)throw new Error('Resume must be at most 10 MiB.');
  if(/\.pdf$/i.test(filename)) {
    if(raw.subarray(0,5).toString()!=='%PDF-')throw new Error('Upload a valid PDF.');
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    let document;let loadingTask;
    try {
      loadingTask=getDocument({
        data:new Uint8Array(raw),
        useWorkerFetch:false,
        disableFontFace:true,
        stopAtErrors:false,
        verbosity:0,
      });
      document=await loadingTask.promise;
      if(document.numPages>20)throw new Error('Resume must contain at most 20 pages.');
      const pages=[];
      for(let number=1;number<=document.numPages;number++) {
        try {
          const page=await document.getPage(number);
          const content=await page.getTextContent();
          pages.push(content.items.filter(item=>'str' in item).map(item=>'str' in item?item.str:'').join(' '));
        } catch (pageError) {
          console.warn(`[readResume] Warning extracting page ${number}:`, pageError);
          pages.push('');
        }
      }
      const text=pages.join('\n');if(text.length>500000)throw new Error('Resume text exceeds the processing limit.');
      return {text,pages:document.numPages,mime:'application/pdf'};
    } catch(error: any) {
      if(error instanceof Error && /20 pages|processing limit/.test(error.message))throw error;
      const isPassword = error?.name === 'PasswordException' || /password/i.test(error?.message || '');
      if (isPassword) {
        throw new Error('Upload a valid PDF without password protection.');
      }
      console.error('[readResume] PDF parse error:', error?.message || error);
      throw new Error('Upload a valid PDF.');
    } finally {await loadingTask?.destroy();}
  }
  if(/\.docx$/i.test(filename)) {
    if(raw.subarray(0,4).toString('hex')!=='504b0304')throw new Error('Upload a valid DOCX.');
    try {
      // Inspect every ZIP entry's declared size before allowing mammoth to decompress it.
      let expanded=0;
      const entries=unzipSync(raw,{filter:file=>{
        expanded+=file.originalSize;
        if(expanded>20*1024*1024)throw new Error('DOCX expanded size exceeds the processing limit.');
        return ['[Content_Types].xml','word/document.xml'].includes(file.name);
      }});
      if(!entries['[Content_Types].xml']||!entries['word/document.xml'])throw new Error('Not a Word document.');
      if(Object.values(entries).some(entry=>entry.length>20*1024*1024))throw new Error('Expanded size limit.');
      const {value:text}=await mammoth.extractRawText({buffer:Buffer.from(zipSync(entries))});
      if(!text.trim()||text.length>500000)throw new Error('No readable document text.');
      return {text,pages:null,mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
    } catch {throw new Error('Upload a valid DOCX with readable text and no more than 20 MiB of expanded content.');}
  }
  throw new Error('Upload a PDF or DOCX resume.');
}
