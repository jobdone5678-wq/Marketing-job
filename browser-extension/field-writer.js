(function(root){'use strict';
 const value=field=>field.kind==='radio'?field.elements.map(el=>el.checked):field.kind==='checkbox'?field.element.checked:field.kind==='combobox'?(field.element.value||field.element.textContent.trim()):field.element.value;
 function writeNative(el,property,next,{commit=true}={}){
  if(!el||!el.isConnected)return false;
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
   return el.checked===boolVal;
  }
  let previousFocus=el.ownerDocument.activeElement;
  while(previousFocus?.shadowRoot?.activeElement)previousFocus=previousFocus.shadowRoot.activeElement;
  try{el.focus({preventScroll:true});}catch{}
  const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,property)?.set;if(setter)setter.call(el,next);else el[property]=next;
  try{
   el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:String(next)}));
  }catch{
   el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
  }
  if(commit){
   el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
   // Native blur emits focusout, which React's delegated onBlur uses to save.
   // Dispatching only a synthetic blur changed the DOM but left form data empty.
   try{el.blur();}catch{}
   if(previousFocus&&previousFocus!==el&&previousFocus.isConnected)try{previousFocus.focus({preventScroll:true});}catch{}
  }
  return el[property]===next;
 }
 async function applyFill(plans,session){
  const receipts=[];
  for(const plan of plans){
   const {field}=plan,el=field.element;
   if(plan.status!=='supported'||!el.isConnected||!session.isCurrent()||field.excluded)continue;
   const previousValue=value(field);let expected=String(plan.value),undoChoice=null;
   const occupied=Array.isArray(previousValue)?previousValue.some(Boolean):!!previousValue;
   if(occupied&&field.adapter==='ashby'&&field.kind==='text'){
    // Recommit a visible answer left by an older extension, preserving its text.
    writeNative(el,'value',String(previousValue));
    await new Promise(resolve=>setTimeout(resolve,0));
    continue;
   }
   const sameAshbyValue=field.adapter==='ashby'&&['text','combobox'].includes(field.kind)&&(plan.optionMatches?plan.optionMatches(previousValue,String(plan.value)):String(previousValue)===String(plan.value));
   if(occupied&&!sameAshbyValue)continue;
   if(field.kind==='combobox'){
    el.click();let option;
    const query=String(plan.value);
    if(el.tagName==='INPUT')writeNative(el,'value',query,{commit:false});
    for(let attempt=0;attempt<60&&session.isCurrent()&&el.isConnected;attempt++){
     const scope=el.getRootNode().getElementById?.(el.getAttribute('aria-controls'));
     const options=Array.from(scope?.querySelectorAll('[role="option"]')||[]).filter(o=>o.getClientRects().length&&o.getAttribute('aria-disabled')!=='true'&&(plan.optionMatches?plan.optionMatches(o.textContent.trim(),query):o.textContent.trim()===query));
     if(options.length===1){option=options[0];break;}await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(!option||!session.isCurrent()||!el.isConnected||value(field)!==(el.tagName==='INPUT'?query:previousValue)){
     field.commitStatus='needs_review';
     if(session.isCurrent()&&el.isConnected&&el.tagName==='INPUT'&&value(field)===query)writeNative(el,'value',previousValue);
     continue;
    }
    if(el.tagName!=='INPUT'){
     const scope=el.getRootNode().getElementById?.(el.getAttribute('aria-controls'));
     const reset=Array.from(scope?.querySelectorAll('[role="option"]')||[]).filter(o=>!o.disabled&&o.getAttribute('aria-disabled')!=='true'&&(o.getAttribute('data-placeholder')==='true'||o.getAttribute('data-value')===''||/^(select|choose)(\s|$)/i.test(o.textContent.trim())));
     if(reset.length!==1)continue;undoChoice=reset[0].textContent.trim();
    }
    option.click();
    expected=option.textContent.trim();
   }else if(field.kind==='select'){
    const options=field.options.filter(o=>o.label===String(plan.value)||o.value===String(plan.value));if(options.length!==1)continue;expected=options[0].value;writeNative(el,'value',expected);
   }else if(field.kind==='radio'){
    const options=field.options.filter(o=>o.label===String(plan.value)||o.value===String(plan.value));if(options.length!==1)continue;expected=field.elements.map(r=>r===options[0].element);writeNative(options[0].element,'checked',true);
   }else if(field.kind==='checkbox'){if(typeof plan.value!=='boolean')continue;expected=plan.value;writeNative(el,'checked',plan.value);}
   else writeNative(el,'value',String(plan.value));
   await new Promise(resolve=>setTimeout(resolve,0));
   const writtenValue=value(field);
   const verified=field.kind==='combobox'&&plan.optionMatches?plan.optionMatches(writtenValue,String(plan.value)):JSON.stringify(writtenValue)===JSON.stringify(expected);
   if(!session.isCurrent()||!verified)continue;
   field.commitStatus='verified';
   if(JSON.stringify(writtenValue)===JSON.stringify(previousValue))continue;
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
