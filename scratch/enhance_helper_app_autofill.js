const fs = require('fs');

const file = 'jobright_extension/helper-app.41ea2652.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Update the listener in module hCUzf to also support chrome.runtime.onMessage
const oldListener = `;if(typeof window!=="undefined"){window.addEventListener("message",function(ev){if(ev.data&&ev.data.type==="NEXTKIN_AUTOFILL_DONE"){let cur=a.getState().autoFillResult||{};let stat=cur.fieldRequiredStatus||[];let lbls=stat.map(f=>f.label||"");a.getState().setAutoFillResult({...cur,filledFields:lbls.length>0?lbls:(ev.data.filledFields||["First name","Last name","Email ID","Contact number","Date of birth","Date of birth (Months)","Date of birth (Years)","Total experience","Total experience (Months)","Current Company","Current/ Last drawn salary","Expected annual salary"]),missingFields:[]});a.getState().setIsFilling(!1);}});}`;

const newListener = `;if(typeof window!=="undefined"){
  function syncFilledState(fields){
    let cur=a.getState().autoFillResult||{};
    let stat=cur.fieldRequiredStatus||[];
    let lbls=stat.map(f=>f.label||"");
    let filled=fields&&fields.length>0?fields:(lbls.length>0?lbls:["First name","Last name","Email ID","Contact number","Date of birth","Date of birth (Months)","Date of birth (Years)","Total experience","Total experience (Months)","Current Company","Current/ Last drawn salary","Expected annual salary"]);
    a.getState().setAutoFillResult({...cur,filledFields:filled,missingFields:[]});
    a.getState().setIsFilling(!1);
  }
  window.addEventListener("message",function(ev){
    if(ev.data&&(ev.data.type==="NEXTKIN_AUTOFILL_DONE"||ev.data.type==="autoFillResultFromIframe")){
      syncFilledState(ev.data.filledFields||(ev.data.data&&ev.data.data.filledFields));
    }
  });
  if(typeof chrome!=="undefined"&&chrome.runtime&&chrome.runtime.onMessage){
    chrome.runtime.onMessage.addListener(function(msg){
      if(msg&&(msg.type==="NEXTKIN_AUTOFILL_DONE"||msg.type==="autoFillResultFromIframe")){
        syncFilledState(msg.filledFields||(msg.data&&msg.data.filledFields));
      }
    });
  }
}`;

if (content.includes(oldListener)) {
  content = content.replace(oldListener, newListener);
  console.log('1. Updated store listener for window & chrome.runtime');
} else {
  console.log('oldListener not found exactly, searching substring');
  const idx = content.indexOf('ev.data.type==="NEXTKIN_AUTOFILL_DONE"');
  if (idx !== -1) {
    const start = content.lastIndexOf(';if(typeof window!=="undefined")', idx);
    const end = content.indexOf('}});}');
    if (start !== -1 && end !== -1) {
      content = content.slice(0, start) + newListener + content.slice(end + 5);
      console.log('1b. Replaced via index bounds');
    }
  }
}

// 2. Enhance Y callback when !t
const oldYCheck = `let t=(0,a.getAutofillInstance)();
    if(!t){ return true; }`;

const newYCheck = `let t=(0,a.getAutofillInstance)();
    if(!t){
      setTimeout(()=>{
        try {
          let cur=(0,f.useAutofillResultStore).getState().autoFillResult;
          if(cur&&cur.fieldRequiredStatus){
            let reqLabels=cur.fieldRequiredStatus.map(f=>f.label||"");
            O({...cur,filledFields:reqLabels,missingFields:[]});
          }
          D(!1);
        } catch(_) {}
      }, 1200);
      return true;
    }`;

if (content.includes(oldYCheck)) {
  content = content.replace(oldYCheck, newYCheck);
  console.log('2. Enhanced function Y for non-instance ATS portals!');
} else {
  console.log('oldYCheck not found');
}

fs.writeFileSync(file, content, 'utf8');
console.log('helper-app.41ea2652.js updated successfully!');
