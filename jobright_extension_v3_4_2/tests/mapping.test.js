// Run: node tests/mapping.test.js   (exit code 1 on any failure)
const path = require('path');
const root = path.resolve(__dirname, '../jobright_extension/core');
require(path.join(root, 'question-intent.js'));
const AB = require(path.join(root, 'answer-bank.js'));
const FM = require(path.join(root, 'field-mapping.js'));
const corpus = require('./recognition-corpus.js');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : (fail++, console.log('FAIL', name, detail)); };
const YN = [{ text: 'Yes', value: 'yes' }, { text: 'No', value: 'no' }];
const radio = (label, extra = {}) => ({ label, hint: '', kind: 'radio', options: YN, scope: '', ...extra });
const text = (label, extra = {}) => ({ label, hint: '', kind: 'text', options: [], scope: '', ...extra });

const candidate = {
  full_name: 'Priya Sharma', first_name: 'Priya', last_name: 'Sharma', email: 'priya@example.com', phone: '4155550123',
  authorized_in_usa: true, need_sponsorship_now: false, need_sponsorship_future: true, needs_sponsorship: true,
  open_to_relocation: true, total_experience_years: 8, availability: '2 weeks', salary_expectation: 100000,
  current_employer: 'Acme', current_job_title: 'Engineer', school: 'MIT', graduation_year: '2018',
  highest_education: "Bachelor of Arts in History", how_heard: 'LinkedIn', current_city: 'San Jose', current_state: 'CA'
};
const plan = (f, opts = { jobCountry: 'United States' }) => FM.planFill([f], candidate, opts)[0];
const filled = p => p.status === 'supported' && p.value !== undefined && p.value !== '';

// 1. Recognition recall on paraphrases
let hit = 0;
for (const [q, exp] of corpus) {
  const r = FM.resolveFact({ label: q, hint: '', kind: 'text', options: [] });
  r && r.key === exp && !r.review ? hit++ : (fail++, console.log('FAIL recall', q, '->', r && r.key, 'expected', exp));
}
pass += hit;

// 2. Precision: wordings that must NOT resolve to a candidate fact
const negatives = ['Why do you want to work at Acme?', 'Describe your experience with Python', 'How many years of experience do you have with React?',
  'How many years of experience in Python?', 'Do you need relocation assistance?', 'Reference phone number', 'Manager email', 'Company website',
  'Please describe a time you led a team', 'What is your favorite programming language?', 'Emergency contact phone', 'Name of your supervisor',
  'Previous employer', 'Desired job title', 'Interview availability', 'Do you have a pin for your account?',
  'Are you willing to work weekends?', 'Referrer name', 'Have you previously worked for this company?', 'State your reason for leaving',
  'What is your sexual orientation?', 'Company address', 'Years of experience managing teams',
  "What is your spouse's email?", "What is your spouse's first name?", "What is your spouse's phone number?",
  'What is the last name of your spouse?', 'Which university did your spouse attend?', "Your mother's maiden name", 'Emergency contact email'];
for (const q of negatives) check('negative: ' + q, FM.resolveFact({ label: q, hint: '', kind: 'text', options: [] }) === null,
  JSON.stringify(FM.resolveFact({ label: q, hint: '', kind: 'text', options: [] })));

