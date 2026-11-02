(function(root){'use strict';
 const excluded=/password|secret|token|credential|bank|routing|payment|credit.?card|ssn|social.?security|tax.?id|birth|dob|medical|health|disabil|ethnic|race|gender|veteran|religion|consent|privacy|terms|captcha|otp|one.?time.?code|search|signature|agree|certif|reference|referral|emergency/i;
 function label(el){
  const tree=el.getRootNode(),ids=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean);
  return (el.getAttribute('aria-label')||ids.map(id=>tree.getElementById?.(id)?.textContent).filter(Boolean).join(' ')||Array.from(el.labels||[]).map(l=>l.textContent).filter(Boolean).join(' ')).replace(/\s+/g,' ').trim()||el.getAttribute('placeholder')||'';
 }
 function discoverFields(tree=document){
  const fields=[],seen=new Set();
  const adapter=[...(root.NextkinAdapters||[])].reverse().find(a=>a.matches(location.hostname));
  const walk=scope=>{
   for(const el of scope.querySelectorAll('input,textarea,select,[role="combobox"],iframe')){
    if(el.closest('#mp-copilot-root')||el.disabled||el.readOnly||!el.getClientRects().length)continue;
    if(el.tagName==='IFRAME'){fields.push({element:el,key:'frame:'+fields.length,label:'Embedded application requires manual review',kind:'inaccessible',scope:''});continue;}
    if(['hidden','file','password','submit','reset','button'].includes(el.type)&&el.getAttribute('role')!=='combobox')continue;
    const text=adapter?.label?.(el)||label(el),hint=adapter?.hint(el)||'',group=el.closest('fieldset,[data-automation-id="workExperience"],[data-automation-id="education"]');
    const groupLabel=group?.querySelector('legend')?.textContent?.trim()||group?.getAttribute('data-automation-id')||'';
    const kind=el.getAttribute('role')==='combobox'?'combobox':el.tagName==='SELECT'?'select':el.type==='radio'?'radio':el.type==='checkbox'?'checkbox':'text';
    let elements=[el];
    if(kind==='radio'){
     elements=Array.from(scope.querySelectorAll('input[type="radio"]')).filter(r=>r.name===el.name&&r.form===el.form);
     if(elements.some(r=>seen.has(r)))continue;elements.forEach(r=>seen.add(r));
    }
    const options=kind==='select'?Array.from(el.options).filter(o=>!o.disabled&&o.value).map(o=>({label:o.textContent.trim(),value:o.value,element:o})):kind==='radio'?elements.map(r=>({label:label(r)||r.value,value:r.value,element:r})):[];
    fields.push({element:el,elements,key:'field:'+fields.length+':'+(el.id||el.name||hint),label:kind==='radio'?groupLabel||text:text,hint,kind,options,scope:groupLabel,excluded:excluded.test([text,hint,el.id,el.name,groupLabel].join(' ').replace(/[_-]/g,' ')),adapter:adapter?.id||'generic'});
   }
   for(const el of scope.querySelectorAll('*'))if(el.shadowRoot&&el.id!=='mp-copilot-root')walk(el.shadowRoot);
  };walk(tree);return fields;
 }
 root.NextkinForms={discoverFields,label};
})(globalThis);
