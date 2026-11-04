(function(root){'use strict';
  const norm=v=>String(v??'').replace(/[_*:-]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  
  const aliases = {
    full_name: ['full name','name','applicant name'],
    email: ['email','email address','e-mail'],
    phone: ['phone','phone number','mobile','mobile phone','tel','cell phone'],
    first_name: ['first name','given name','forename'],
    last_name: ['last name','family name','surname'],
    current_city: ['city','current city','address level2'],
    current_state: ['state','province','region','current state','address level1'],
    zip_code: ['zip','zip code','postal code','postcode'],
    country: ['country','country name','nationality'],
    full_address: ['street address','address line1','address','street'],
    linkedin_url: ['linkedin','linkedin profile','linkedin url'],
    github_url: ['github','github url','github profile'],
    website: ['website','portfolio','personal website','portfolio url'],
    current_employer: ['current employer','current company','company'],
    current_title: ['current title','current job title','headline','title'],
    total_experience_years: ['years of experience','total experience','experience years'],
    primary_skills: ['skills','primary skills','technical skills','key skills'],
    authorized_in_usa: [
      'are you legally authorized to work in the united states',
      'legally authorized to work in the united states',
      'authorized to work in the united states',
      'legally authorized to work',
      'work authorization',
      'authorized in us',
      'authorized in usa'
    ],
    needs_sponsorship: [
      'will you now or in the future require sponsorship',
      'will you require visa sponsorship',
      'require sponsorship',
      'visa sponsorship',
      'sponsorship required',
      'need sponsorship now',
      'need sponsorship future'
    ]
  };

  function planFill(fields, candidate){
    const facts = candidate.provenance_status === 'confirmed' ? (candidate.confirmed_facts || {}) : candidate;
    const names = String(facts.full_name || candidate.full_name || '').trim().split(/\s+/);
    
    // Normalize boolean authorization values
    const authVal = facts.authorized_in_usa !== undefined ? facts.authorized_in_usa : candidate.authorized_in_usa;
    const sponsorVal = facts.need_sponsorship_now !== undefined ? (facts.need_sponsorship_now || facts.need_sponsorship_future) : (candidate.need_sponsorship_now || candidate.need_sponsorship_future);

    const values = {
      ...facts,
      first_name: names[0] || '',
      last_name: names.slice(1).join(' ') || '',
      authorized_in_usa: typeof authVal === 'boolean' ? authVal : null,
      needs_sponsorship: typeof sponsorVal === 'boolean' ? sponsorVal : null
    };

    const plans = fields.map(field => {
      if (field.kind === 'inaccessible' || field.excluded) {
        return { field, status: 'manual', reason: 'Manual or protected field.' };
      }
      if (/work|employ|experience|education|school|university/i.test(field.scope)) {
        return { field, status: 'needs_review', reason: 'Repeated history requires explicit record-to-section review.' };
      }

      const matchKeys = Object.keys(aliases).filter(key => 
        aliases[key].some(a => {
          const na = norm(a);
          const nl = norm(field.label);
          const nh = norm(field.hint);
          return nl === na || nl.includes(na) || (!nl && (nh === na || nh.includes(na)));
        })
      );

      if (matchKeys.length !== 1) {
        return { field, status: 'needs_review', reason: 'No unambiguous profile fact.' };
      }

      const factKey = matchKeys[0];
      let val = values[factKey];
      if (val === null || val === undefined || val === '') {
        return { field, status: 'unknown', factKey, reason: 'Candidate fact is missing.' };
      }

      // Convert boolean values for selects and radio buttons
      if (typeof val === 'boolean') {
        if (field.kind === 'radio' || field.kind === 'select' || field.kind === 'combobox') {
          const yesVal = val ? 'Yes' : 'No';
          return { field, factKey, value: yesVal, status: 'supported', reason: 'Boolean profile mapping.' };
        }
      }

      return { field, factKey, value: String(val), status: 'supported', reason: 'Exact profile field mapping.' };
    });

    for (const plan of plans) {
      if (plan.status === 'supported' && plans.filter(p => p.status === 'supported' && p.factKey === plan.factKey).length > 1) {
        for (const other of plans.filter(p => p.factKey === plan.factKey)) {
          other.status = 'needs_review';
          other.reason = 'Duplicate field labels require review.';
        }
      }
    }
    return plans;
  }

  root.NextkinFieldMapping = { planFill };
})(globalThis);