// 3. Audit regressions: topic recognised, but must never be auto-answered
const mustNotFill = [
  radio('Are you not legally entitled to work in the US?'),
  radio('Are you legally ineligible to work in the US?'),
  radio('Are you authorized to work in the US without sponsorship?'),
  radio('Will you need visa sponsorship in Canada?'),
  radio('Do you require no visa sponsorship?'),
  radio('Are you able to work in the US night shift?'),
  radio('Can you legally work in the United States or Canada?'),
  radio('Can you relocate to San Francisco?'),
  text('What is your expected hourly pay?'),
  text('What is your expected monthly salary?'),
  text('What is your expected salary in INR?'),
  radio('Do you have a Bachelor\'s degree in Computer Science?'),
  text('What is your spouse\'s email?'), text('Which university did your spouse attend?'),
  text('What is your favorite programming language?', { name: 'email' }),
  text('Reference email', { element: { getAttribute: k => (k === 'autocomplete' ? 'email' : null) } }),
  text('Reference phone', { element: { getAttribute: k => (k === 'autocomplete' ? 'tel' : null) } }),
  text('How many years of relevant experience?'), text('Years of relevant work experience'),
  text('What is your expected hourly rate?'), radio('If the role is not in your city, would you relocate?'),
];
for (const f of mustNotFill) check('must not auto-fill: ' + f.label, !filled(plan(f)), JSON.stringify({ s: plan(f).status, v: plan(f).value }));

// 4. Improvements that must be preserved (and still fill)
const mustFill = [
  [text('What name do you go by?'), 'preferred_first_name'],
  [text('When could you join us?'), 'availability'],
  [text('What is your total professional experience?'), 'total_experience_years'],
  [radio('Can you lawfully undertake employment in the United States?'), 'authorized_in_usa'],
  [radio('Are you eligible to work in the United States?'), 'authorized_in_usa'],
  [radio('Are you legally authorized to work in the United States without restrictions?'), 'authorized_in_usa'],
  [text('Who is your current employer?'), 'current_employer'],
  [radio('Would you be open to moving to our office location?'), 'open_to_relocation'],
];
for (const [f, key] of mustFill) {
  const p = plan(f);
  check('still fills: ' + f.label, filled(p) && p.factKey === key, JSON.stringify({ s: p.status, k: p.factKey, v: p.value, r: p.reason }));
}

// ---- v3.4.2: safety enforcement tests (exact values, not just recognised keys) ----
const rich = { ...candidate, date_of_birth: '1990-01-01', linkedin_url: 'https://www.linkedin.com/in/priya' };
const planR = (f, c = rich, opts = { jobCountry: 'United States' }) => FM.planFill([f], c, opts)[0];
const leaks = (p, ...vals) => p.value !== undefined && vals.some(v => String(p.value).includes(v));
const url = (label) => ({ label, hint: '', kind: 'url', options: [], scope: '', element: null });

// 6. Third-party subject protection holds on every branch (DOB, URL, contact, hint-driven)
for (const [f, secret] of [
  [text("What is your spouse's date of birth?", { kind: 'date' }), '1990'],
  [text("Spouse's date of birth"), '1990'],
  [url('Spouse LinkedIn profile URL'), 'linkedin.com'],
  [text("What is your professor's email?"), 'priya@example.com'],
  [text("What is your attorney's phone number?"), '4155550123'],
  [text('Email of your company'), 'priya@example.com'],
  [text('Company email'), 'priya@example.com'],
  [text("Your doctor's phone number"), '4155550123'],
  [text('What is your favorite programming language?', { hint: 'email' }), 'priya@example.com'],
  [text('What is your favorite programming language?', { hint: 'phone' }), '4155550123'],
]) {
  const p = planR(f);
  check('no candidate data leak: ' + f.label + (f.hint ? ' [hint ' + f.hint + ']' : ''), !leaks(p, secret) && p.status !== 'supported', JSON.stringify({ s: p.status, k: p.factKey, v: p.value }));
}
// the candidate's own data must still fill when the question is about the candidate
for (const [f, expected] of [
  [text('Email address'), 'priya@example.com'],
  [text('Email', { hint: 'email' }), 'priya@example.com'],
  [text('Contact', { hint: 'phone' }), '4155550123'],
  [text('Current employer'), 'Acme'],
]) {
  const p = planR(f);
  check('still fills with exact value: ' + f.label, filled(p) && String(p.value).includes(expected), JSON.stringify({ s: p.status, v: p.value }));
}

