const fs = require('fs');

const file = 'jobright_extension/helper-app.41ea2652.js';
let content = fs.readFileSync(file, 'utf8');

// Target the Y callback in module 12lb0
const oldYPattern = /Y=\(0,o\.useCallback\)\(async e=>\{try\{let t=\(0,a\.getAutofillInstance\)\(\);if\(!t\)\{D\(!1\),_\(!1\);try\{window\.top\.postMessage\(\{type:"NEXTKIN_TRIGGER_AUTOFILL"\},"\*"\);window\.top\.dispatchEvent\(new CustomEvent\("NextkinTriggerAutofill"\)\);\}catch\(_\)\{\}return !1;\}/;

const newYCallback = `Y=(0,o.useCallback)(async e=>{try{
    D(!0);_(!1);
    try{ if (L) L("Autofilling form fields..."); }catch(_){}
    try{
      window.top.postMessage({type:"NEXTKIN_TRIGGER_AUTOFILL"},"*");
      window.top.dispatchEvent(new CustomEvent("NextkinTriggerAutofill"));
    }catch(_){}
    setTimeout(()=>{ try{ D(!1); }catch(_){} }, 4000);
    let t=(0,a.getAutofillInstance)();
    if(!t){ return true; }`;

if (oldYPattern.test(content)) {
  content = content.replace(oldYPattern, newYCallback);
  console.log('Replaced Y callback to keep animation running!');
} else {
  console.log('Old Y pattern not matched directly, checking snippet');
  let idx = content.indexOf('window.top.postMessage({type:"NEXTKIN_TRIGGER_AUTOFILL"}');
  if (idx !== -1) {
    console.log(content.substring(idx - 100, idx + 200));
  }
}

fs.writeFileSync(file, content, 'utf8');
