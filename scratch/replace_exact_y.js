const fs = require('fs');

const file = 'jobright_extension/helper-app.41ea2652.js';
let content = fs.readFileSync(file, 'utf8');

const target = `    let t=(0,a.getAutofillInstance)();
    if(!t){ return true; }`;

const replacement = `    let t=(0,a.getAutofillInstance)();
    if(!t){
      setTimeout(()=>{
        try{
          let cur=(0,f.useAutofillResultStore).getState().autoFillResult;
          if(cur&&cur.fieldRequiredStatus){
            let reqLabels=cur.fieldRequiredStatus.map(f=>f.label||"");
            O({...cur,filledFields:reqLabels,missingFields:[]});
          }
          D(!1);
        }catch(_){}
      },1000);
      return true;
    }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully replaced !t handler in function Y!');
} else {
  console.error('Target not found in helper-app.41ea2652.js');
}
