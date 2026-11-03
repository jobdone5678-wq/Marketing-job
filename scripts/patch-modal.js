const fs = require('fs');
const vm = require('vm');

let code = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

// Target 1: The "Your Resume" section title
const searchStr = '(0,i.jsx)(l.Typography.Text,{className:H+"section-title",children:"Your Resume"}),';
const s1 = code.indexOf(searchStr);
if (s1 === -1) {
  throw new Error('Could not find Your Resume section title');
}

const uploadButtonJsx = `(0,i.jsx)(l.Typography.Text,{className:H+"section-title",children:"Your Resume"}),(0,i.jsxs)("div",{style:{marginBottom:"8px"}},[(0,i.jsx)("input",{type:"file",id:"nextkin-modal-resume-upload",style:{display:"none"},accept:".pdf,.docx,.doc,.txt",onChange:function(ev){var file=ev.target.files&&ev.target.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(e1){var dataUrl=e1.target.result;var tReader=new FileReader();tReader.onload=function(e2){var rawText=e2.target.result||"";var cleanText=String(rawText).replace(/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]/g," ");var newId="upl_"+Date.now();var newResume={resumeId:newId,resumeName:file.name.replace(/\\.[^/.]+$/,""),resumeNameWithSuffix:file.name,base64URL:dataUrl,raw_text:cleanText,source_text:cleanText,primary:true};chrome.storage.local.set({uploaded_resume:newResume,nextkin_uploaded_resume:newResume,nextkin_active_candidate:{basicInfo:{fullName:file.name.replace(/\\.[^/.]+$/,"")},confirmed_facts:{raw_text:cleanText},source_text:cleanText}});var store=(0,k.useResumeStore).getState();var updatedMap={...store.resumeMap,[newId]:newResume};var updatedCol=[newResume,...(store.resumeCollection||[])];(0,k.useResumeStore).setState({resumeMap:updatedMap,resumeCollection:updatedCol,lastUsedResume:newId,disableUploadResume:false});K(newId);W(false);};tReader.readAsText(file);};reader.readAsDataURL(file);}}),(0,i.jsxs)("button",{type:"button",onClick:function(){var inp=document.getElementById("nextkin-modal-resume-upload");if(inp)inp.click();},style:{display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px dashed #10b981",background:"#f0fdf4",color:"#047857",fontSize:"12px",fontWeight:600,cursor:"pointer",boxShadow:"0 1px 2px rgba(0,0,0,0.02)"},children:[(0,i.jsx)("span",{children:"📤"}),(0,i.jsx)("span",{children:"Upload Resume (PDF / DOCX)"})]})]),`;

code = code.replace(searchStr, uploadButtonJsx);
console.log('Replaced Your Resume section title with upload button');

// Target 2: The right side preview fallback
const rightSideSearch = '):G&&(0,i.jsx)($.default,{resumeId:G,resumeMap:r,template:n,useOriginalResume:"true"===X,isWord:r[G]?.resumeNameWithSuffix?.toLowerCase().endsWith(".docx")||r[G]?.resumeNameWithSuffix?.toLowerCase().endsWith(".doc")||!1,style:{flex:"0 0 720px",minWidth:720,maxWidth:720,minHeight:0}})]})}),eo&&';
const s2 = code.indexOf(rightSideSearch);
if (s2 === -1) {
  console.log('Searching fallback for right side...');
  const partial = '):G&&(0,i.jsx)($.default';
  console.log('partial found at:', code.indexOf(partial));
} else {
  const replacementRightSide = `):(0,i.jsxs)(l.Flex,{vertical:!0,justify:"center",align:"center",gap:16,style:{flex:"0 0 720px",minWidth:720,maxWidth:720,minHeight:420,padding:"40px 20px",background:"#f8fafc",border:"2px dashed #cbd5e1",borderRadius:"12px",textAlign:"center"},children:[(0,i.jsx)("div",{style:{fontSize:"48px"},children:"📄"}),(0,i.jsx)("div",{style:{fontSize:"18px",fontWeight:700,color:"#0f172a"},children:G&&r[G]?r[G].resumeNameWithSuffix:"Upload Resume to Preview & Autofill"}),(0,i.jsx)("div",{style:{fontSize:"12px",color:"#64748b",maxWidth:"420px",lineHeight:"18px"},children:G&&r[G]?"Resume is active and ready for 1-click autofill into this job application form.":"Upload your PDF or DOCX resume to get an instant ATS match score against this job, check missing requirements, and enable 1-click autofill."}),(0,i.jsx)("button",{type:"button",onClick:function(){var inp=document.getElementById("nextkin-modal-resume-upload");if(inp)inp.click();},style:{padding:"10px 24px",borderRadius:"8px",background:"#10b981",color:"#ffffff",fontSize:"13px",fontWeight:600,border:"none",cursor:"pointer",boxShadow:"0 2px 8px rgba(16,185,129,0.3)"},children:G&&r[G]?"Upload Different Resume":"Select Resume File (PDF / DOCX)"})]})]})}),eo&&`;
  code = code.replace(rightSideSearch, replacementRightSide);
  console.log('Replaced right side with rich preview & upload dropzone');
}

// Verify syntax
try {
  new vm.Script(code);
  console.log('SUCCESS: Syntax after modal update is VALID');
  fs.writeFileSync('jobright_extension/helper-app.41ea2652.js', code, 'utf8');
} catch (e) {
  console.error('Syntax error after modal update:', e.message);
  process.exit(1);
}
