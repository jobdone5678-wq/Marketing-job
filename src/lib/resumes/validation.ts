import {unzipSync,zipSync} from 'fflate';
import mammoth from 'mammoth';

// Only these controlled validation messages may be shown to an uploader.
export class ResumeReadError extends Error {}

export function hasPdfHeader(raw:Buffer):boolean {
  return raw.subarray(0,1024).indexOf(Buffer.from('%PDF-'))>=0;
}

export async function readResume(raw:Buffer,filename:string):Promise<{text:string;pages:number|null;mime:string}> {
  if(raw.length>10*1024*1024)throw new ResumeReadError('Resume must be at most 10 MiB.');
  if(/\.pdf$/i.test(filename)) {
    if(!hasPdfHeader(raw))throw new ResumeReadError('The selected file does not contain a PDF header. Choose a valid PDF file.');
    let document;let loadingTask;
    try {
      const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
      loadingTask=getDocument({
        data:new Uint8Array(raw),
        useWorkerFetch:false,
        disableFontFace:true,
        stopAtErrors:false,
        verbosity:0,
      });
      document=await loadingTask.promise;
      if(document.numPages>20)throw new ResumeReadError('Resume must contain at most 20 pages.');
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
      const text=pages.join('\n');if(text.length>500000)throw new ResumeReadError('Resume text exceeds the processing limit.');
      return {text,pages:document.numPages,mime:'application/pdf'};
    } catch(error: unknown) {
      if(error instanceof ResumeReadError)throw error;
      const message=error instanceof Error?error.message:'';
      const name=error instanceof Error?error.name:'';
      const isPassword = name === 'PasswordException' || /password/i.test(message);
      if (isPassword) {
        throw new ResumeReadError('Upload a valid PDF without password protection.');
      }
      console.error('[readResume] PDF parse error:', error);
      throw new ResumeReadError('This PDF could not be read. Re-save or print it as a new PDF, then upload the new copy.');
    } finally {
      // Cleanup must not replace a useful parser error or discard successfully extracted text.
      try {await loadingTask?.destroy();} catch {}
    }
  }
  if(/\.docx$/i.test(filename)) {
    if(raw.subarray(0,4).toString('hex')!=='504b0304')throw new ResumeReadError('Upload a valid DOCX.');
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
    } catch {throw new ResumeReadError('Upload a valid DOCX with readable text and no more than 20 MiB of expanded content.');}
  }
  throw new ResumeReadError('Upload a PDF or DOCX resume.');
}
