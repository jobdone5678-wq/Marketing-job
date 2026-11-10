(function(root){'use strict';
  const adapter={id:'workday',name:'Workday',matches:host=>/(^|\.)myworkday(jobs|site)?\.com$/i.test(host),hint:el=>{
    const autoId=(el.getAttribute('data-automation-id')||'').toLowerCase();
    if(autoId.includes('legalname_firstname')||autoId.includes('legalnamesection_firstname'))return 'first_name';
    if(autoId.includes('legalname_lastname')||autoId.includes('legalnamesection_lastname'))return 'last_name';
    if(autoId.includes('email')||autoId.includes('emailaddress'))return 'email';
    if(autoId.includes('phone')||autoId.includes('phonenumber'))return 'phone';
    if(autoId.includes('addresssection_addressline1'))return 'full_address';
    if(autoId.includes('addresssection_city'))return 'current_city';
    if(autoId.includes('addresssection_countryregion'))return 'current_state';
    if(autoId.includes('addresssection_postalcode'))return 'zip_code';
    if(autoId.includes('countrydropdown'))return 'country';
    return root.canonicalHint?root.canonicalHint(el):'';
  }};
  if(typeof root.registerAdapter==='function') root.registerAdapter(adapter);
  else { root.NextkinAdapters=root.NextkinAdapters||[]; const i=root.NextkinAdapters.findIndex(a=>a.id==='workday'); if(i>=0) root.NextkinAdapters[i]=adapter; else root.NextkinAdapters.push(adapter); }
})(globalThis);
