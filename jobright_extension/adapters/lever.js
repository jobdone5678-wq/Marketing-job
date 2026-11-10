(function(root){'use strict';
  const adapter={id:'lever',name:'Lever',matches:host=>/(^|\.)lever\.co$/i.test(host),hint:el=>{
    const name=el.getAttribute('name')||'';
    if(name==='name')return 'full_name';
    if(name==='email')return 'email';
    if(name==='phone')return 'phone';
    if(name==='org')return 'current_employer';
    if(name==='location')return 'current_city';
    if(/urls\[linkedin\]/i.test(name))return 'linkedin_url';
    if(/urls\[github\]/i.test(name))return 'github_url';
    if(/urls\[portfolio\]|urls\[website\]|urls\[other\]/i.test(name))return 'website';
    if(/urls\[twitter\]/i.test(name))return 'website';
    return root.canonicalHint?root.canonicalHint(el):'';
  }};
  if(typeof root.registerAdapter==='function') root.registerAdapter(adapter);
  else { root.NextkinAdapters=root.NextkinAdapters||[]; const i=root.NextkinAdapters.findIndex(a=>a.id==='lever'); if(i>=0) root.NextkinAdapters[i]=adapter; else root.NextkinAdapters.push(adapter); }
})(globalThis);
