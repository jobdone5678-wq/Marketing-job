import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGroundedAnswer, uniqueConfirmedChoice } from '../../src/lib/ai/grounded.ts';
import {
  isExplicitDemographicDecline,
  isNoneOfTheAboveOption,
} from '../../src/lib/profile/demographic-preferences.ts';
import { buildVerifiedFacts } from '../../src/lib/ai/verified-facts.ts';
import { inferQuestionDescriptor } from '../../src/lib/ai/planner.ts';

test('grounded engine: question-specific typed validation & anti-hallucination guard', async (t) => {
  await t.test('1. rejects answers relying on word-overlap without verified fact backing', () => {
    // A profile that mentions some text but has NO fact backing for "security clearance"
    const facts = buildVerifiedFacts({
      full_name: 'John Candidate',
      current_city: 'Austin',
      current_state: 'TX',
    });

    // Question asks about security clearance
    const question = {
      label: 'Do you hold an active Top Secret security clearance?',
      category: 'clearance',
    };

    // AI model hallucinates a plausible sentence with high word-overlap
    const hallucinatedAnswer = 'Yes, I hold an active security clearance.';

    const result = validateGroundedAnswer(hallucinatedAnswer, facts, question);

    assert.equal(result.valid, false, 'Must reject answer lacking verified fact backing');
    assert.equal(result.source, 'unresolved');
    assert.equal(result.action, 'skip');
    assert.equal(result.requiresReview, true);
    assert.deepEqual(result.evidenceIds, []);
  });

  await t.test('2. rejects negation reversal on sponsorship (need_sponsorship_future is false)', () => {
    const facts = buildVerifiedFacts({
      full_name: 'Jane Citizen',
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false,
    });

    const question = {
      label: 'Will you now or in the future require sponsorship for employment visa status?',
      canonical_name: 'needs_sponsorship',
    };

    // Case A: AI answers "Yes"
    const yesResult = validateGroundedAnswer('Yes', facts, question);
    assert.equal(yesResult.valid, false, 'Must reject "Yes" when candidate does not need sponsorship');
    assert.equal(yesResult.source, 'unresolved');
    assert.equal(yesResult.action, 'skip');
    assert.equal(yesResult.requiresReview, true);

    // Case B: AI answers "I require sponsorship"
    const textResult = validateGroundedAnswer('I require visa sponsorship to maintain employment authorization.', facts, question);
    assert.equal(textResult.valid, false, 'Must reject prose claiming sponsorship');
    assert.equal(textResult.source, 'unresolved');
    assert.equal(textResult.action, 'skip');

    // Case C: AI answers "No" -> Should be accepted with evidence citing need_sponsorship_future
    const noResult = validateGroundedAnswer('No', facts, question);
    assert.equal(noResult.valid, true, 'Must accept "No" when candidate does not need sponsorship');
    assert.equal(noResult.action, 'fill');
    assert.ok(noResult.evidenceIds.includes('profile.work_auth.need_sponsorship_future'));
  });

  await t.test('2b. rejects negation reversal on sponsorship when candidate DOES need sponsorship', () => {
    const facts = buildVerifiedFacts({
      full_name: 'Alex Visa',
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: true,
    });

    const question = {
      label: 'Will you now or in the future require visa sponsorship?',
      canonical_name: 'needs_sponsorship',
    };

    // AI claims "No"
    const noResult = validateGroundedAnswer('No', facts, question);
    assert.equal(noResult.valid, false, 'Must reject "No" when candidate requires future sponsorship');
    assert.equal(noResult.action, 'skip');

    // AI claims "Yes"
    const yesResult = validateGroundedAnswer('Yes', facts, question);
    assert.equal(yesResult.valid, true, 'Must accept "Yes" when candidate requires sponsorship');
    assert.equal(yesResult.action, 'fill');
    assert.ok(yesResult.evidenceIds.includes('profile.work_auth.need_sponsorship_future'));
  });

  await t.test('3. rejects experience inflation beyond verified numeric ceiling', () => {
    const facts = buildVerifiedFacts({
      full_name: 'Mid-Level Engineer',
      total_experience_years: '3',
      primary_skills: 'Java (2 years), TypeScript (3 years)',
    });

    const generalExpQuestion = {
      label: 'How many years of relevant professional experience do you have?',
      canonical_name: 'total_experience_years',
    };

    // Rejects 5 years
    const r5 = validateGroundedAnswer('5 years', facts, generalExpQuestion);
    assert.equal(r5.valid, false, 'Must reject 5 years when candidate only has 3');
    assert.equal(r5.action, 'skip');

    // Rejects 7 years
    const r7 = validateGroundedAnswer('7 years', facts, generalExpQuestion);
    assert.equal(r7.valid, false, 'Must reject 7 years');

    // Rejects 10+ years
    const r10 = validateGroundedAnswer('10+ years', facts, generalExpQuestion);
    assert.equal(r10.valid, false, 'Must reject 10+ years');

    // Accepts 3 years
    const r3 = validateGroundedAnswer('3 years', facts, generalExpQuestion);
    assert.equal(r3.valid, true, 'Must accept 3 years');
    assert.equal(r3.action, 'fill');
    assert.ok(r3.evidenceIds.includes('profile.experience.total_years'));

    // Skill-specific experience question: Java (verified: 2 years)
    const javaQuestion = {
      label: 'How many years of experience do you have with Java?',
      category: 'experience',
      skill: 'Java',
    };

    const rJava4 = validateGroundedAnswer('4 years', facts, javaQuestion);
    assert.equal(rJava4.valid, false, 'Must reject 4 years Java when verified is 2 years');

    const rJava2 = validateGroundedAnswer('2 years', facts, javaQuestion);
    assert.equal(rJava2.valid, true, 'Must accept 2 years Java');
    assert.ok(rJava2.evidenceIds.includes('profile.skills.java'));
  });

  await t.test('4. rejects degree elevation (Bachelor’s vs Master’s/Doctorate)', () => {
    const facts = buildVerifiedFacts({
      full_name: 'College Graduate',
      highest_qualification: "Bachelor's Degree",
      university_name: 'State University',
    });

    const degreeQuestion = {
      label: 'What is your highest level of completed education?',
      canonical_name: 'highest_education',
    };

    // AI claims Master's degree
    const rMaster = validateGroundedAnswer("Master's degree", facts, degreeQuestion);
    assert.equal(rMaster.valid, false, 'Must reject Master\'s when candidate has Bachelor\'s');
    assert.equal(rMaster.action, 'skip');

    // AI claims Doctorate / PhD
    const rPhD = validateGroundedAnswer('Doctorate / Ph.D.', facts, degreeQuestion);
    assert.equal(rPhD.valid, false, 'Must reject Doctorate');

    // AI claims Bachelor's
    const rBach = validateGroundedAnswer("Bachelor's Degree", facts, degreeQuestion);
    assert.equal(rBach.valid, true, 'Must accept Bachelor\'s');
    assert.equal(rBach.action, 'fill');
    assert.ok(
      rBach.evidenceIds.includes('profile.education.degree') ||
      rBach.evidenceIds.includes('profile.education.highest_qualification')
    );

    // Specific degree question: "Do you have a Master's degree?"
    const hasMasterQuestion = {
      label: "Do you possess a Master's degree or higher?",
    };

    const rHasMasterYes = validateGroundedAnswer('Yes', facts, hasMasterQuestion);
    assert.equal(rHasMasterYes.valid, false, 'Must reject "Yes" to Master\'s question');

    const rHasMasterNo = validateGroundedAnswer('No', facts, hasMasterQuestion);
    assert.equal(rHasMasterNo.valid, true, 'Must accept "No" to Master\'s question');
    assert.ok(
      rHasMasterNo.evidenceIds.includes('profile.education.degree') ||
      rHasMasterNo.evidenceIds.includes('profile.education.highest_qualification')
    );
  });

  await t.test('5. rejects unconfirmed certifications', () => {
    const facts = buildVerifiedFacts({
      full_name: 'Dev With Certs',
      certifications: 'Scrum Master (CSM), PMP',
    });

    const certQuestion = {
      label: 'Are you an AWS Certified Solutions Architect?',
      category: 'certification',
    };

    // AI claims AWS Certified
    const rAws = validateGroundedAnswer('AWS Certified', facts, certQuestion);
    assert.equal(rAws.valid, false, 'Must reject AWS Certified when not in profile');
    assert.equal(rAws.action, 'skip');

    const rAwsYes = validateGroundedAnswer('Yes', facts, certQuestion);
    assert.equal(rAwsYes.valid, false, 'Must reject "Yes" for unconfirmed AWS cert');

    const rAwsNo = validateGroundedAnswer('No', facts, certQuestion);
    assert.equal(rAwsNo.valid, false, 'Missing AWS cert must return unresolved, NOT verified "No"');
    assert.equal(rAwsNo.action, 'skip');
    assert.equal(rAwsNo.reasonCode, 'UNCONFIRMED_CERTIFICATION');
    assert.equal(rAwsNo.stage, 'certification');

    // Verified cert: PMP
    const pmpQuestion = {
      label: 'Do you hold a PMP certification?',
      category: 'certification',
    };

    const rPmpYes = validateGroundedAnswer('Yes, I am PMP certified.', facts, pmpQuestion);
    assert.equal(rPmpYes.valid, true, 'Must accept confirmed PMP certification');
    assert.ok(
      rPmpYes.evidenceIds.includes('profile.certifications') ||
      rPmpYes.evidenceIds.includes('profile.certifications.pmp')
    );
  });

  await t.test('6. populates evidenceIds citing exact fact IDs supporting the answer', () => {
    const facts = buildVerifiedFacts({
      full_name: 'Sarah Connor',
      current_city: 'Los Angeles',
      current_state: 'CA',
      authorized_in_usa: true,
      need_sponsorship_future: false,
    });

    const cityQuestion = {
      label: 'Current City',
      canonical_name: 'current_city',
    };

    const cityResult = validateGroundedAnswer('Los Angeles', facts, cityQuestion);
    assert.equal(cityResult.valid, true);
    assert.deepEqual(cityResult.evidenceIds, ['profile.location.city']);
  });

  await t.test('7. returns { valid: false, source: "unresolved", action: "skip", requiresReview: true } when evidence is missing', () => {
    // Empty facts map
    const emptyFacts = new Map();

    const question = {
      label: 'What is your GPA?',
      canonical_name: 'gpa',
    };

    const result = validateGroundedAnswer('3.9', emptyFacts, question);

    assert.equal(result.valid, false);
    assert.equal(result.source, 'unresolved');
    assert.equal(result.action, 'skip');
    assert.equal(result.requiresReview, true);
    assert.deepEqual(result.evidenceIds, []);
  });

  await t.test('8. grounds answers backed by approved Answer Bank entries', () => {
    const answerBank = new Map([
      ['relocation_willingness', 'Yes, willing to relocate to any major tech hub in the US.'],
    ]);

    const facts = buildVerifiedFacts({ full_name: 'Relocatable Dev' }, answerBank);

    const question = {
      label: 'Are you willing to relocate for this position?',
      category: 'relocation',
    };

    const answer = 'Yes, willing to relocate to any major tech hub in the US.';
    const result = validateGroundedAnswer(answer, facts, question);

    assert.equal(result.valid, true);
    assert.equal(result.action, 'fill');
    assert.ok(result.evidenceIds.includes('answer_bank.relocation_willingness'));
  });

  await t.test('does not reuse United States work authorization for another country', () => {
    const facts = buildVerifiedFacts({ authorized_in_usa: true }, {
      'Are you authorized to work in Canada?': 'Yes',
    });
    assert.equal(validateGroundedAnswer('Yes', facts, 'Are you authorized to work in Canada?').valid, false);
    assert.equal(validateGroundedAnswer('Yes', facts, 'Are you authorized to work in the United States?').valid, true);
  });

  await t.test('9. grounds confirmed salary, names, and location while excluding demographics', () => {
    const facts = buildVerifiedFacts({
      full_name: 'Jane Doe',
      current_city: 'Austin',
      current_state: 'Texas',
      expected_salary: '120000',
      gender: 'Female',
      race: 'Asian',
      confirmed_facts: {
        first_name: 'Jane',
        last_name: 'Doe',
        preferred_name: 'Jane Doe',
        zip_code: '78701',
        country: 'United States',
        pronouns: 'She/Her',
      },
    });

    assert.equal(facts.get('profile.location.zip_code')?.value, '78701');
    assert.equal(facts.get('profile.compensation.expected_salary')?.value, '120000');
    assert.equal(facts.has('profile.demographics.pronouns'), false);

    assert.equal(validateGroundedAnswer('Jane', facts, inferQuestionDescriptor({ label: 'Legal First Name' })).valid, true);
    assert.equal(validateGroundedAnswer('Doe', facts, inferQuestionDescriptor({ label: 'Legal Last Name' })).valid, true);
    assert.equal(validateGroundedAnswer('Austin, Texas', facts, inferQuestionDescriptor({ label: 'Please provide the city and state/province you anticipate working in for the role in which you are applying' })).valid, true);
    assert.equal(validateGroundedAnswer('78701', facts, inferQuestionDescriptor({ label: 'Please provide your current ZIP or Postal Code to determine appropriate pay band' })).valid, true);
    assert.equal(validateGroundedAnswer('$120,000', facts, inferQuestionDescriptor({ label: 'What are your salary expectations?' })).valid, true);
    assert.equal(validateGroundedAnswer('Asian', facts, inferQuestionDescriptor({ label: 'Which ethnicity(ies) do you identify with?' })).valid, false);
    assert.equal(validateGroundedAnswer('She/Her', facts, inferQuestionDescriptor({ label: 'What are your pronouns? (Optional)' })).valid, false);

    const portalFacts = buildVerifiedFacts({
      full_name: 'Alex Portal',
      confirmed_facts: {
        location: { whereBased: 'Austin, United States', countries: ['US'] },
        intended_work_country: 'United States',
        current_employer: 'Acme Corp',
        current_job_title: 'Staff Engineer',
        university_name: 'MIT',
        graduation_year: '2019',
      },
    }, undefined, {
      age_18_or_older: true,
      notice_period_days: 0,
      willing_to_relocate: true,
      visa_sponsorship_needed: false,
      authorized_countries: ['us'],
    });
    assert.equal(validateGroundedAnswer('United States', portalFacts, inferQuestionDescriptor({ label: 'Which country do you intend to work from?' })).valid, true);
    assert.equal(validateGroundedAnswer('Acme Corp', portalFacts, inferQuestionDescriptor({ label: 'Current Company' })).valid, true);
    assert.equal(validateGroundedAnswer('Staff Engineer', portalFacts, inferQuestionDescriptor({ label: 'Current Job Title' })).valid, true);
    assert.equal(validateGroundedAnswer('MIT', portalFacts, inferQuestionDescriptor({ label: 'University' })).valid, true);
    assert.equal(validateGroundedAnswer('2019', portalFacts, inferQuestionDescriptor({ label: 'Graduation Year' })).valid, true);
    assert.equal(validateGroundedAnswer('Immediately', portalFacts, inferQuestionDescriptor({ label: 'Earliest start date' })).valid, true);
  });

  await t.test('10. strict DB-only demographics grounding (enabled vs disabled/unset, bundled communities, opt-out, None of the above)', () => {
    const communityOptions = [
      'Person with disability',
      'Neurodivergent',
      'Veteran',
      'Parent',
      'Refugee or immigrant',
      'None of the above',
      'I prefer not to answer',
    ];
    const communityQuestion = {
      label: 'Which of the following communities do you belong to?',
      options: communityOptions,
    };

    // 10a. Enabled with veteran = ['Yes'] -> 'Veteran' valid; 'Person with disability' & 'None of the above' rejected
    const veteranFacts = buildVerifiedFacts({ full_name: 'Jordan Lee' }, [], undefined, {
      enabled: true,
      answers: { veteran: ['Yes'] },
    });
    const vetRes = validateGroundedAnswer('Veteran', veteranFacts, communityQuestion);
    assert.equal(vetRes.valid, true);
    assert.equal(vetRes.action, 'fill');
    assert.ok(vetRes.evidenceIds.includes('demographics.veteran'));
    assert.equal(validateGroundedAnswer('Person with disability', veteranFacts, communityQuestion).action, 'skip');
    assert.equal(validateGroundedAnswer('None of the above', veteranFacts, communityQuestion).action, 'skip');
    assert.equal(validateGroundedAnswer('I prefer not to answer', veteranFacts, communityQuestion).action, 'skip');

    // 10b. Multi-select communities including commas inside option labels
    const multiFacts = buildVerifiedFacts({ full_name: 'Jordan Lee' }, [], undefined, {
      enabled: true,
      answers: { disability: ['Yes'], veteran: ['Yes'], parentalStatus: ['Yes'] },
    });
    assert.equal(validateGroundedAnswer('Veteran, Parent', multiFacts, communityQuestion).valid, true);
    assert.equal(validateGroundedAnswer('Veteran, Neurodivergent', multiFacts, communityQuestion).action, 'skip');

    const commaOptionsQuestion = {
      label: 'Which of the following communities do you belong to?',
      options: [
        'Yes, I have a disability, or have had one in the past',
        'Veteran',
        'None of the above',
      ],
    };
    const commaRes = validateGroundedAnswer(
      'Yes, I have a disability, or have had one in the past, Veteran',
      multiFacts,
      commaOptionsQuestion,
    );
    assert.equal(commaRes.valid, true);
    assert.ok(commaRes.evidenceIds.includes('demographics.disability'));
    assert.ok(commaRes.evidenceIds.includes('demographics.veteran'));

    // 10c. Disabled or unset demographics -> ALL options including 'None of the above' & 'I prefer not to answer' skipped
    const disabledFacts = buildVerifiedFacts({ full_name: 'Jordan Lee' }, [], undefined, {
      enabled: false,
      answers: { veteran: ['Yes'], raceEthnicity: ['Asian'] },
    });
    for (const opt of ['Veteran', 'None of the above', 'I prefer not to answer']) {
      const r = validateGroundedAnswer(opt, disabledFacts, communityQuestion);
      assert.equal(r.valid, false, `Disabled demographics must reject '${opt}'`);
      assert.equal(r.action, 'skip');
    }

    const unsetFacts = buildVerifiedFacts({ full_name: 'Jordan Lee' }, [], undefined, {
      enabled: true,
      answers: {},
    });
    for (const opt of ['Veteran', 'None of the above', 'I prefer not to answer']) {
      assert.equal(validateGroundedAnswer(opt, unsetFacts, communityQuestion).action, 'skip');
    }

    // 10d. DP-04: Global decline requires ['Prefer not to say'] on ALL recognized categories in the question
    const partialDeclineFacts = buildVerifiedFacts({ full_name: 'Jordan Lee' }, [], undefined, {
      enabled: true,
      answers: {
        disability: ['Prefer not to say'],
        veteran: ['Prefer not to say'],
        parentalStatus: ['Prefer not to say'],
      },
    });
    assert.equal(
      validateGroundedAnswer('I prefer not to answer', partialDeclineFacts, communityQuestion).action,
      'skip',
      'Partial decline (missing neurodivergent/refugeeOrImmigrant) must NOT approve global decline',
    );

    const fullDeclineFacts = buildVerifiedFacts({ full_name: 'Jordan Lee' }, [], undefined, {
      enabled: true,
      answers: {
        disability: ['Prefer not to say'],
        neurodivergent: ['Prefer not to say'],
        veteran: ['Prefer not to say'],
        parentalStatus: ['Prefer not to say'],
        refugeeOrImmigrant: ['Prefer not to say'],
      },
    });
    assert.equal(validateGroundedAnswer('I prefer not to answer', fullDeclineFacts, communityQuestion).valid, true);
    assert.equal(validateGroundedAnswer('None of the above', fullDeclineFacts, communityQuestion).action, 'skip');

    // 10e. 'None of the above' allowed ONLY when every non-decline/non-none option is explicitly contradicted
    const allNoFacts = buildVerifiedFacts({ full_name: 'Jordan Lee' }, [], undefined, {
      enabled: true,
      answers: {
        disability: ['No'],
        veteran: ['No'],
        parentalStatus: ['No'],
      },
    });
    // Still blocked when unmapped options ('Neurodivergent', 'Refugee or immigrant') are present
    assert.equal(validateGroundedAnswer('None of the above', allNoFacts, communityQuestion).action, 'skip');

    const fullyMappedQuestion = {
      label: 'Which of the following communities do you belong to?',
      options: ['Person with disability', 'Veteran', 'Parent', 'None of the above', 'I prefer not to answer'],
    };
    const noneValidRes = validateGroundedAnswer('None of the above', allNoFacts, fullyMappedQuestion);
    assert.equal(noneValidRes.valid, true);
    assert.equal(noneValidRes.action, 'fill');

    // 10f. Standalone Race question
    const raceQuestion = {
      label: 'Race',
      category: 'demographics',
      options: ['Asian', 'White', 'Prefer not to say'],
    };
    const raceFacts = buildVerifiedFacts({ full_name: 'Jordan Lee' }, [], undefined, {
      enabled: true,
      answers: { raceEthnicity: ['Asian'], gender: ['Prefer not to say'] },
    });
    assert.equal(validateGroundedAnswer('Asian', raceFacts, raceQuestion).valid, true);
    assert.equal(validateGroundedAnswer('White', raceFacts, raceQuestion).action, 'skip');
    assert.equal(validateGroundedAnswer('Prefer not to say', raceFacts, raceQuestion).action, 'skip');

    const noRaceFacts = buildVerifiedFacts({ full_name: 'Jordan Lee' }, [], undefined, {
      enabled: true,
      answers: { gender: ['Prefer not to say'] },
    });
    for (const opt of ['Asian', 'White', 'Prefer not to say']) {
      assert.equal(validateGroundedAnswer(opt, noRaceFacts, raceQuestion).action, 'skip');
    }
    // 10g. Direct helper checks
    assert.equal(isExplicitDemographicDecline('I prefer not to answer'), true);
    assert.equal(isExplicitDemographicDecline('Decline to self-identify'), true);
    assert.equal(isExplicitDemographicDecline('Prefer not to say'), true);
    assert.equal(isExplicitDemographicDecline('Veteran'), false);
    assert.equal(isNoneOfTheAboveOption('None of the above'), true);
    assert.equal(isNoneOfTheAboveOption('None of these'), true);
    assert.equal(isNoneOfTheAboveOption('Veteran'), false);
  });

  await t.test('11. country-resolved US and non-US work authorization with conflict detection', () => {
    const usQuestion = { label: 'Are you authorized to work in the United States?' };

    // 11a. screening.authorized_countries = ['us'] -> Yes valid, No rejected
    const usAllowedFacts = buildVerifiedFacts({ full_name: 'Alex' }, undefined, {
      age_18_or_older: true,
      notice_period_days: null,
      willing_to_relocate: null,
      visa_sponsorship_needed: null,
      authorized_countries: ['us'],
    });
    assert.equal(validateGroundedAnswer('Yes', usAllowedFacts, usQuestion).valid, true);
    assert.equal(validateGroundedAnswer('No', usAllowedFacts, usQuestion).action, 'skip');

    // 11b. screening.authorized_countries = ['in'] (non-empty, excludes 'us', no authorized_in_usa) -> No valid, Yes rejected
    const inOnlyFacts = buildVerifiedFacts({ full_name: 'Alex' }, undefined, {
      age_18_or_older: true,
      notice_period_days: null,
      willing_to_relocate: null,
      visa_sponsorship_needed: null,
      authorized_countries: ['in'],
    });
    assert.equal(validateGroundedAnswer('No', inOnlyFacts, usQuestion).valid, true);
    assert.equal(validateGroundedAnswer('Yes', inOnlyFacts, usQuestion).action, 'skip');

    // 11c. Contradiction: authorized_countries = ['in'] AND authorized_in_usa = true -> both Yes & No skipped
    const conflictFacts = buildVerifiedFacts({ full_name: 'Alex', authorized_in_usa: true }, undefined, {
      age_18_or_older: true,
      notice_period_days: null,
      willing_to_relocate: null,
      visa_sponsorship_needed: null,
      authorized_countries: ['in'],
    });
    assert.equal(validateGroundedAnswer('Yes', conflictFacts, usQuestion).action, 'skip');
    assert.equal(validateGroundedAnswer('No', conflictFacts, usQuestion).action, 'skip');

    // 11d. Empty authorized_countries and no authorized_in_usa -> both Yes & No skipped
    const emptyAuthFacts = buildVerifiedFacts({ full_name: 'Alex' }, undefined, {
      age_18_or_older: true,
      notice_period_days: null,
      willing_to_relocate: null,
      visa_sponsorship_needed: null,
      authorized_countries: [],
    });
    assert.equal(validateGroundedAnswer('Yes', emptyAuthFacts, usQuestion).action, 'skip');
    assert.equal(validateGroundedAnswer('No', emptyAuthFacts, usQuestion).action, 'skip');

    // 11e. Non-US country authorization
    const deQuestion = { label: 'Are you authorized to work in Germany?' };
    const deAllowedFacts = buildVerifiedFacts({ full_name: 'Alex' }, undefined, {
      age_18_or_older: true,
      notice_period_days: null,
      willing_to_relocate: null,
      visa_sponsorship_needed: null,
      authorized_countries: ['de'],
    });
    assert.equal(validateGroundedAnswer('Yes', deAllowedFacts, deQuestion).valid, true);
    assert.equal(validateGroundedAnswer('No', deAllowedFacts, deQuestion).action, 'skip');
    assert.equal(validateGroundedAnswer('No', inOnlyFacts, deQuestion).valid, true);
    assert.equal(validateGroundedAnswer('Yes', inOnlyFacts, deQuestion).action, 'skip');
    assert.equal(validateGroundedAnswer('Yes', emptyAuthFacts, deQuestion).action, 'skip');

    // 11f. Location-linked work authorization
    const authHereResolved = {
      label: 'Are you authorized to work in this location?',
      resolvedCountryCode: 'us',
      options: ['Yes', 'No'],
    };
    const authHereUnresolved = {
      label: 'Are you authorized to work in this location?',
      hasUnresolvedUpstreamLocation: true,
      options: ['Yes', 'No'],
    };
    assert.equal(validateGroundedAnswer('Yes', usAllowedFacts, authHereResolved).valid, true);
    assert.equal(validateGroundedAnswer('Yes', usAllowedFacts, authHereUnresolved).action, 'skip');
    assert.equal(uniqueConfirmedChoice(['Yes', 'No'], usAllowedFacts, authHereUnresolved), undefined);
  });

  await t.test('12. location-linked sponsorship with resolvedCountryCode and hasUnresolvedUpstreamLocation gate', () => {
    const sponsorshipFacts = buildVerifiedFacts({ full_name: 'Alex' }, undefined, {
      age_18_or_older: true,
      notice_period_days: null,
      willing_to_relocate: null,
      visa_sponsorship_needed: true,
      authorized_countries: ['us'],
    });

    const resolvedQuestion = {
      label: 'Will you now or in the future require sponsorship for employment visa status to work in this location?',
      resolvedCountryCode: 'us',
      options: ['Yes', 'No'],
    };
    assert.equal(validateGroundedAnswer('Yes', sponsorshipFacts, resolvedQuestion).valid, true);
    assert.equal(validateGroundedAnswer('No', sponsorshipFacts, resolvedQuestion).action, 'skip');

    // Country-specific sponsorship override when resolvedCountryCode is present
    const countrySpecificFacts = buildVerifiedFacts({
      full_name: 'Alex',
      confirmed_facts: {
        screeningAnswers: {
          country_specific_answers: {
            us_sponsorship: 'no',
          },
        },
      },
    }, undefined, {
      age_18_or_older: true,
      notice_period_days: null,
      willing_to_relocate: null,
      visa_sponsorship_needed: true,
    });
    const csNoRes = validateGroundedAnswer('No', countrySpecificFacts, resolvedQuestion);
    assert.equal(csNoRes.valid, true);
    assert.ok(csNoRes.evidenceIds.includes('country_specific_answers.us_sponsorship'));
    assert.equal(validateGroundedAnswer('Yes', countrySpecificFacts, resolvedQuestion).action, 'skip');

    const uniqueCs = uniqueConfirmedChoice(['Yes', 'No'], countrySpecificFacts, resolvedQuestion);
    assert.equal(uniqueCs?.choice, 'No');
    assert.ok(uniqueCs?.evidenceIds.includes('country_specific_answers.us_sponsorship'));

    // Unresolved upstream location -> uniqueConfirmedChoice returns undefined and validateGroundedAnswer skips
    const unresolvedQuestion = {
      label: 'Will you now or in the future require sponsorship for employment visa status to work in this location?',
      hasUnresolvedUpstreamLocation: true,
      options: ['Yes', 'No'],
    };
    assert.equal(uniqueConfirmedChoice(['Yes', 'No'], sponsorshipFacts, unresolvedQuestion), undefined);
    assert.equal(validateGroundedAnswer('Yes', sponsorshipFacts, unresolvedQuestion).action, 'skip');
    assert.equal(validateGroundedAnswer('No', sponsorshipFacts, unresolvedQuestion).action, 'skip');
  });

  await t.test('13. formatted location answers (City, Country / City, State, Country) with helperText', () => {
    const locFacts = buildVerifiedFacts({
      full_name: 'Taylor Austin',
      current_city: 'Austin',
      current_state: 'Texas',
      country: 'United States',
    });

    const workFromQuestion = {
      ...inferQuestionDescriptor({ label: 'Which country do you intend to work from?' }),
      helperText: 'Please list your city and country.',
    };

    const cityCountryRes = validateGroundedAnswer('Austin, United States', locFacts, workFromQuestion);
    assert.equal(cityCountryRes.valid, true);
    assert.equal(cityCountryRes.action, 'fill');

    const cityStateCountryRes = validateGroundedAnswer('Austin, Texas, United States', locFacts, workFromQuestion);
    assert.equal(cityStateCountryRes.valid, true);

    assert.equal(validateGroundedAnswer('Seattle, United States', locFacts, workFromQuestion).action, 'skip');
    assert.equal(validateGroundedAnswer('Austin, Canada', locFacts, workFromQuestion).action, 'skip');

    const baseOnlyFacts = buildVerifiedFacts({
      full_name: 'Taylor Base',
      confirmed_facts: {
        location: { whereBased: 'Austin, United States' },
      },
    });
    const baseRes = validateGroundedAnswer('Austin, United States', baseOnlyFacts, workFromQuestion);
    assert.equal(baseRes.valid, true);
    assert.ok(baseRes.evidenceIds.includes('profile.location.base'));
  });

  await t.test('14. GR-01 & GR-03: skill existence never implies duration or falls back to total_experience_years; symbol preservation', () => {
    const facts = buildVerifiedFacts({
      full_name: 'Polyglot Dev',
      total_experience_years: 8,
      primary_skills: 'TypeScript, Java (2 years), C (5 years), .NET (4 years)',
    });

    // Existence-only skill satisfies existence question, NEVER duration question
    const tsExist = validateGroundedAnswer('Yes', facts, { label: 'Do you have experience with TypeScript?' });
    assert.equal(tsExist.valid, true);
    assert.equal(tsExist.reasonCode, 'GROUNDED');

    const tsYears = validateGroundedAnswer('3 years', facts, {
      label: 'How many years of experience do you have with TypeScript?',
    });
    assert.equal(tsYears.valid, false);
    assert.equal(tsYears.action, 'skip');
    assert.equal(tsYears.reasonCode, 'SKILL_DURATION_UNKNOWN');
    assert.equal(tsYears.stage, 'experience');

    // Unknown skills (Kubernetes, Rust) remain unknown even when total_experience_years = 8
    const k8sYears = validateGroundedAnswer('4 years', facts, {
      label: 'How many years of experience do you have with Kubernetes?',
    });
    assert.equal(k8sYears.valid, false);
    assert.equal(k8sYears.reasonCode, 'MISSING_FACT');

    const rustNo = validateGroundedAnswer('No', facts, {
      label: 'Do you have experience with Rust?',
    });
    assert.equal(rustNo.valid, false, 'Missing skill must remain unknown rather than fabricating No');
    assert.equal(rustNo.reasonCode, 'MISSING_FACT');

    // Symbol preservation: C vs C++ vs C# and .NET vs NET
    assert.equal(validateGroundedAnswer('5 years', facts, { label: 'How many years of experience with C?' }).valid, true);
    assert.equal(validateGroundedAnswer('5 years', facts, { label: 'How many years of experience with C++?' }).valid, false);
    assert.equal(validateGroundedAnswer('5 years', facts, { label: 'How many years of experience with C#?' }).valid, false);
    assert.equal(validateGroundedAnswer('4 years', facts, { label: 'How many years of experience with .NET?' }).valid, true);
    assert.equal(validateGroundedAnswer('4 years', facts, { label: 'How many years of experience with NET?' }).valid, false);
  });

  await t.test('15. GR-02 & GR-04: minimum thresholds, exact years, ranges, and relevant vs total experience', () => {
    const facts = buildVerifiedFacts({
      full_name: 'Threshold Dev',
      total_experience_years: 8,
      relevant_experience_years: 3,
      primary_skills: 'Java (2 years), Python (4 years)',
    });

    // GR-02: 2y Java cannot satisfy "at least 5 years of Java"
    const minJavaYes = validateGroundedAnswer('Yes', facts, {
      label: 'Do you have at least 5 years of experience with Java?',
    });
    assert.equal(minJavaYes.valid, false);
    assert.equal(minJavaYes.reasonCode, 'EXPERIENCE_INFLATION');

    const minJavaNo = validateGroundedAnswer('No', facts, {
      label: 'Do you have at least 5 years of experience with Java?',
    });
    assert.equal(minJavaNo.valid, true);

    const minJavaNum = validateGroundedAnswer('2 years', facts, {
      label: 'Do you have at least 5 years of Java experience?',
    });
    assert.equal(minJavaNum.valid, false);
    assert.equal(minJavaNum.reasonCode, 'EXPERIENCE_INFLATION');

    // GR-04: exact years vs range vs relevant experience
    const exactMismatch = validateGroundedAnswer('3 years', facts, {
      label: 'How many years of total experience do you have?',
      canonical_name: 'total_experience_years',
    });
    assert.equal(exactMismatch.valid, false, '3 years cannot pass an exact 8-year total experience question');
    assert.equal(exactMismatch.reasonCode, 'EXPERIENCE_EXACT_MISMATCH');

    const exactEight = validateGroundedAnswer('8 years', facts, {
      label: 'How many years of total experience do you have?',
      canonical_name: 'total_experience_years',
    });
    assert.equal(exactEight.valid, true);

    // 3y relevant vs 8y total
    const relThree = validateGroundedAnswer('3 years', facts, {
      label: 'How many years of relevant experience do you have?',
      canonical_name: 'relevant_experience_years',
    });
    assert.equal(relThree.valid, true);
    assert.ok(relThree.evidenceIds.includes('profile.experience.relevant_years'));

    const relEight = validateGroundedAnswer('8 years', facts, {
      label: 'How many years of relevant experience do you have?',
      canonical_name: 'relevant_experience_years',
    });
    assert.equal(relEight.valid, false);
    assert.equal(relEight.reasonCode, 'EXPERIENCE_INFLATION');

    // Range validation (Python = 4 years)
    assert.equal(validateGroundedAnswer('3-5 years', facts, { label: 'Years of Python experience' }).valid, true);
    assert.equal(validateGroundedAnswer('5+ years', facts, { label: 'Years of Python experience' }).valid, false);
    assert.equal(validateGroundedAnswer('1-2 years', facts, { label: 'Years of Python experience' }).valid, false);
  });

  await t.test('16. GR-05: degree hierarchy (High School Graduate != Masters), major, completion status, and min requirement', () => {
    const hsFacts = buildVerifiedFacts({
      full_name: 'HS Grad',
      highest_qualification: 'High School Graduate',
    });
    const degQ = { label: 'What is your highest level of completed education?', canonical_name: 'highest_education' };
    assert.equal(validateGroundedAnswer('High School Graduate', hsFacts, degQ).valid, true);
    const hsMaster = validateGroundedAnswer("Master's degree", hsFacts, degQ);
    assert.equal(hsMaster.valid, false);
    assert.equal(hsMaster.reasonCode, 'DEGREE_ELEVATION');
    assert.equal(validateGroundedAnswer("Bachelor's degree", hsFacts, degQ).valid, false);

    // Major & completion status & minimum qualification
    const inProgressFacts = buildVerifiedFacts({
      full_name: 'CS Student',
      highest_qualification: "Master's Degree",
      confirmed_facts: {
        major: 'Computer Science',
        completion_status: 'in_progress',
      },
    });
    assert.equal(
      validateGroundedAnswer('Computer Science', inProgressFacts, { label: 'What is your major?' }).valid,
      true,
    );
    assert.equal(
      validateGroundedAnswer('Biology', inProgressFacts, { label: 'What is your major?' }).valid,
      false,
    );
    assert.equal(
      validateGroundedAnswer('Yes', inProgressFacts, {
        label: "Have you completed a Master's degree in Computer Science?",
      }).valid,
      false,
    );

    const completedMastersFacts = buildVerifiedFacts({
      full_name: 'MS Holder',
      highest_qualification: "Master's Degree",
      confirmed_facts: {
        major: 'Computer Science',
        completion_status: 'completed',
      },
    });
    assert.equal(
      validateGroundedAnswer('Yes', completedMastersFacts, {
        label: "Do you have a Bachelor's degree or higher?",
      }).valid,
      true,
    );
    assert.equal(
      validateGroundedAnswer('Yes', completedMastersFacts, {
        label: "Is your highest degree a Bachelor's degree?",
      }).valid,
      false,
    );
    assert.equal(
      validateGroundedAnswer('Yes', completedMastersFacts, {
        label: "Have you completed a Bachelor's degree in Biology?",
      }).valid,
      false,
    );
  });

  await t.test('17. GR-06: question-independent certification identification', () => {
    const facts = buildVerifiedFacts({
      full_name: 'PMP Holder',
      certifications: 'PMP',
    });
    // Proposed answer mentions held cert 'PMP' on an AWS question -> must STILL reject!
    const mismatch = validateGroundedAnswer('Yes, PMP', facts, {
      label: 'Are you AWS Certified Solutions Architect?',
      category: 'certification',
    });
    assert.equal(mismatch.valid, false);
    assert.equal(mismatch.reasonCode, 'UNCONFIRMED_CERTIFICATION');

    // Missing cert -> unresolved, not verified No
    const missingNo = validateGroundedAnswer('No', facts, {
      label: 'Are you AWS Certified Solutions Architect?',
      category: 'certification',
    });
    assert.equal(missingNo.valid, false);
    assert.equal(missingNo.reasonCode, 'UNCONFIRMED_CERTIFICATION');
  });

  await t.test('18. GR-07 & GR-08: typed comparators and empty normalized rejection', () => {
    const facts = buildVerifiedFacts({
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      zip_code: '94105',
      current_city: 'San Francisco',
      current_state: 'CA',
      country: 'United States',
    });

    // GR-08: Empty normalized values rejected pre-validator
    for (const emptyLike of ['', '   ', '---', '...', '___']) {
      const res = validateGroundedAnswer(emptyLike, facts, { label: 'First Name', canonical_name: 'first_name' });
      assert.equal(res.valid, false);
      assert.equal(res.reasonCode, 'EMPTY_ANSWER');
      assert.equal(res.stage, 'input_validation');
    }

    // GR-07: No unsafe substring matches
    assert.equal(validateGroundedAnswer('J', facts, { label: 'First Name', canonical_name: 'first_name' }).valid, false);
    assert.equal(validateGroundedAnswer('Jane', facts, { label: 'First Name', canonical_name: 'first_name' }).valid, true);
    assert.equal(validateGroundedAnswer('jane@evil.com', facts, { label: 'Email', canonical_name: 'email' }).valid, false);
    assert.equal(validateGroundedAnswer('example.com', facts, { label: 'Email', canonical_name: 'email' }).valid, false);
    assert.equal(validateGroundedAnswer('jane@example.com', facts, { label: 'Email', canonical_name: 'email' }).valid, true);
    assert.equal(validateGroundedAnswer('941', facts, { label: 'Postal Code', canonical_name: 'postal_code' }).valid, false);
    assert.equal(validateGroundedAnswer('94105', facts, { label: 'Postal Code', canonical_name: 'postal_code' }).valid, true);
  });

  await t.test('19. GR-09, GR-10, GR-11 & CountryResolver: 3-state sponsorship, jurisdiction scoping, US state disambiguation, trailing assertions', () => {
    // 3-state sponsorship: now = false, future = unknown
    const partialSponFacts = buildVerifiedFacts({
      full_name: 'OPT Worker',
      need_sponsorship_now: false,
    });
    assert.equal(
      validateGroundedAnswer('No', partialSponFacts, { label: 'Do you currently require visa sponsorship?' }).valid,
      true,
    );
    assert.equal(
      validateGroundedAnswer('No', partialSponFacts, { label: 'Will you require visa sponsorship in the future?' }).valid,
      false,
    );
    assert.equal(
      validateGroundedAnswer('No', partialSponFacts, { label: 'Will you now or in the future require sponsorship?' }).valid,
      false,
    );

    // now = false, future = true -> now_or_future is Yes (with requiresReview: true)
    const futureYesFacts = buildVerifiedFacts({
      full_name: 'STEM OPT',
      need_sponsorship_now: false,
      need_sponsorship_future: true,
    });
    const nowNo = validateGroundedAnswer('No', futureYesFacts, { label: 'Do you currently require visa sponsorship?' });
    assert.equal(nowNo.valid, true);
    assert.equal(nowNo.requiresReview, false);
    const futureYes = validateGroundedAnswer('Yes', futureYesFacts, {
      label: 'Will you now or in the future require sponsorship?',
    });
    assert.equal(futureYes.valid, true);
    assert.equal(futureYes.requiresReview, true);

    // GR-10: Country-specific sponsorship does NOT silently fall back to US/global facts
    const usOnlyFacts = buildVerifiedFacts({
      full_name: 'US Worker',
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false,
    });
    const caSpon = validateGroundedAnswer('No', usOnlyFacts, {
      label: 'Will you require visa sponsorship to work in Canada?',
    });
    assert.equal(caSpon.valid, false);
    assert.equal(caSpon.reasonCode, 'COUNTRY_MISMATCH');

    // FK-05: "Canada for any employer" extracts Canada cleanly
    const caAuthFacts = buildVerifiedFacts({ full_name: 'CA Worker' }, undefined, {
      age_18_or_older: true,
      notice_period_days: null,
      willing_to_relocate: null,
      visa_sponsorship_needed: null,
      authorized_countries: ['ca'],
    });
    assert.equal(
      validateGroundedAnswer('Yes', caAuthFacts, {
        label: 'Are you legally authorized to work in Canada for any employer?',
      }).valid,
      true,
    );

    // FK-04 / AUTH-R2: "Yes, I am a US citizen" rejected unless citizenship_country verified
    assert.equal(
      validateGroundedAnswer('Yes, I am a US citizen', usOnlyFacts, {
        label: 'Are you authorized to work in the United States?',
      }).valid,
      false,
    );
    const usCitizenFacts = buildVerifiedFacts({
      full_name: 'US Citizen',
      authorized_in_usa: true,
      citizenship_country: 'United States',
    });
    assert.equal(
      validateGroundedAnswer('Yes, I am a US citizen', usCitizenFacts, {
        label: 'Are you authorized to work in the United States?',
      }).valid,
      true,
    );

    // GR-11: Residence vs Intended Work Country vs Authorized Countries independence
    const multiGeoFacts = buildVerifiedFacts(
      {
        full_name: 'Global Dev',
        residence_country: 'Canada',
        intended_work_country: 'Germany',
        citizenship_country: 'India',
      },
      undefined,
      {
        age_18_or_older: true,
        notice_period_days: null,
        willing_to_relocate: null,
        visa_sponsorship_needed: null,
        authorized_countries: ['us'],
      },
    );
    assert.equal(
      validateGroundedAnswer('Canada', multiGeoFacts, {
        label: 'Country of Residence',
        canonical_name: 'residence_country',
      }).valid,
      true,
    );
    assert.equal(
      validateGroundedAnswer('Germany', multiGeoFacts, {
        label: 'Country of Residence',
        canonical_name: 'residence_country',
      }).valid,
      false,
    );
    assert.equal(
      validateGroundedAnswer('Germany', multiGeoFacts, {
        label: 'Which country do you intend to work from?',
        canonical_name: 'intended_work_country',
      }).valid,
      true,
    );
    assert.equal(
      validateGroundedAnswer('United States', multiGeoFacts, {
        label: 'Which country do you intend to work from?',
        canonical_name: 'intended_work_country',
      }).valid,
      false,
    );
    assert.equal(
      validateGroundedAnswer('Yes', multiGeoFacts, {
        label: 'Are you authorized to work in Canada?',
      }).valid,
      false,
    );
    assert.equal(
      validateGroundedAnswer('India', multiGeoFacts, {
        label: 'Country of citizenship',
        canonical_name: 'citizenship_country',
      }).valid,
      true,
    );

    // CountryResolver US state disambiguation: CA != Canada, IN != India
    const caStateFacts = buildVerifiedFacts(
      {
        full_name: 'SF Dev',
        current_city: 'San Francisco',
        current_state: 'CA',
        country: 'United States',
      },
      undefined,
      {
        age_18_or_older: true,
        notice_period_days: null,
        willing_to_relocate: null,
        visa_sponsorship_needed: null,
        authorized_countries: ['us'],
      },
    );
    assert.equal(
      validateGroundedAnswer('Yes', caStateFacts, {
        label: 'Are you authorized to work in this location?',
        resolvedCountryCode: 'San Francisco, CA',
      }).valid,
      true,
    );
    assert.equal(
      validateGroundedAnswer('Yes', caStateFacts, {
        label: 'Are you authorized to work in this location?',
        resolvedCountryCode: 'Indianapolis, IN',
      }).valid,
      true,
    );
  });

  await t.test('20. GR-12, GR-13, GR-14, AB-R1, DP-01/DP-03/DP-05: helperText, structured salary, dual-index AB, diagnostics, policies', () => {
    const facts = buildVerifiedFacts(
      {
        full_name: 'Structured Tester',
        current_city: 'Austin',
        current_state: 'TX',
        country: 'United States',
        zip_code: '78701',
      },
      [
        {
          topic: 'relocation',
          question: 'Do you require relocation assistance?',
          answer: 'No, I do not require relocation assistance.',
          provenance: 'candidate',
        },
        {
          topic: 'salary_expectation',
          question: 'What is your expected monthly salary in EUR?',
          answer: 'EUR 8000 per month',
          provenance: 'candidate',
          constraints: { currency: 'EUR', period: 'month' },
        },
      ],
      {
        age_18_or_older: true,
        notice_period_days: 14,
        willing_to_relocate: true,
        visa_sponsorship_needed: false,
        desired_salary_amount: 100000,
        desired_salary_currency: 'USD',
        desired_salary_period: 'year',
      },
      {
        enabled: true,
        answers: {
          veteran: ['No'],
          protectedVeteran: ['No'],
        },
      },
    );

    // GR-12: helperText disambiguates "Current location"
    assert.equal(
      validateGroundedAnswer('78701', facts, {
        label: 'Current location',
        helperText: 'Please enter your postal code',
      }).valid,
      true,
    );
    assert.equal(
      validateGroundedAnswer('Austin, United States', facts, {
        label: 'Current location',
        helperText: 'City and country',
      }).valid,
      true,
    );

    // GR-13: Structured salary { amount, currency, period }
    assert.equal(
      validateGroundedAnswer('USD 100,000 per year', facts, { label: 'What are your salary expectations?' }).valid,
      true,
    );
    const eurMismatch = validateGroundedAnswer('EUR 100,000 per year', facts, {
      label: 'What are your salary expectations?',
    });
    assert.equal(eurMismatch.valid, false);
    assert.equal(eurMismatch.reasonCode, 'SALARY_MISMATCH');

    const hourlyMismatch = validateGroundedAnswer('USD 100 per hour', facts, {
      label: 'What are your salary expectations?',
    });
    assert.equal(hourlyMismatch.valid, false);
    assert.equal(hourlyMismatch.reasonCode, 'SALARY_MISMATCH');

    // AB-R1: Relocation sub-intents & salary qualifiers do not cross-match
    assert.equal(
      validateGroundedAnswer('No, I do not require relocation assistance.', facts, {
        label: 'Do you require relocation assistance?',
      }).valid,
      true,
    );
    assert.equal(
      validateGroundedAnswer('No, I do not require relocation assistance.', facts, {
        label: 'Have you previously relocated?',
      }).valid,
      false,
    );

    const eurBankOnlyFacts = buildVerifiedFacts(
      { full_name: 'EU Candidate' },
      [
        {
          topic: 'salary_expectation',
          question: 'What is your monthly salary expectation in EUR?',
          answer: 'EUR 8000 per month',
          provenance: 'candidate',
          constraints: { currency: 'EUR', period: 'month' },
        },
      ],
    );
    assert.equal(
      validateGroundedAnswer('EUR 8000 per month', eurBankOnlyFacts, {
        label: 'What is your monthly salary expectation in EUR?',
      }).valid,
      true,
    );
    assert.equal(
      validateGroundedAnswer('EUR 8000 per month', eurBankOnlyFacts, {
        label: 'What is your annual salary expectation in USD?',
      }).valid,
      false,
      'Mismatched salary qualifiers (USD/year vs EUR/month) must not match Answer Bank entry',
    );

    // DEM-R3: Immigration status question with "Refugee or immigrant" option must NOT trigger demographic gate
    const immFacts = buildVerifiedFacts(
      {
        full_name: 'Imm Candidate',
        confirmed_facts: { visa_status: 'Refugee or immigrant' },
      },
      undefined,
      undefined,
      { enabled: false, answers: {} },
    );
    assert.equal(
      validateGroundedAnswer('Refugee or immigrant', immFacts, {
        label: 'What is your current immigration status?',
        intent: 'visa_status',
        options: ['Citizen', 'Permanent Resident', 'Work Visa', 'Refugee or immigrant'],
      }).valid,
      true,
    );

    // DP-01 & DP-03: Veteran independence & "No, I am not a protected veteran"
    const vetOnlyFacts = buildVerifiedFacts({ full_name: 'Vet Only' }, undefined, undefined, {
      enabled: true,
      answers: { veteran: ['No'] },
    });
    assert.equal(
      validateGroundedAnswer('No, I am not a protected veteran', vetOnlyFacts, {
        label: 'Are you a protected veteran?',
        options: ['Yes, I identify as a protected veteran', 'No, I am not a protected veteran'],
      }).valid,
      false,
      'veteran preference must NOT fall back to protectedVeteran',
    );
    assert.equal(
      validateGroundedAnswer('No, I am not a protected veteran', facts, {
        label: 'Are you a protected veteran?',
        options: ['Yes, I identify as a protected veteran', 'No, I am not a protected veteran'],
      }).valid,
      true,
    );

    // DP-05: Consent / accommodation / attestation require user action
    for (const policyLabel of [
      'Do you require disability accommodations during the interview?',
      'I agree to the privacy policy and terms of use',
      'I certify and attest that all answers are accurate',
    ]) {
      const policyRes = validateGroundedAnswer('Yes', facts, { label: policyLabel });
      assert.equal(policyRes.valid, false);
      assert.equal(policyRes.reasonCode, 'ATTESTATION_REQUIRES_USER');
      assert.equal(policyRes.stage, 'policy');
    }

    // GR-14: Conflicting equal-rank facts trigger CONFLICTING_FACTS
    const conflictingFacts = buildVerifiedFacts({
      full_name: 'Jane Doe',
      confirmed_facts: {
        first_name: 'Jane',
        name: 'Janet Doe',
      },
    });
    // Wait: explicit first_name vs name don't conflict; test same-field conflict via direct VerifiedFact entry
    conflictingFacts.set('profile.first_name', {
      id: 'profile.first_name',
      type: 'string',
      value: 'Jane',
      source: 'confirmed_facts',
      provenance: 'user_confirmed',
      category: 'personal',
      conflicts: [
        {
          existingValue: 'Jane',
          existingProvenance: 'user_confirmed',
          incomingValue: 'Janet',
          incomingProvenance: 'user_confirmed',
        },
      ],
    });
    const conflictRes = validateGroundedAnswer('Jane', conflictingFacts, {
      label: 'First Name',
      canonical_name: 'first_name',
    });
    assert.equal(conflictRes.valid, false);
    assert.equal(conflictRes.reasonCode, 'CONFLICTING_FACTS');
  });
});
