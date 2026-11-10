/* Platform hints augment semantic labels; none may override ambiguity checks. */
(function(root){'use strict';
  const adapter={id:'generic',name:'Generic',matches:()=>true,hint:el=>(root.canonicalHint?root.canonicalHint(el):'')||
    el.getAttribute('autocomplete')||el.getAttribute('name')||''};
  if(typeof root.registerAdapter==='function') root.registerAdapter(adapter);
  else { root.NextkinAdapters=root.NextkinAdapters||[]; const i=root.NextkinAdapters.findIndex(a=>a.id==='generic'); if(i>=0) root.NextkinAdapters[i]=adapter; else root.NextkinAdapters.push(adapter); }
})(globalThis);
