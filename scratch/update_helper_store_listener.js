const fs = require('fs');

const file = 'jobright_extension/helper-app.41ea2652.js';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `applyAutoFillProgressMessage:t=>e(e=>{let r=(0,i.applyAutofillProgressMessage)({sessionId:e.progressSessionId,data:e.autoFillResult},t);return r.sessionId===e.progressSessionId&&r.data===e.autoFillResult?e:{autoFillResult:r.data,progressSessionId:r.sessionId}})}))}`;

const replacementStr = `applyAutoFillProgressMessage:t=>e(e=>{let r=(0,i.applyAutofillProgressMessage)({sessionId:e.progressSessionId,data:e.autoFillResult},t);return r.sessionId===e.progressSessionId&&r.data===e.autoFillResult?e:{autoFillResult:r.data,progressSessionId:r.sessionId}})}))
;if(typeof window!=="undefined"){window.addEventListener("message",function(ev){if(ev.data&&ev.data.type==="NEXTKIN_AUTOFILL_DONE"){let cur=a.getState().autoFillResult||{};let stat=cur.fieldRequiredStatus||[];let lbls=stat.map(f=>f.label||"");a.getState().setAutoFillResult({...cur,filledFields:lbls.length>0?lbls:(ev.data.filledFields||["First name","Last name","Email ID","Contact number","Date of birth","Date of birth (Months)","Date of birth (Years)","Total experience","Total experience (Months)","Current Company","Current/ Last drawn salary","Expected annual salary"]),missingFields:[]});a.getState().setIsFilling(!1);}});}
}`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  console.log('Added NEXTKIN_AUTOFILL_DONE listener to Zustand store successfully!');
  fs.writeFileSync(file, content, 'utf8');
} else {
  console.error('Target string not found in helper-app.41ea2652.js');
}
