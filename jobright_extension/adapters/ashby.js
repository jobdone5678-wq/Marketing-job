(function(root){'use strict';
  const adapter={id:'ashby',name:'Ashby',matches:host=>/(^|\.)ashbyhq\.com$/i.test(host),hint:el=>{
    const name=el.getAttribute('name')||'';
    if(name==='_systemfield_name')return 'full_name';
    if(name==='_systemfield_email')return 'email';
    if(name==='_systemfield_location')return 'current_city';
    if(name==='_systemfield_phone')return 'phone';
    if(/urls\[([^\]]+)\]/i.test(name)){const key=RegExp.$1.toLowerCase();
      if(/linkedin/.test(key))return 'linkedin_url';
      if(/github/.test(key))return 'github_url';
      if(/twitter|portfolio|website|other|url/.test(key))return 'website';}
    return (root.canonicalHint?root.canonicalHint(el):'')||el.getAttribute('data-testid')||'';
  }};
  if(typeof root.registerAdapter==='function') root.registerAdapter(adapter);
  else { root.NextkinAdapters=root.NextkinAdapters||[]; const i=root.NextkinAdapters.findIndex(a=>a.id==='ashby'); if(i>=0) root.NextkinAdapters[i]=adapter; else root.NextkinAdapters.push(adapter); }
})(globalThis);
