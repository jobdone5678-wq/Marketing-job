(function(root){'use strict';
  const adapter={id:'greenhouse',name:'Greenhouse',matches:host=>/(^|\.)greenhouse\.io$/i.test(host),hint:el=>{
    const name=(el.getAttribute('name')||'').toLowerCase(),id=(el.id||'').toLowerCase();
    if(id==='first_name'||name==='first_name')return 'first_name';
    if(id==='last_name'||name==='last_name')return 'last_name';
    if(id==='email'||name==='email')return 'email';
    if(id==='phone'||name==='phone')return 'phone';
    if(/job_application\[location\]/i.test(name))return 'current_city';
    if(/job_application\[answers\]/i.test(name))return '';
    return root.canonicalHint?root.canonicalHint(el):'';
  }};
  if(typeof root.registerAdapter==='function') root.registerAdapter(adapter);
  else { root.NextkinAdapters=root.NextkinAdapters||[]; const i=root.NextkinAdapters.findIndex(a=>a.id==='greenhouse'); if(i>=0) root.NextkinAdapters[i]=adapter; else root.NextkinAdapters.push(adapter); }
})(globalThis);
