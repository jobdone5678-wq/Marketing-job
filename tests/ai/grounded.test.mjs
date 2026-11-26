import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGroundedAnswer } from '../../src/lib/ai/grounded.ts';
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
    assert.equal(rAwsNo.valid, true, 'Must accept "No" for unconfirmed cert');

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
  });
});
