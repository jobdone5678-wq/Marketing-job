import type {Candidate} from '@/types/database';

function text(value:unknown):string {return typeof value==='string'?value.trim():'';}
function history(rows:Record<string,unknown>[]|undefined,keys:string[]) {
 return (rows||[]).map(row=>[keys.map(key=>text(row[key])).filter(Boolean).join(' · '),[text(row.start),text(row.end)].filter(Boolean).join(' – '),text(row.description),Array.isArray(row.bullets)?row.bullets.filter((v):v is string=>typeof v==='string').map(v=>`- ${v}`).join('\n'):''].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
}
export function candidateResumeMarkdown(candidate:Candidate):string {
 if(candidate.provenance_status!=='confirmed')throw new Error('Review and confirm this profile before exporting a resume.');
 const summary=text(candidate.confirmed_facts?.summary);
 const employment=history(candidate.employment_history,['title','employer','location']);
 const education=history(candidate.education_history,['degree','institution','school']);
 return [`# ${candidate.full_name}`,candidate.current_job_title||candidate.target_job_titles,[candidate.email,candidate.phone,[candidate.current_city,candidate.current_state].filter(Boolean).join(', '),candidate.linkedin_url].filter(Boolean).join(' · '),summary&&`## Professional summary\n${summary}`,candidate.primary_skills&&`## Core skills\n${candidate.primary_skills}`,candidate.secondary_skills&&`## Additional skills\n${candidate.secondary_skills}`,employment&&`## Professional experience\n${employment}`,education&&`## Education\n${education}`,candidate.certifications&&`## Certifications\n${candidate.certifications}`].filter(Boolean).join('\n\n');
}
export function downloadBytes(bytes:Uint8Array,mime:string,filename:string) {
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:mime}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function exportCandidateResume(candidate:Candidate,format:'docx'|'pdf') {
 const content=candidateResumeMarkdown(candidate);
 const filename=`${candidate.full_name.replace(/[^\p{L}\p{N}_-]+/gu,'_')}_Profile.${format}`;
 if(format==='docx') {
  const {resumeDocx}=await import('../../browser-extension/resume-engine.js');
  downloadBytes(resumeDocx(content),'application/vnd.openxmlformats-officedocument.wordprocessingml.document',filename);return;
 }
 const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
 const document=await PDFDocument.create();const normal=await document.embedFont(StandardFonts.Helvetica);const bold=await document.embedFont(StandardFonts.HelveticaBold);
 // Fail explicitly for unsupported scripts instead of corrupting candidate names or facts.
 try{normal.encodeText(content.replace(/\n/g,' '));}catch{throw new Error('PDF export cannot render this script. Download DOCX to preserve all characters.');}
 let page=document.addPage([612,792]);let y=744;
 for(const line of content.split('\n')) {
  const heading=line.startsWith('#');const font=heading?bold:normal;const size=line.startsWith('# ')?21:heading?11:10;
  const clean=line.replace(/^#{1,3}\s+/,'');let current='';const lines:string[]=[];
  for(const word of clean.split(/\s+/)) {
   // Split long URLs/tokens as well as normal words to keep every line inside the page.
   for(const character of `${current?' ':''}${word}`) {
    if(font.widthOfTextAtSize(current+character,size)>516&&current){lines.push(current);current='';}
    current+=character;
   }
  }
  lines.push(current);
  for(const row of lines){if(y<52){page=document.addPage([612,792]);y=744;}page.drawText(row,{x:48,y,size,font,color:rgb(.09,.12,.17)});y-=size+5;}
  if(heading)y-=3;
 }
 document.setTitle(`${candidate.full_name} — Profile resume`);
 downloadBytes(await document.save(),'application/pdf',filename);
}
