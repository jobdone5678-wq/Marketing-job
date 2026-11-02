(function(root){'use strict';
 const norm=v=>String(v??'').replace(/[_*:-]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
 const aliases={full_name:['full name','name'],email:['email','email address'],phone:['phone','phone number','mobile','tel'],first_name:['first name','given name'],last_name:['last name','family name','surname'],current_city:['city','address level2'],current_state:['state','province','address level1'],zip_code:['zip','zip code','postal code'],country:['country','country name'],full_address:['street address','address line1'],linkedin_url:['linkedin','linkedin profile','linkedin url'],github_url:['github','github url'],website:['website','portfolio']};
 function planFill(fields,candidate){
  const facts=candidate.provenance_status==='confirmed'?(candidate.confirmed_facts||{}):candidate;
  const names=String(facts.full_name||candidate.full_name||'').trim().split(/\s+/),values={...facts,first_name:names[0],last_name:names.slice(1).join(' ')};
  const plans=fields.map(field=>{
   if(field.kind==='inaccessible'||field.excluded)return {field,status:'manual',reason:'Manual or protected field.'};
   if(/work|employ|experience|education|school|university/i.test(field.scope))return {field,status:'needs_review',reason:'Repeated history requires explicit record-to-section review.'};
   const candidates=Object.keys(aliases).filter(key=>aliases[key].some(a=>norm(a)===norm(field.label)||(!field.label&&norm(a)===norm(field.hint))));
   if(candidates.length!==1)return {field,status:'needs_review',reason:'No unambiguous profile fact.'};
   const factKey=candidates[0],value=values[factKey];
   if(value===null||value===undefined||value==='')return {field,status:'unknown',factKey,reason:'Candidate fact is missing.'};
   return {field,factKey,value:String(value),status:'supported',reason:'Exact profile field mapping.'};
  });
  for(const plan of plans)if(plan.status==='supported'&&plans.filter(p=>p.status==='supported'&&p.factKey===plan.factKey).length>1){for(const other of plans.filter(p=>p.factKey===plan.factKey)){other.status='needs_review';other.reason='Duplicate field labels require review.';}}
  return plans;
 }
 root.NextkinFieldMapping={planFill};
})(globalThis);