// 7. Compensation: currency / period / type must be compatible
for (const label of ['Expected CTC', 'Expected annual salary in JPY', 'Salary expectation per annum in Canadian dollars', 'Expected salary in USD', 'Expected salary in euros']) {
  const p = planR(text(label));
  check('untyped salary does not fill: ' + label, !filled(p) && p.status === 'needs_review', JSON.stringify({ s: p.status, v: p.value, r: p.reason }));
}
{
  const typed = { ...rich, salary_currency: 'USD', salary_period: 'annual', compensation_type: 'base_salary' };
  const usd = planR(text('Expected salary in USD'), typed);
  check('typed USD annual salary fills USD question', filled(usd) && String(usd.value) === '100000', JSON.stringify(usd));
  const jpy = planR(text('Expected annual salary in JPY'), typed);
  check('typed USD salary still blocked for JPY', !filled(jpy), JSON.stringify(jpy));
  const ctc = planR(text('Expected CTC'), typed);
  check('base salary never answers CTC', !filled(ctc), JSON.stringify(ctc));
  const ctc2 = planR(text('Expected CTC'), { ...typed, compensation_type: 'total_compensation' });
  check('confirmed total compensation answers CTC', filled(ctc2) && String(ctc2.value) === '100000', JSON.stringify(ctc2));
  const plain = planR(text('Expected salary'));
  check('unqualified salary question still fills', filled(plain) && String(plain.value) === '100000', JSON.stringify(plain));
}

// 8. Compound education, relocation, country conditions
for (const label of ["Do you have a Master's degree or equivalent experience?", 'Do you have a Bachelor\'s degree from an accredited institution?',
  "Do you have a Bachelor's degree and five years of experience?", 'Do you have a college degree in Sociology?']) {
  const p = planR(radio(label));
  check('compound education needs review: ' + label, !filled(p) && p.status === 'needs_review', JSON.stringify({ s: p.status, v: p.value, r: p.reason }));
}
for (const label of ['Are you willing to move to Alaska?', 'Are you willing to relocate to our office in Alaska?', 'Are you willing to relocate at your own expense?', 'Will you relocate at your own cost?']) {
  const p = planR(radio(label));
  check('relocation condition not auto-answered: ' + label, !filled(p) && (p.status === 'needs_review' || !FM.isAiEligible(radio(label), p.factKey)), JSON.stringify({ s: p.status, v: p.value, r: p.reason }));
}
{
  const p = planR(radio('Are you open to relocation?'));
  check('plain relocation still fills Yes', filled(p) && String(p.value) === 'Yes', JSON.stringify(p));
}
for (const label of ['Do you require sponsorship in Nigeria?', 'Are you authorized to work in the USA and South Korea?', 'Are you authorized to work in Ghana?',
  'Will you now or in the future require sponsorship in Kenya?', 'Are you legally authorized to work in Vietnam?']) {
  const p = planR(radio(label));
  check('non-US country not answered from US facts: ' + label, !filled(p), JSON.stringify({ s: p.status, v: p.value, r: p.reason }));
}
{
  const p = planR(radio('Are you legally authorized to work in the United States?'));
  check('US authorization still fills Yes', filled(p) && String(p.value) === 'Yes', JSON.stringify(p));
  const q = planR(radio('Will you now or in the future require sponsorship in the United States?'));
  check('US sponsorship question still fills', q.factKey === 'needs_sponsorship' && q.status === 'supported', JSON.stringify(q));
}


