/*
 * Question-intent classifier.
 *
 * Job portals ask the same thing in many different words ("Are you eligible to work in the US?",
 * "Do you have the legal right to work in the United States?", "Can you legally work in the USA?").
 * Exact/prefix alias lists in field-mapping.js cannot cover every phrasing, so this module recognises
 * the *meaning* of a question: it normalises the text, then scores concept rules (all required
 * concept groups must be present, no veto group may be present) and returns the best fact key.
 *
 * It is only a recogniser. It never decides a value, and field-mapping.js keeps every safety rule
 * (consequential-fact review, US-only authorization, consent/signature manual) on top of it.
 */
(function (root) {
  'use strict';

  // ---------- normalisation ----------
  function normalize(input) {
    let t = String(input ?? '');
    t = t.replace(/([a-z])([A-Z])/g, '$1 $2');                       // camelCase -> words
    t = t.toLowerCase();
    t = t.replace(/[‘’`]/g, "'");
    t = t.replace(/\b(can|won|don|doesn|didn|isn|aren|wasn|couldn|wouldn|shouldn|haven|hasn)'t\b/g, (m, w) => w + ' not');
    t = t.replace(/\b(you|we|they|i)'(re|ve|ll|d)\b/g, '$1 $2');
    t = t.replace(/'s\b/g, 's').replace(/'/g, '');
    t = t.replace(/\bu\.\s?s\.?\s?a?\.?(?=\W|$)/g, ' us ');            // U.S. / U.S.A.
    t = t.replace(/\bunited states of america\b|\bunited states\b|\bamerica\b|\busa\b/g, ' us ');
    t = t.replace(/\be[\s-]?mail\b|\bemail\b/g, ' email ');
    t = t.replace(/\bh[\s-]?1[\s-]?b\b/g, ' h1b ');
    t = t.replace(/\b(required|optional|mandatory)\b/g, ' ');
    t = t.replace(/[*✱∗]/g, ' ');
    t = t.replace(/[^a-z0-9]+/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }

  const has = (t, re) => re.test(t);
  // yes/no style question ("are you ...", "do you ...", "can you ...")
  const isYesNoLead = t => /^(?:are|is|do|does|did|will|would|can|could|have|has|may|should)\s/.test(t) ||
    /\b(?:are you|do you|will you|would you|can you|could you|have you|do we)\b/.test(t);

  // ---------- concept groups ----------
  const WORK = '(?:work|working|employ\\w*|job|role|position|hire[d]?)';
  const US = '(?:us|country|jurisdiction|location|locale|where the (?:job|role|position) is|where this (?:job|role|position) is|this role|for which you are applying)';
  const AUTHZ = '(?:eligible|eligibility|authori[sz]ed?|authori[sz]ation|permitted|permission|allowed|legal|legally|lawful|lawfully|entitled|entitlement|right|rights|able|valid|clear(?:ed|ance)?|qualif\\w+)';
  const SPONSOR_WORD = '(?:sponsor\\w*|petition\\w*)';
  const VISA_HELP = '(?:visa|immigration|work permit|work authori[sz]ation|employment authori[sz]ation|h1b|green card)';

  // Each rule: key, weight (specificity), all: [regex...] (every one must match), none: [regex...] (veto).
  // `fn` optionally gets (text) for extra checks.
  const RULES = [
    // --- work authorization / sponsorship / visa ---
    { key: 'needs_sponsorship', weight: 90,
      all: [new RegExp(`\\b${SPONSOR_WORD}\\b|\\b${VISA_HELP}\\b.*\\b(?:support|assist\\w*|help|transfer|filing|petition\\w*|sponsor\\w*)\\b|\\b(?:support|assist\\w*|help|transfer|filing)\\b.*\\b${VISA_HELP}\\b`)],
      none: [/\b(?:can|could|will|do|does)\s+(?:we|you)\s+(?:offer|provide)\b.*\bsponsor/, /\bsponsor(?:ed|ing)?\s+(?:event|content|post|link|ad)/, /\bsponsorship\s+(?:opportunit|package|deck|level)/] },
    { key: 'needs_sponsorship', weight: 85,
      all: [/\b(?:require|requires|required|need|needs|needed)\b.*\b(?:sponsored|sponsor\w*)\b|\bsponsored\b.*\b(?:work permit|visa|employment)\b/] },
    { key: 'authorized_in_usa', weight: 80,
      all: [new RegExp(`\\b${AUTHZ}\\b`), new RegExp(`\\b${WORK}\\b`), new RegExp(`\\b${US}\\b`)],
      none: [/\bsponsor/, /\bvisa support/, /\bwhat\b.*\b(?:type|status|category|kind|classification)\b/, /\bwhich\b.*\b(?:type|status|category|visa)\b/, /\b(?:history|experience with|years)\b/, /\bremote(?:ly)?\b.*\b(?:from|in)\b.*\b(?:state|city)\b/] },
    { key: 'authorized_in_usa', weight: 78,
      all: [/\b(?:work authori[sz]ation|employment authori[sz]ation|right to work|legal right to work|authori[sz]ed to work|eligible to work|eligibility to work|legally (?:able|allowed|permitted|entitled) to work|permitted to work|allowed to work|lawfully (?:able|allowed|permitted) to work|can you (?:legally )?work)\b/, /\b(?:us|country)\b/],
      none: [/\bsponsor/, /\bwhat\b.*\b(?:type|status|category|kind|classification)\b/, /\bwhich\b.*\b(?:type|status|category|visa)\b/] },
    { key: 'visa_status', weight: 75,
      all: [new RegExp(`\\b${VISA_HELP}\\b`), /\b(?:status|type|category|classification|held|hold|holding|current|currently|kind|what|which)\b/],
      none: [/\bsponsor/, /\b(?:support|assist\w*|transfer)\b/, /^(?:are|do|does|will|would|can|could|have|has)\s+you\s+(?:legally|currently\s+)?(?:authori|eligible|permitted|allowed)/] },

    // --- relocation ---
    { key: 'open_to_relocation', weight: 85,
      all: [/\b(?:relocat\w*|reloc)\b|\b(?:mov(?:e|ing)|commut\w*)\s+(?:to|for|near)\b/, /\b(?:willing|open|able|consider|comfortable|ready|prepared|happy|ok|okay|would you|can you|are you|if)\b/],
      none: [/\b(?:assistance|package|bonus|support|reimburse\w*|allowance|expenses|stipend|benefit)\b/, /\bhave you\s+relocated\b/] },

    // --- availability / start date / notice ---
    { key: 'availability', weight: 80,
      all: [/\b(?:notice period|notice|start date|starting date|joining date|date of joining|available from|available to start|available to join|availability date|earliest (?:start|date|you|possible|available)|how soon|when (?:can|could|would|are) you (?:start|join|begin|be available|available)|able to (?:start|join)|ready to (?:start|join)|start working|begin working|commence|date available|date you can start|when are you available|when you can start|join us)\b/],
      none: [/\b(?:interview|call|meeting|phone screen|schedule|slot|calendar)\b/, /\b(?:end date|leave date|previous|prior|last day|graduat\w*)\b/, /\b(?:employment|work experience|job)\s+(?:start|history)\b/] },

    // --- salary ---
    { key: 'current_salary', weight: 88,
      all: [/\b(?:current|present|last|previous|existing)\s+(?:annual\s+|base\s+|monthly\s+)?(?:salary|ctc|compensation|pay|package|remuneration)\b|\bcurrent ctc\b|\bccts?\b/] },
    { key: 'salary_expectation', weight: 80,
      all: [/\b(?:salary|compensation|ctc|ectc|pay|remuneration|wage|wages|package|rate|base|comp|stipend)\b/, /\b(?:expect\w*|desir\w*|requir\w*|target\w*|minimum|looking for|seeking|asking|prefer\w*|ectc|requested|range|ideal|hoping|want)\b/],
      none: [/\b(?:current|present|previous|last|existing) (?:salary|ctc|compensation|pay)\b/, /\bvendor|bill rate|c2c|w2 rate\b/] },
    { key: 'salary_expectation', weight: 82, all: [/\b(?:expected ctc|ectc|expected salary|desired salary|salary expectations?|salary requirements?|pay expectations?|compensation expectations?)\b/] },

    // --- experience ---
    { key: 'total_experience_years', weight: 78,
      all: [/\b(?:years?|yrs?)\b/, /\b(?:experience|exp|working|worked|professional|industry|career|field|profession)\b/],
      none: [/\b(?:relevant|related|similar|comparable)\b/, /\b(?:with|using|in)\s+(?!total|overall|your|the|this|that|work|professional|it\b|years|a\b)\w/, /\b(?:program|language|framework|tool|software|platform|technology|technologies|skill|skills|certification)\b/, /\bmanag\w*|\blead\w*|\bsupervis\w*/] },
    { key: 'total_experience_years', weight: 76,
      all: [/\b(?:how long|how many years|how much)\b.*\b(?:experience|working|worked|industry|field|profession|career|employed)\b|\btotal (?:work |professional |overall |relevant )?experience\b|\b(?:overall|total) experience\b/],
      none: [/\b(?:with|using)\s+\w/, /\b(?:relevant|related|similar|comparable)\b/] },

    // --- names ---
    { key: 'preferred_first_name', weight: 80,
      all: [/\b(?:what should we call you|what do you (?:like|prefer) to be called|what name do you (?:go by|use)|go by|goes by|known as|nickname|chosen name|preferred (?:first )?name|name you prefer)\b/] },
    { key: 'full_name', weight: 70,
      all: [/^(?:what is |whats |enter |please enter |provide |tell us |type |your |state )?(?:your |the |applicants? |candidates? )?(?:full |legal |complete )?name(?: as (?:it appears )?(?:on|in) (?:your )?\w+(?: \w+)?)?(?: please)?$/] },
    { key: 'full_name', weight: 72, all: [/\b(?:full|legal|complete)\s+name\b|\bname as (?:it appears|on)\b|\bwhat is your name\b/], none: [/\b(?:first|last|middle|family|sur|given|preferred|company|school|referr\w*|manager|reference|emergency|employer|institution|university|college|degree|skill|file|user)\b/] },
    { key: 'first_name', weight: 78, all: [/\b(?:first name|given names?|forename|christian name|first given)\b/], none: [/\b(?:preferred|reference|emergency|manager|referr\w*)\b/] },
    { key: 'last_name', weight: 78, all: [/\b(?:last name|family name|surname|second name)\b/], none: [/\b(?:reference|emergency|manager|referr\w*)\b/] },

    // --- contact ---
    { key: 'email', weight: 70,
      all: [/\bemail\b/],
      none: [/\b(?:confirm|verify|verification|re ?enter|retype|repeat|vendor|recruiter|manager|reference|referr\w*|supervisor|emergency|employer|hiring|staffing|friend|colleague|personal)\b/] },
    { key: 'phone', weight: 70,
      all: [/\b(?:phone|mobile|cell|cellphone|telephone|tel|contact number|contact no|whatsapp|call you|reach you by phone)\b/],
      none: [/\b(?:supervisor|reference|referr\w*|emergency|manager|employer|extension|type|carrier|country code|vendor|recruiter)\b/] },

    // --- location ---
    { key: 'current_location', weight: 76,
      all: [/\b(?:where (?:are you|do you) (?:currently |presently )?(?:located|based|live|reside|residing|staying|living)|current(?:ly)? (?:location|residence|located)|present location|city and state|city state|city country|location city|location of residence|your location|based in|which location are you (?:currently )?(?:in|located|based))\b/],
      none: [/\b(?:work|office|job|role|position|preferred|desired|interested|relocat\w*)\s+location\b/, /\bwould you like to work\b/] },
    { key: 'current_city', weight: 74,
      all: [/\b(?:city|town|municipality)\b/, /\b(?:live|living|reside|resid\w*|located|based|current\w*|present\w*|your|which|home)\b/],
      none: [/\b(?:state|province|country|region|zip|postal|birth|born|office|preferred|desired|interested|work location|relocat\w*)\b/] },
    { key: 'current_state', weight: 72,
      all: [/\b(?:state|province|region|county)\b/, /\b(?:live|living|reside|resid\w*|located|based|current\w*|present\w*|your|which|home)\b/],
      none: [/\b(?:city|country|zip|postal|birth|born|office|preferred|desired|interested|work location|relocat\w*|state the|state your|state if|please state|statement|of the art|us state of)\b/] },
    { key: 'zip_code', weight: 80, all: [/\b(?:zip|zipcode|postal|postcode|post code|pin ?code)\b/], none: [/\b(?:birth|office)\b/] },
    { key: 'country', weight: 72,
      all: [/\bcountry\b/, /\b(?:live|living|reside|resid\w*|located|based|current\w*|present\w*|your|which|home|of residence)\b/],
      none: [/\b(?:citizen\w*|birth|born|work|employ\w*|intend\w*|code|origin|nationality|authori\w*|eligible|phone|mobile|dial|issuing|passport)\b/] },
    { key: 'full_address', weight: 72,
      all: [/\b(?:street|home|mailing|residential|permanent|current|postal|billing)\s+address\b|\baddress\s+line\s*(?:1|one)\b|\bstreet address\b|\baddress 1\b|\bwhere do you live\b.*\baddress\b/],
      none: [/\bemail\b|\bip address\b|\bwebsite\b|\bweb address\b|\bcompany address\b|\boffice address\b/] },

    // --- links ---
    { key: 'linkedin_url', weight: 85, all: [/\blinked ?in\b/] },
    { key: 'github_url', weight: 85, all: [/\bgit ?hub\b/] },
    { key: 'website', weight: 72, all: [/\b(?:portfolio|personal (?:website|site|web ?page|url|page)|your (?:website|web ?site|homepage)|blog url|website url)\b/], none: [/\b(?:company|employer|linkedin|github|twitter)\b/] },

    // --- employment / education ---
    { key: 'current_employer', weight: 78,
      all: [/\b(?:(?:current|present|most recent|latest|last|recent|existing)\s+(?:employer|company|organi[sz]ation|firm|workplace)|where do you (?:currently |presently )?work|who do you (?:currently |presently )?work for|who is your (?:current |present )?employer|company you (?:currently )?work(?:ed)? (?:for|at|with)|employer name|name of (?:your )?(?:current )?employer|currently employed (?:at|by|with))\b/],
      none: [/\b(?:previous|prior|former|reference|referr\w*)\b/] },
    { key: 'current_title', weight: 78,
      all: [/\b(?:(?:current|present|most recent|latest|last|recent|existing)\s+(?:job\s+|work\s+)?(?:title|role|position|designation|job)|what do you (?:currently )?do for (?:a )?(?:living|work)|your (?:job )?title|your (?:current )?designation|what is your (?:current )?(?:role|position|designation|job title)|present designation|job title)\b/],
      none: [/\b(?:desired|preferred|target|applying|interested|looking)\b/] },
    { key: 'highest_education', weight: 78,
      all: [/\b(?:highest (?:level of )?(?:education|degree|qualification)|level of education|education(?:al)? level|degree (?:level|obtained|earned|held|attained|completed)|(?:level|type) of degree|qualification level|highest qualification|educational qualification|do you (?:hold|have|possess) (?:a |an |your )?(?:bachelor\w*|master\w*|phd|doctorate|doctoral|associate\w*|college degree|university degree|degree)|have you (?:completed|earned|obtained|received) (?:a |an |your )?(?:bachelor\w*|master\w*|phd|doctorate|associate\w*|degree)|what is your (?:education|degree|qualification))\b/],
      none: [/\b(?:required|preferred)\b/] },
    { key: 'school', weight: 76,
      all: [/\b(?:school|university|college|institution|institute|alma mater)\b/, /\b(?:attend\w*|graduat\w*|name|go to|went|studied|study|studying|currently|last|most recent|which|where)\b/],
      none: [/\b(?:high school|gpa|major|field of study|degree type|year|date|month|start|end|city|state|country|location|address|rank)\b/, /\bsponsor/] },
    { key: 'graduation_year', weight: 78,
      all: [/\b(?:graduat\w*|graduation|passing|pass out|passed out|completion|completed|degree completion)\b/, /\b(?:year|when|date)\b/],
      none: [/\b(?:expected)\b.*\b(?:month)\b/] },
    { key: 'primary_skills', weight: 70,
      all: [/\b(?:skills?|tech stack|technologies|competenc\w+|expertise|programming languages|tools you (?:use|know)|proficient|proficiency)\b/, /\b(?:list|your|key|primary|top|main|core|technical|relevant|describe|enter|add|what|tell)\b/],
      none: [/\b(?:years?|how many|how long|rate|rating|level of|do you have|have you|certif\w*|soft|language (?:spoken|proficiency)|fluen\w*|english|spoken|written)\b/] },

    // --- self identification ---
    { key: 'gender', weight: 78, all: [/\b(?:gender|sex)\b/], none: [/\b(?:sexual|orientation|identity (?:other|not)|transgender)\b/, /\bsex(?:ual)? (?:offen\w*|crime|harass\w*)\b/] },
    { key: 'pronouns', weight: 78, all: [/\bpronouns?\b/] },
    { key: 'race', weight: 78, all: [/\b(?:race|racial|ethnic\w*|hispanic|latino|latina|latinx|ethnicity)\b/] },
    { key: 'veteran', weight: 78,
      all: [/\b(?:veterans?|military|armed forces|armed services|served in the (?:us )?(?:military|armed|army|navy|air force|marine|coast guard)|military service|us military)\b/],
      none: [/\b(?:spouse|family member|dependent|branch|rank|discharge date|service dates?)\b/] },
    { key: 'disability', weight: 78, all: [/\b(?:disabilit\w*|disabled|handicap\w*|(?:physical|mental) (?:condition|impairment|disorder)|chronic (?:condition|illness))\b/], none: [/\baccommodation\b.*\binterview\b/] },
    { key: 'citizenship_status', weight: 76, all: [/\b(?:citizen\w*|nationality|national of)\b/], none: [/\bsponsor|visa support\b/] },

    // --- misc ---
    { key: 'how_heard', weight: 78,
      all: [/\b(?:(?:how|where) did you (?:first )?(?:hear|find|learn|discover|come across|see|know|get to know|come to know|come to apply|get here|end up)|how did you come|what brought you|how were you referred|referral source|source of (?:application|referral)|application source|how you (?:heard|found|learned)|where you (?:heard|found|learned|saw)|how do you know about|how did you hear|how did you find|where did you (?:hear|find|learn|see)|source)\b/],
      none: [/\b(?:open source|source code|resource|sourcing|data source)\b/] },
    { key: 'date_of_birth', weight: 85, all: [/\b(?:date of birth|birth ?date|birthday|dob|born on|d o b)\b/], none: [/\b(?:place|city|country|state|certificate) of birth\b/] }
  ];

  // Concept hits that mean the label is really a free-text/essay question about a topic, not a fact request.
  const ESSAY_LEAD = /^(?:describe|explain|tell us|why|elaborate|walk us|share (?:an|a|your) (?:example|experience|story)|what (?:interests|excites|motivates|attracts))\b/;

  // Another person's details (spouse, reference, manager ...) are never the candidate's own facts.
  const THIRD_PARTY = /\b(?:spouses?|husband|wife|domestic partner|partner s|parents?(?! compan)|mother|father|guardian|child|children|sons?|daughters?|sibling|brother|sister|relatives?|family member|dependents?|beneficiar\w*|next of kin|emergency|references?|referees?|referr\w*|supervisors?|hiring manager|your manager|line manager|recruiter|colleague|co worker|friend)\b/;

  // ONE protected-question policy shared by AI eligibility, answer-bank replay and the mapper.
  // Covers legal/eligibility, age, criminal history, employment history disclosures, physical/medical,
  // compensation, identity and demographic questions. The question's option labels count as evidence too.
  const PROTECTED_QUESTION = /\b(?:first name|last name|full name|legal name|your name|email|phone|address|zip|postal|date|birthday|birth|dob|age|at least \d+|over \d+|under \d+|legal age|\d+\s*years\s*old|salary|compensation|wage|pay|hourly rate|desired pay|pay rate|citizen\w*|national|nationality|sponsor\w*|visa|immigra\w*|refugee\w*|work authori\w*|right to work|eligible to work|eligible for employment|legally|entitled to work|employment eligibility|authori[sz]ed to work|work permit|convict\w*|felon\w*|misdemeanor|criminal|crime|arrest\w*|background check|drug (?:test|screen)\w*|disab\w*|neurodiver\w*|veteran\w*|military|armed forces|ethnic\w*|race|racial|gender|sex|sexual|orientation|lgbt\w*|transgender|pronoun\w*|religio\w*|hispanic|latino|caste|marital|pregnan\w*|protected class|self[- ]?identif\w*|communit(?:y|ies)|medical|health|physical\w*|accommodat\w*|essential functions|lift|pounds|lbs|demograph\w*|terminat\w*|fired|dismiss\w*|laid off|resign\w*|non[- ]?compete|noncompete|restrictive covenant|conflict of interest|relocat\w*|expense|reimburse\w*|signatur\w*|attest\w*|certif\w*|declar\w*|acknowledg\w*|agree\w*|consent|privacy|terms|arbitration|captcha|password|secret|token|otp|ssn|social security|tax id|bank|credit card)\b/i;

  function isProtectedQuestion(label, optionTexts) {
    const opts = Array.isArray(optionTexts) ? optionTexts.map(o => (o && typeof o === 'object') ? [o.text, o.label, o.value].filter(Boolean).join(' ') : String(o || '')).join(' ') : String(optionTexts || '');
    const query = `${label || ''} ${opts}`.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
    return PROTECTED_QUESTION.test(query);
  }

  // Availability and logistics are specific to the candidate and the role. AI must never invent
  // these answers, but an explicitly reviewed saved answer may be reused (unlike legal/demographic
  // questions, which block replay as well).
  const AVAILABILITY_SCREENING = /\b(?:work\s+weekends?|weekend\s+(?:work|availability|shifts?)|reliable\s+transport\w*|commut\w*|travel\s*\d+\s*%|able\s+to\s+travel|willing\s+to\s+travel|travel\s+required|overnight\s+(?:travel|stay)|on[- ]?call|rotating\s+shifts?|night\s+shifts?|work\s+schedule|available\s+to\s+(?:work|start|travel)|availability\s+(?:to|for))\b/i;
  function isAvailabilityScreeningQuestion(label, optionTexts) {
    const opts = Array.isArray(optionTexts) ? optionTexts.map(o => (o && typeof o === 'object') ? [o.text, o.label, o.value].filter(Boolean).join(' ') : String(o || '')).join(' ') : String(optionTexts || '');
    const query = `${label || ''} ${opts}`.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
    return AVAILABILITY_SCREENING.test(query);
  }
  const SENSITIVE_KEYS = new Set(['authorized_in_usa', 'needs_sponsorship', 'visa_status', 'open_to_relocation', 'citizenship_status',
    'gender', 'race', 'veteran', 'disability', 'date_of_birth']);

  // Visible label decides. Hint may add context. Placeholder/name/id/aria are only supporting evidence and are
  // consulted only when the visible label is empty or a bare one/two-word label; they never override a real question.
  function classify(label, hint, extra) {
    const main = normalize(label);
    const hintText = normalize(hint);
    const meta = normalize(extra);
    const mainWords = main ? main.split(' ').length : 0;
    const sources = [];
    if (main) sources.push([main, 0]);
    if (main && hintText) sources.push([main + ' ' + hintText, 1]);
    if (!main && hintText) sources.push([hintText, 1]);
    // metadata is allowed to stand in only for a missing or terse visible label
    if (mainWords <= 2 && meta) sources.push([[main, hintText, meta].filter(Boolean).join(' '), 2]);

    let candidates = [];
    for (const [text, p] of sources) {
      if (THIRD_PARTY.test(text.replace(/\b(?:referral source|source of referral|referred by (?:a )?(?:job board|website|search))\b/g, ' '))) return null;
      if (ESSAY_LEAD.test(text) && text.split(' ').length > 6) continue;
      for (const rule of RULES) {
        if (rule.all.every(re => re.test(text)) && !(rule.none || []).some(re => re.test(text))) {
          candidates.push({ key: rule.key, score: rule.weight - p * 15, pass: p });
        }
      }
      if (candidates.length) break;
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates[0];
    const rivals = candidates.filter(c => c.key !== top.key);
    if (rivals.length) {
      // Sponsorship words always beat plain authorization words.
      if (rivals.every(r => (r.key === 'authorized_in_usa' && top.key === 'needs_sponsorship') ||
        (r.key === 'needs_sponsorship' && top.key === 'authorized_in_usa'))) {
        return { key: 'needs_sponsorship', score: top.score, via: 'intent', compound: true, pass: top.pass };
      }
      // Competing concepts on a sensitive fact are never settled by a score gap.
      if (SENSITIVE_KEYS.has(top.key) || rivals.some(r => SENSITIVE_KEYS.has(r.key))) return null;
      if (top.score - rivals[0].score < 8) return null;
    }
    return { key: top.key, score: top.score, via: top.pass === 2 ? 'metadata' : 'intent', pass: top.pass };
  }

  // HTML autocomplete tokens are authoritative semantics when a page provides them.
  const AUTOCOMPLETE_FACTS = {
    'given-name': 'first_name', 'family-name': 'last_name', 'name': 'full_name', 'nickname': 'preferred_first_name',
    'email': 'email', 'tel': 'phone', 'tel-national': 'phone', 'postal-code': 'zip_code', 'address-level1': 'current_state',
    'address-level2': 'current_city', 'country-name': 'country', 'country': 'country', 'street-address': 'full_address',
    'address-line1': 'full_address', 'organization': 'current_employer', 'organization-title': 'current_title',
    'bday': 'date_of_birth', 'url': 'website', 'sex': 'gender'
  };
  function fromAutocomplete(value) {
    const tokens = String(value || '').toLowerCase().split(/\s+/).filter(Boolean);
    for (const tok of tokens) if (AUTOCOMPLETE_FACTS[tok]) return AUTOCOMPLETE_FACTS[tok];
    return null;
  }

  root.NextkinQuestionIntent = { classify, normalize, fromAutocomplete, RULES, isYesNoLead, THIRD_PARTY,
    PROTECTED_QUESTION, isProtectedQuestion, AVAILABILITY_SCREENING, isAvailabilityScreeningQuestion };
  if (typeof exports !== 'undefined') {
    exports.classify = classify; exports.normalize = normalize; exports.fromAutocomplete = fromAutocomplete;
    exports.NextkinQuestionIntent = root.NextkinQuestionIntent;
  }
})(globalThis);
