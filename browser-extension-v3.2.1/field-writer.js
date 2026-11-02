(function(root){'use strict';
 const value=field=>field.kind==='radio'?field.elements.map(el=>el.checked):field.kind==='checkbox'?field.element.checked:field.kind==='combobox'?(field.element.value||field.element.textContent.trim()):field.element.value;
 function writeNative(el,property,next){
  if(!el||!el.isConnected)return false;
  if(typeof el.setCustomValidity==='function')try{el.setCustomValidity('');}catch{}
  if(property==='checked'){
   const boolVal=Boolean(next);
   if(el._valueTracker){try{el._valueTracker.setValue(boolVal?'false':'true');}catch{}}
   const proto=HTMLInputElement.prototype;
   const setter=Object.getOwnPropertyDescriptor(proto,'checked')?.set;
   if(setter)setter.call(el,boolVal);else el.checked=boolVal;
   try{el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,composed:true}));}catch{try{el.click();}catch{}}
   el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
   el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
   try{el.dispatchEvent(new FocusEvent('blur',{bubbles:true,composed:true}));}catch{}
   if(el.getAttribute?.('aria-invalid')==='true')try{el.removeAttribute('aria-invalid');}catch{}
   return el.checked===boolVal;
  }
  if(el._valueTracker){try{el._valueTracker.setValue(String(next)===''?'__force_diff__' : '');}catch{}}
  const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,property)?.set;if(setter)setter.call(el,next);else el[property]=next;
  try{el.dispatchEvent(new FocusEvent('focus',{bubbles:true,composed:true}));}catch{}
  try{
   el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:String(next)}));
  }catch{
   el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
  }
  el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
  try{el.dispatchEvent(new FocusEvent('blur',{bubbles:true,composed:true}));}catch{}
  if(el.getAttribute?.('aria-invalid')==='true')try{el.removeAttribute('aria-invalid');}catch{}
  return el[property]===next;
 }
 async function applyFill(plans,session){
  const receipts=[];
  for(const plan of plans){
   const {field}=plan,el=field.element;
   if(plan.status!=='supported'||!el.isConnected||!session.isCurrent()||field.excluded)continue;
   const previousValue=value(field);let expected=String(plan.value),undoChoice=null;
   if(Array.isArray(previousValue)?previousValue.some(Boolean):!!previousValue)continue;
   if(field.kind==='combobox'){
    el.click();let option;
    for(let attempt=0;attempt<10&&session.isCurrent();attempt++){
     const scope=el.getRootNode().getElementById?.(el.getAttribute('aria-controls'));
     const options=Array.from(scope?.querySelectorAll('[role="option"]')||[]).filter(o=>o.getAttribute('aria-disabled')!=='true'&&o.textContent.trim()===String(plan.value));
     if(options.length===1){option=options[0];break;}await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(!option||!session.isCurrent()||value(field)!==previousValue)continue;
    if(el.tagName!=='INPUT'){
     const scope=el.getRootNode().getElementById?.(el.getAttribute('aria-controls'));
     const reset=Array.from(scope?.querySelectorAll('[role="option"]')||[]).filter(o=>!o.disabled&&o.getAttribute('aria-disabled')!=='true'&&(o.getAttribute('data-placeholder')==='true'||o.getAttribute('data-value')===''||/^(select|choose)(\s|$)/i.test(o.textContent.trim())));
     if(reset.length!==1)continue;undoChoice=reset[0].textContent.trim();
    }
    option.click();
   }else if(field.kind==='select'){
    const options=field.options.filter(o=>o.label===String(plan.value)||o.value===String(plan.value));if(options.length!==1)continue;expected=options[0].value;writeNative(el,'value',expected);
   }else if(field.kind==='radio'){
    const options=field.options.filter(o=>o.label===String(plan.value)||o.value===String(plan.value));if(options.length!==1)continue;expected=field.elements.map(r=>r===options[0].element);writeNative(options[0].element,'checked',true);
   }else if(field.kind==='checkbox'){if(typeof plan.value!=='boolean')continue;expected=plan.value;writeNative(el,'checked',plan.value);}
   else writeNative(el,'value',String(plan.value));
   await new Promise(resolve=>setTimeout(resolve,0));
   const writtenValue=value(field);
   if(!session.isCurrent()||JSON.stringify(writtenValue)!==JSON.stringify(expected)||JSON.stringify(writtenValue)===JSON.stringify(previousValue))continue;
   receipts.push({fieldKey:field.key,field,element:el,previousValue,writtenValue,sessionId:session.sessionId,undoChoice});
  }
  return receipts;
 }
 async function undo(receipts,session){
  let restored=0;
  for(const receipt of receipts){const {field}=receipt;if(receipt.sessionId!==session.sessionId||!field.element.isConnected||JSON.stringify(value(field))!==JSON.stringify(receipt.writtenValue))continue;
   if(field.kind==='combobox'){
    if(field.element.tagName==='INPUT')writeNative(field.element,'value',receipt.previousValue);
    else{
     field.element.click();let reset;
     for(let attempt=0;attempt<10;attempt++){
      const scope=field.element.getRootNode().getElementById?.(field.element.getAttribute('aria-controls'));
      const options=Array.from(scope?.querySelectorAll('[role="option"]')||[]).filter(o=>!o.disabled&&o.getAttribute('aria-disabled')!=='true'&&o.textContent.trim()===receipt.undoChoice);
      if(options.length===1){reset=options[0];break;}await new Promise(resolve=>setTimeout(resolve,50));
     }
     if(!reset||JSON.stringify(value(field))!==JSON.stringify(receipt.writtenValue))continue;reset.click();
    }
    if(JSON.stringify(value(field))===JSON.stringify(receipt.previousValue))restored++;continue;
   }
   if(field.kind==='radio')field.elements.forEach((el,i)=>{el.checked=receipt.previousValue[i];el.dispatchEvent(new Event('change',{bubbles:true}));});
   else writeNative(field.element,field.kind==='checkbox'?'checked':'value',receipt.previousValue);
   restored++;
  }return restored;
 }
 root.NextkinFieldWriter={applyFill,undo,writeNative};
})(globalThis);