// 9. Protected-question policy is shared by AI eligibility and answer-bank replay (mapper + application.js)
const bankEntry = (q, a) => ({ question: q, question_normalized: AB.normalizeQuestion(q), answer: a, company_scope: null });
for (const q of ['Have you ever been convicted of a felony?', 'Are you at least 18 years old?', 'Are you legally entitled to work in Canada?',
  'Have you ever been terminated for cause?', 'Are you subject to a non-compete?', 'Can you lift 50 pounds?']) {
  const f = radio(q);
  check('AI never drafts: ' + q, !FM.isAiEligible(f, undefined));
  const direct = AB.matchAnswer(f, [bankEntry(q, 'Yes')]);
  check('answer bank refuses replay: ' + q, direct === null);
  const planned = FM.planFill([f], candidate, { jobCountry: 'United States', answerBank: [bankEntry(q, 'Yes')] })[0];
  check('mapper does not replay saved answer: ' + q, !(planned.source === 'answer_bank') && !filled(planned), JSON.stringify({ s: planned.status, v: planned.value, src: planned.source }));
}
check('AI may still draft professional experience', FM.isAiEligible(text('Describe your Python development experience'), undefined));
{
  const q = 'Describe your experience leading a team';
  const f = text(q);
  const hit = AB.matchAnswer(f, [bankEntry(q, 'Led six engineers for two years.')]);
  check('answer bank still replays a safe professional answer', hit && hit.answer === 'Led six engineers for two years.');
}
// option semantics make a neutral-looking question protected
check('option-aware: community checkbox group is protected', !FM.isAiEligible({ label: 'Which of the following do you belong to?', hint: '', kind: 'checkbox-group', scope: '',
  options: ['Person with disability', 'Veteran', 'Parent', 'None of the above', 'I prefer not to answer'].map(x => ({ text: x, value: x })) }, undefined));
check('option-aware: bank refuses neutral label with demographic options', AB.matchAnswer({ label: 'Please select all that apply', kind: 'checkbox-group',
  options: [{ text: 'Veteran', value: 'Veteran' }, { text: 'Parent', value: 'Parent' }] }, [bankEntry('Please select all that apply', 'Veteran')]) === null);

// Candidate-specific availability / logistics must never be invented by AI.
for (const q of ['Can you work weekends?', 'Do you have reliable transportation?', 'Are you able to travel 50%?']) {
  check('AI cannot answer availability screening: ' + q,
    !FM.isAiEligible({ label: q, hint: '', kind: 'radio', options: YN, scope: '' }, undefined));
}
check('availability screening may reuse an explicitly reviewed saved answer',
  AB.matchAnswer({ label: 'Can you work weekends?', kind: 'radio', options: YN },
    [bankEntry('Can you work weekends?', 'Yes')])?.answer === 'Yes');

