import {zipSync,strToU8} from 'fflate';

const xml=(value:string)=>String(value||'')
 .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')
 .replace(/&/g,'&amp;')
 .replace(/</g,'&lt;')
 .replace(/>/g,'&gt;')
 .replace(/"/g,'&quot;')
 .replace(/'/g,'&apos;');

export function buildResumeBodyXml(content:string):string{
 const HEADINGS=/^(?:PROFESSIONAL SUMMARY|TECHNICAL SKILLS|SKILLS|CORE SKILLS|PROFESSIONAL EXPERIENCE|EXPERIENCE|EMPLOYMENT(?: HISTORY)?|EDUCATION & CERTIFICATIONS|EDUCATION|CERTIFICATIONS|PROJECTS?|PROJECT|SOURCE RESUME|ADDITIONAL INFORMATION)$/i;
 const rawLines=content.split(/\r?\n/);
 const elements:string[]=[];

 let inHeading='';
 let i=0;
 let contactDividerRendered=false;

 const tblPr=(w1:number,w2:number)=>`
  <w:tblPr>
   <w:tblW w:type="auto" w:w="0"/>
   <w:jc w:val="center"/>
   <w:tblLayout w:type="fixed"/>
   <w:tblLook w:firstColumn="1" w:firstRow="1" w:lastColumn="0" w:lastRow="0" w:noHBand="0" w:noVBand="1" w:val="04A0"/>
   <w:tblBorders>
    <w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>
   </w:tblBorders>
  </w:tblPr>
  <w:tblGrid><w:gridCol w:w="${w1}"/><w:gridCol w:w="${w2}"/></w:tblGrid>
 `;

 while(i<rawLines.length){
  const line=rawLines[i];
  const trimmed=line.trim();

  if(!trimmed){
   i++;
   continue;
  }

  // Heading check
  if(HEADINGS.test(trimmed)){
   inHeading=trimmed.toUpperCase();
   elements.push(`
    <w:p>
     <w:pPr><w:pStyle w:val="ResumeHeading"/><w:keepNext/><w:spacing w:before="120" w:after="40"/></w:pPr>
     <w:r><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${xml(trimmed)}</w:t></w:r>
    </w:p>
   `);
   i++;
   continue;
  }

  // Candidate Name (at index 0 or before any section heading)
  if(i===0&&!inHeading){
   elements.push(`
    <w:p>
     <w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr>
     <w:r><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr><w:t xml:space="preserve">${xml(trimmed)}</w:t></w:r>
    </w:p>
   `);
   i++;
   continue;
  }

  // Subtitle (Role Title | Core Skills)
  if(!inHeading&&(trimmed.includes(' • ')||(trimmed.includes(' | ')&&(trimmed===trimmed.toUpperCase()||trimmed.includes('DEVELOPER')||trimmed.includes('ENGINEER'))))){
   elements.push(`
    <w:p>
     <w:pPr><w:spacing w:before="0" w:after="20"/><w:jc w:val="center"/></w:pPr>
     <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="555555"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr><w:t xml:space="preserve">${xml(trimmed)}</w:t></w:r>
    </w:p>
   `);
   i++;
   continue;
  }

  // Contact info
  if(!inHeading&&trimmed.includes(' | ')&&(trimmed.includes('@')||/\d{3}/.test(trimmed)||trimmed.toLowerCase().includes('linkedin'))){
   elements.push(`
    <w:p>
     <w:pPr><w:spacing w:before="0" w:after="80"/><w:jc w:val="center"/></w:pPr>
     <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:color w:val="555555"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr><w:t xml:space="preserve">${xml(trimmed)}</w:t></w:r>
    </w:p>
   `);
   if(!contactDividerRendered){
    elements.push(`
     <w:p>
      <w:pPr><w:spacing w:before="0" w:after="0"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="AEB6BF"/></w:pBdr></w:pPr>
     </w:p>
    `);
    contactDividerRendered=true;
   }
   i++;
   continue;
  }

  // Target role banner
  if(trimmed.startsWith('Target role:')){
   const roleText=trimmed.replace('Target role:','').trim();
   elements.push(`
    <w:p>
     <w:pPr><w:spacing w:before="60" w:after="40"/><w:shd w:val="clear" w:color="auto" w:fill="EBF0FF"/><w:ind w:left="120" w:right="120"/></w:pPr>
     <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">Target role: </w:t></w:r>
     <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="1F3752"/></w:rPr><w:t xml:space="preserve">${xml(roleText)}</w:t></w:r>
    </w:p>
   `);
   i++;
   continue;
  }

  // Markdown Table Row: | col1 | col2 |
  if(trimmed.startsWith('|')&&trimmed.endsWith('|')){
   const isExpRow=inHeading.includes('EXPERIENCE')||/(?:—|--|\d{4}|present)/i.test(trimmed);

   if(isExpRow){
    const parts=trimmed.split('|').slice(1,-1).map(s=>s.trim());
    const leftText=parts[0]||'';
    const rightText=parts[1]||'';

    let titlePart=leftText;
    let companyPart='';
    if(leftText.includes(' — ')){
     const dashIdx=leftText.indexOf(' — ');
     titlePart=leftText.substring(0,dashIdx).trim();
     companyPart='  —  '+leftText.substring(dashIdx+3).trim();
    }else if(leftText.includes(' - ')){
     const dashIdx=leftText.indexOf(' - ');
     titlePart=leftText.substring(0,dashIdx).trim();
     companyPart='  —  '+leftText.substring(dashIdx+3).trim();
    }

    elements.push(`
     <w:tbl>
      ${tblPr(6984,2880)}
      <w:tr>
       <w:trPr><w:cantSplit/></w:trPr>
       <w:tc>
        <w:tcPr><w:tcW w:type="dxa" w:w="6984"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p>
         <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
         <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr><w:t xml:space="preserve">${xml(titlePart)}</w:t></w:r>
         ${companyPart?`<w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:color w:val="555555"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${xml(companyPart)}</w:t></w:r>`:''}
        </w:p>
       </w:tc>
       <w:tc>
        <w:tcPr><w:tcW w:type="dxa" w:w="2880"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p>
         <w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/></w:pPr>
         <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="555555"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr><w:t xml:space="preserve">${xml(rightText)}</w:t></w:r>
        </w:p>
       </w:tc>
      </w:tr>
     </w:tbl>
    `);
    i++;
    continue;
   }else{
    // Group consecutive skill rows into one table
    const rows:string[][]=[];
    while(i<rawLines.length&&rawLines[i].trim().startsWith('|')&&rawLines[i].trim().endsWith('|')){
     const rowParts=rawLines[i].trim().split('|').slice(1,-1).map(s=>s.trim());
     if(rowParts.length>=2){
      rows.push(rowParts);
     }
     i++;
    }

    const trs=rows.map(([category,skills])=>`
     <w:tr>
      <w:trPr><w:cantSplit/></w:trPr>
      <w:tc>
       <w:tcPr><w:tcW w:type="dxa" w:w="1728"/><w:vAlign w:val="top"/></w:tcPr>
       <w:p>
        <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr><w:t xml:space="preserve">${xml(category)}</w:t></w:r>
       </w:p>
      </w:tc>
      <w:tc>
       <w:tcPr><w:tcW w:type="dxa" w:w="8136"/><w:vAlign w:val="top"/></w:tcPr>
       <w:p>
        <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="17"/><w:szCs w:val="17"/><w:color w:val="222222"/></w:rPr><w:t xml:space="preserve">${xml(skills)}</w:t></w:r>
       </w:p>
      </w:tc>
     </w:tr>
    `).join('');

    elements.push(`
     <w:tbl>
      ${tblPr(1728,8136)}
      ${trs}
     </w:tbl>
    `);
    continue;
   }
  }

  // Bullet point
  if(/^[-•*]\s/.test(trimmed)){
   const bulletText=trimmed.replace(/^[-•*]\s+/,'');
   elements.push(`
    <w:p>
     <w:pPr>
      <w:spacing w:after="14" w:line="228" w:lineRule="auto"/>
      <w:ind w:left="230" w:hanging="158"/>
     </w:pPr>
     <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="333333"/></w:rPr><w:t xml:space="preserve">• ${xml(bulletText)}</w:t></w:r>
    </w:p>
   `);
   i++;
   continue;
  }

  // Certifications line
  if(/^Certifications:\s*/i.test(trimmed)){
   const certsText=trimmed.replace(/^Certifications:\s*/i,'');
   elements.push(`
    <w:p>
     <w:pPr><w:spacing w:after="0"/></w:pPr>
     <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">Certifications: </w:t></w:r>
     <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="333333"/></w:rPr><w:t xml:space="preserve">${xml(certsText)}</w:t></w:r>
    </w:p>
   `);
   i++;
   continue;
  }

  // Education line
  if(inHeading.includes('EDUCATION')&&(trimmed.includes(' — ')||trimmed.includes(' - ')||trimmed.includes(' | '))){
   let degree=trimmed;
   let rest='';
   if(trimmed.includes(' — ')){
    const splitIdx=trimmed.indexOf(' — ');
    degree=trimmed.substring(0,splitIdx);
    rest=' — '+trimmed.substring(splitIdx+3);
   }else if(trimmed.includes(' - ')){
    const splitIdx=trimmed.indexOf(' - ');
    degree=trimmed.substring(0,splitIdx);
    rest=' - '+trimmed.substring(splitIdx+3);
   }else if(trimmed.includes(' | ')){
    const splitIdx=trimmed.indexOf(' | ');
    degree=trimmed.substring(0,splitIdx);
    rest=' | '+trimmed.substring(splitIdx+3);
   }

   elements.push(`
    <w:p>
     <w:pPr><w:spacing w:after="20"/></w:pPr>
     <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${xml(degree)}</w:t></w:r>
     ${rest?`<w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="333333"/></w:rPr><w:t xml:space="preserve">${xml(rest)}</w:t></w:r>`:''}
    </w:p>
   `);
   i++;
   continue;
  }

  // Legacy Experience entry with pipe separator (Title | Company)
  if(inHeading.includes('EXPERIENCE')&&trimmed.includes(' | ')&&!trimmed.startsWith('|')){
   const parts=trimmed.split(' | ');
   elements.push(`
    <w:tbl>
     ${tblPr(6984,2880)}
     <w:tr>
      <w:trPr><w:cantSplit/></w:trPr>
      <w:tc>
       <w:tcPr><w:tcW w:type="dxa" w:w="6984"/><w:vAlign w:val="center"/></w:tcPr>
       <w:p>
        <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr><w:t xml:space="preserve">${xml(parts[0])}</w:t></w:r>
        ${parts[1]?`<w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:color w:val="555555"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">  —  ${xml(parts.slice(1).join(', '))}</w:t></w:r>`:''}
       </w:p>
      </w:tc>
      <w:tc>
       <w:tcPr><w:tcW w:type="dxa" w:w="2880"/><w:vAlign w:val="center"/></w:tcPr>
       <w:p>
        <w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/></w:pPr>
       </w:p>
      </w:tc>
     </w:tr>
    </w:tbl>
   `);
   i++;
   continue;
  }

  // Standard paragraph
  elements.push(`
   <w:p>
    <w:pPr><w:spacing w:after="30" w:line="240" w:lineRule="auto"/></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="333333"/></w:rPr><w:t xml:space="preserve">${xml(trimmed)}</w:t></w:r>
   </w:p>
  `);
  i++;
 }

 return elements.join('');
}

/** Standards-compliant Word package with professional resume formatting matching exact template specifications. */
export function resumeDocx(content:string):Uint8Array{
 const bodyXml=buildResumeBodyXml(content);
 const files:Record<string,string>={
  '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  'word/document.xml':`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="648" w:right="835" w:bottom="648" w:left="835"/></w:sectPr></w:body></w:document>`,
  'word/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="333333"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="30" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:customStyle="1" w:styleId="ResumeHeading"><w:name w:val="Resume Heading"/><w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style></w:styles>',
 };
 return zipSync(Object.fromEntries(Object.entries(files).map(([path,value])=>[path,strToU8(value)])));
}