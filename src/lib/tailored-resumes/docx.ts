import {zipSync,strToU8} from 'fflate';
const xml=(value:string)=>value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
/** Standards-compliant Word package with professional resume formatting: styled headings, contact info, skills, experience entries, and real bullets. */
export function resumeDocx(content:string):Uint8Array{
 const HEADINGS=new Set(['PROFESSIONAL SUMMARY','SKILLS','EXPERIENCE','EDUCATION','CERTIFICATIONS']);
 const paragraphs=content.split(/\r?\n/).map((line,index)=>{
  const trimmed=line.trim();
  const heading=HEADINGS.has(trimmed);
  const bullet=/^[-•]\s/.test(line);
  const isContactLine=index===1&&trimmed.includes(' | ');
  const isTargetRole=trimmed.startsWith('Target role:');
  // Experience entry with pipe separator (title | company) under EXPERIENCE heading
  const isExpEntry=!heading&&trimmed.includes(' | ')&&!isContactLine;
  // Date range line (contains year and dash)
  const isDateLine=!heading&&!isContactLine&&!isExpEntry&&/\d{4}/.test(trimmed)&&trimmed.includes('–');

  let pProps='';
  let runs='';

  if(index===0){
   // Name - Title style, larger font
   pProps='<w:pStyle w:val="Title"/><w:jc w:val="center"/>';
   runs=`<w:r><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/><w:color w:val="1A1A2E"/></w:rPr><w:t xml:space="preserve">${xml(trimmed)}</w:t></w:r>`;
  }else if(isContactLine){
   // Contact info - centered, smaller, gray
   pProps='<w:jc w:val="center"/><w:spacing w:after="60"/>';
   const parts=trimmed.split(' | ');
   runs=parts.map((part,j)=>{
    const sep=j<parts.length-1?`<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="999999"/></w:rPr><w:t xml:space="preserve">  ·  </w:t></w:r>`:'';
    return `<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve">${xml(part.trim())}</w:t></w:r>${sep}`;
   }).join('');
  }else if(isTargetRole){
   // Target role - styled accent
   pProps='<w:spacing w:before="120" w:after="60"/><w:shd w:val="clear" w:color="auto" w:fill="EBF0FF"/><w:ind w:left="120" w:right="120"/>';
   const roleText=trimmed.replace('Target role:','').trim();
   runs=`<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">Target role: </w:t></w:r><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="2563EB"/></w:rPr><w:t xml:space="preserve">${xml(roleText)}</w:t></w:r>`;
  }else if(heading){
   // Section heading - bold, uppercase, blue bottom border
   pProps='<w:pStyle w:val="Heading1"/>';
   runs=`<w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="1A1A2E"/></w:rPr><w:t xml:space="preserve">${xml(trimmed)}</w:t></w:r>`;
  }else if(isExpEntry){
   // Experience entry - bold title, lighter company
   const parts=trimmed.split(' | ');
   pProps='<w:spacing w:before="100" w:after="20"/>';
   runs=`<w:r><w:rPr><w:b/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr><w:t xml:space="preserve">${xml(parts[0]?.trim()||'')}</w:t></w:r>`;
   if(parts[1])runs+=`<w:r><w:rPr><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve"> | ${xml(parts[1].trim())}</w:t></w:r>`;
   if(parts[2])runs+=`<w:r><w:rPr><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve"> | ${xml(parts[2].trim())}</w:t></w:r>`;
  }else if(isDateLine){
   // Date range - italic, muted
   pProps='<w:spacing w:after="40"/>';
   runs=`<w:r><w:rPr><w:i/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="888888"/></w:rPr><w:t xml:space="preserve">${xml(trimmed)}</w:t></w:r>`;
  }else if(bullet){
   // Bullet point
   pProps='<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="40"/>';
   runs=`<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${xml(line.slice(2))}</w:t></w:r>`;
  }else if(!trimmed){
   // Blank line - small spacer
   pProps='<w:spacing w:before="40" w:after="40"/>';
   runs='<w:r><w:t></w:t></w:r>';
  }else{
   // Default text
   pProps='<w:spacing w:after="40"/>';
   runs=`<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${xml(line)}</w:t></w:r>`;
  }
  return `<w:p><w:pPr>${pProps}</w:pPr>${runs}</w:p>`;
 }).join('');
 const files:Record<string,string>={
  '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>',
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>',
  'word/document.xml':`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="900" w:right="1080" w:bottom="900" w:left="1080"/></w:sectPr></w:body></w:document>`,
  'word/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="333333"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/><w:color w:val="1A1A2E"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="2563EB"/></w:pBdr></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="1A1A2E"/></w:rPr></w:style></w:styles>',
  'word/numbering.xml':'<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:rPr><w:color w:val="2563EB"/></w:rPr><w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>',
 };
 return zipSync(Object.fromEntries(Object.entries(files).map(([path,value])=>[path,strToU8(value)])));
}