// 10. Veteran, community memberships and location (exact output values)
const opt = (...labels) => labels.map(x => ({ text: x, value: x }));
const group = (label, labels, kind = 'checkbox-group') => ({ label, hint: '', kind, options: opt(...labels), scope: '' });
const COMM = ['Person with disability', 'Neurodivergent', 'Veteran', 'Parent', 'Refugee or immigrant', 'None of the above', 'I prefer not to answer'];
const commQ = 'Which of the following communities do you belong to? Please select all that apply.';
const withFacts = (extra) => ({ ...rich, ...extra });
{
  const none = planR(group(commQ, COMM), withFacts({ veteran_status: true }));
  check('community group never inferred from veteran status', !filled(none) && none.status === 'needs_review' && none.factKey === 'community_memberships', JSON.stringify(none));
  const unconfirmed = planR(group(commQ, COMM), withFacts({ community_memberships: { selected: ['Parent'], confirmed: false } }));
  check('unconfirmed memberships stay unresolved', !filled(unconfirmed), JSON.stringify(unconfirmed));
  const multi = planR(group(commQ, COMM), withFacts({ community_memberships: { selected: ['Parent', 'Veteran'], disclosure_preference: 'disclose', confirmed: true } }));
  check('confirmed memberships select exactly those options', filled(multi) && JSON.stringify(multi.value) === JSON.stringify(['Veteran', 'Parent']) || (filled(multi) && JSON.stringify([...multi.value].sort()) === JSON.stringify(['Parent', 'Veteran'])), JSON.stringify(multi));
  check('None/opt-out never mixed with real selections', !multi.value.some(v => /none|prefer not/i.test(v)));
  const optout = planR(group(commQ, COMM), withFacts({ community_memberships: { selected: ['Parent'], disclosure_preference: 'decline', confirmed: true } }));
  check('confirmed opt-out selects only the opt-out option', filled(optout) && JSON.stringify(optout.value) === JSON.stringify(['I prefer not to answer']), JSON.stringify(optout));
  const nota = planR(group(commQ, COMM), withFacts({ community_memberships: { selected: [], none_of_the_above: true, confirmed: true } }));
  check('explicit none-of-the-above selects only that option', filled(nota) && JSON.stringify(nota.value) === JSON.stringify(['None of the above']), JSON.stringify(nota));
  const empty = planR(group(commQ, COMM), withFacts({ community_memberships: { selected: [], confirmed: true } }));
  check('empty confirmed list does not default to None of the above', !filled(empty), JSON.stringify(empty));
  const neutral = planR(group('Select all that apply', COMM), withFacts({ community_memberships: { selected: ['Parent'], confirmed: true } }));
  check('option semantics detect community group with neutral label', filled(neutral) && neutral.factKey === 'community_memberships' && neutral.value[0] === 'Parent', JSON.stringify(neutral));
  const ambiguous = planR(group(commQ, COMM), withFacts({ community_memberships: { selected: ['Teacher'], confirmed: true } }));
  check('unmatched membership needs review', !filled(ambiguous), JSON.stringify(ambiguous));
}
{
  const VET = ['I am a protected veteran', 'I am not a protected veteran', 'I prefer not to answer'];
  const q = 'Please indicate your veteran status';
  const f = { label: q, hint: '', kind: 'radio', options: opt('I am a veteran', 'I am not a veteran', 'I prefer not to answer'), scope: '' };
  const vTrue = planR(f, withFacts({ veteran_status: true })), vFalse = planR(f, withFacts({ veteran_status: false }));
  check('veteran true -> "I am a veteran"', filled(vTrue) && vTrue.value === 'I am a veteran', JSON.stringify(vTrue));
  check('veteran false -> "I am not a veteran"', filled(vFalse) && vFalse.value === 'I am not a veteran', JSON.stringify(vFalse));
  const pf = { label: 'Do you identify as a protected veteran?', hint: '', kind: 'radio', options: opt(...VET), scope: '' };
  const ordinary = planR(pf, withFacts({ veteran_status: true }));
  check('ordinary veteran status does not answer protected-veteran question', !filled(ordinary) && ordinary.factKey === 'protected_veteran', JSON.stringify(ordinary));
  const prot = planR(pf, withFacts({ protected_veteran: false }));
  check('protected_veteran false -> not a protected veteran', filled(prot) && prot.value === 'I am not a protected veteran', JSON.stringify(prot));
  const stored = planR({ ...pf, label: 'Voluntary self-identification of protected veteran status' }, withFacts({ veteran_status: 'I am not a protected veteran' }));
  check('stored protected-veteran text still fills', filled(stored) && stored.value === 'I am not a protected veteran', JSON.stringify(stored));
  const optOut = planR(f, withFacts({ veteran_status: 'I prefer not to answer' }));
  check('stored opt-out fills the opt-out option', filled(optOut) && /prefer not/i.test(optOut.value), JSON.stringify(optOut));
  const served = planR(radio('Have you served in the military?'), withFacts({ military_service: false }));
  check('military service history is its own fact (false -> No)', filled(served) && served.value === 'No', JSON.stringify(served));
  const serving = planR(radio('Are you currently serving in the armed forces?'), withFacts({ veteran_status: true }));
  check('veteran status does not answer current service', !filled(serving), JSON.stringify(serving));

  // v3.4.3 semantic regressions: an ordinary Boolean must never pick a classification.
  for (const subtype of ['I am a protected veteran', 'I am a disabled veteran']) {
    const subtypeField = radio('Please indicate your veteran status', { options: opt(subtype, 'I am not a veteran') });
    const inferred = planR(subtypeField, withFacts({ veteran_status: true }));
    check('ordinary veteran status never selects ' + JSON.stringify(subtype), !filled(inferred), JSON.stringify(inferred));
  }
  const disabledWithFact = planR(radio('Please indicate your veteran status', {
    options: opt('I am a disabled veteran', 'I am not a veteran')
  }), withFacts({ veteran_status: true, protected_veteran: true, disability_status: 'I have a disability' }));
  check('protected veteran fact still does not imply disabled veteran', !filled(disabledWithFact), JSON.stringify(disabledWithFact));

  const negated = planR(group(commQ, COMM), withFacts({
    community_memberships: { selected: ['Veteran', 'Not a veteran'], confirmed: true }
  }));
  check('negative community selection stays unresolved', !filled(negated), JSON.stringify(negated));
  const negatedExact = planR(group(commQ, ['Veteran', 'Not a veteran', 'Parent', 'None of the above']), withFacts({
    community_memberships: { selected: ['Not a veteran'], confirmed: true }
  }));
  check('not-a-veteran option never counts as a membership', !filled(negatedExact), JSON.stringify(negatedExact));
}
{
  const intended = (label, extra) => planR(text(label), withFacts({ country: 'United States', ...extra }));
  for (const label of ['Which country do you intend to work from?', 'Where will you be working from?', 'From which country will you perform your duties?', 'In which country will you be based?']) {
    const miss = intended(label, {});
    check('residence never substituted for intended work country: ' + label, !filled(miss) && miss.factKey === 'intended_work_country', JSON.stringify(miss));
    const hitp = intended(label, { country: 'India', intended_work_country: 'United States' });
    check('intended work country differs from residence: ' + label, filled(hitp) && hitp.value === 'United States', JSON.stringify(hitp));
  }
  const pref = intended('What is your preferred work location?', {});
  check('preferred location never filled from current location', !filled(pref) && pref.factKey === 'preferred_work_location', JSON.stringify(pref));
  const pref2 = intended('What is your preferred work location?', { preferred_work_location: 'Austin, TX' });
  check('preferred location uses its own fact', filled(pref2) && pref2.value === 'Austin, TX', JSON.stringify(pref2));
  const office = intended('Which office location do you prefer?', { preferred_office_location: 'Seattle' });
  check('preferred office location', filled(office) && office.value === 'Seattle', JSON.stringify(office));
  const reloc = intended('Where are you willing to relocate?', {});
  check('relocation destinations need confirmation', !filled(reloc) && reloc.factKey === 'relocation_destinations', JSON.stringify(reloc));
  const cur = intended('Where are you currently located?', { current_location: 'San Jose, CA' });
  check('current location still maps to current_location', cur.factKey === 'current_location', JSON.stringify(cur));
  const live = intended('Which country do you live in?', { country: 'United States' });
  check('country of residence', filled(live) && live.factKey === 'country' && live.value === 'United States', JSON.stringify(live));
  const cit = planR(text('What is your country of citizenship?'), withFacts({ citizenship_status: 'India' }));
  check('citizenship stays separate from residence', cit.factKey === 'citizenship_status', JSON.stringify(cit));
}

// the heuristic layer must never claim an exact match
const heuristic = FM.resolveFact({ label: 'How soon can you join?', hint: '', kind: 'text', options: [] });
check('intent hit is not exact', heuristic && heuristic.exact === false);

// 5. Precision / recall summary
const total = corpus.length;
console.log(`recall ${hit}/${total} (${(100 * hit / total).toFixed(1)}%)   negatives resolved to a fact: ` +
  negatives.filter(q => FM.resolveFact({ label: q, hint: '', kind: 'text', options: [] })).length + `/${negatives.length}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
