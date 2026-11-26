import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiedFacts } from '../../src/lib/ai/verified-facts.ts';
import * as fieldSafety from '../../src/lib/ai/autofill-field-safety.ts';

test('VerifiedFact builder: candidate schema mapping & typed evidence generation', async (t) => {
  await t.test('maps candidate name, contact, and structured location into typed VerifiedFact objects with correct IDs', () => {
    const candidate = {
      full_name: 'Jane Doe',
      email: 'jane.doe@example.com',
      phone: '+1 (555) 234-5678',
      linkedin_url: 'https://linkedin.com/in/janedoe',
      github_url: 'https://github.com/janedoe',
      current_city: 'San Francisco',
      current_state: 'CA',
      country: 'United States',
      zip_code: '94105',
      full_address: '100 Market St, San Francisco, CA 94105',
    };

    const facts = buildVerifiedFacts(candidate);

    assert.ok(facts instanceof Map, 'facts must be a Map instance');
    
    // Name
    const nameFact = facts.get('profile.name');
    assert.ok(nameFact, 'profile.name fact must exist');
    assert.equal(nameFact.id, 'profile.name');
    assert.equal(nameFact.type, 'string');
    assert.equal(nameFact.value, 'Jane Doe');
    assert.equal(nameFact.source, 'profile');

    // Contact
    const emailFact = facts.get('profile.contact.email');
    assert.ok(emailFact, 'profile.contact.email must exist');
    assert.equal(emailFact.value, 'jane.doe@example.com');
    assert.equal(emailFact.type, 'string');

    const phoneFact = facts.get('profile.contact.phone');
    assert.ok(phoneFact, 'profile.contact.phone must exist');
    assert.equal(phoneFact.value, '+1 (555) 234-5678');

    const linkedinFact = facts.get('profile.contact.linkedin');
    assert.ok(linkedinFact, 'profile.contact.linkedin must exist');
    assert.equal(linkedinFact.value, 'https://linkedin.com/in/janedoe');

    // Structured Location
    const cityFact = facts.get('profile.location.city');
    assert.ok(cityFact, 'profile.location.city must exist');
    assert.equal(cityFact.id, 'profile.location.city');
    assert.equal(cityFact.value, 'San Francisco');
    assert.equal(cityFact.type, 'string');

    const stateFact = facts.get('profile.location.state');
    assert.ok(stateFact, 'profile.location.state must exist');
    assert.equal(stateFact.value, 'CA');

    const countryFact = facts.get('profile.location.country');
    assert.ok(countryFact, 'profile.location.country must exist');
    assert.equal(countryFact.value, 'United States');

    const zipFact = facts.get('profile.location.zip_code');
    assert.ok(zipFact, 'profile.location.zip_code must exist');
    assert.equal(zipFact.value, '94105');
  });

  await t.test('strictly maps visa_status, authorized_in_usa, need_sponsorship_now, and need_sponsorship_future as distinct typed facts', () => {
    const candidate = {
      full_name: 'John Smith',
      visa_status: 'H-1B',
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: true,
    };

    const facts = buildVerifiedFacts(candidate);

    // visa_status
    const visaFact = facts.get('profile.work_auth.visa_status');
    assert.ok(visaFact, 'profile.work_auth.visa_status must exist');
    assert.equal(visaFact.type, 'string');
    assert.equal(visaFact.value, 'H-1B');

    // authorized_in_usa
    const authFact = facts.get('profile.work_auth.authorized_in_usa');
    assert.ok(authFact, 'profile.work_auth.authorized_in_usa must exist');
    assert.equal(authFact.type, 'boolean');
    assert.equal(authFact.value, true);

    // need_sponsorship_now
    const sponNowFact = facts.get('profile.work_auth.need_sponsorship_now');
    assert.ok(sponNowFact, 'profile.work_auth.need_sponsorship_now must exist');
    assert.equal(sponNowFact.type, 'boolean');
    assert.equal(sponNowFact.value, false);

    // need_sponsorship_future
    const sponFutureFact = facts.get('profile.work_auth.need_sponsorship_future');
    assert.ok(sponFutureFact, 'profile.work_auth.need_sponsorship_future must exist');
    assert.equal(sponFutureFact.type, 'boolean');
    assert.equal(sponFutureFact.value, true);
  });

  await t.test('maps total_experience_years and skill-specific experience into numeric facts', () => {
    const candidate = {
      full_name: 'Alice Dev',
      total_experience_years: '5.5',
      relevant_experience_years: '4',
      primary_skills: 'Java (4 years), Python (3 years), TypeScript',
      confirmed_facts: {
        skills: {
          'Go': 2,
          'Docker': 3
        }
      }
    };

    const facts = buildVerifiedFacts(candidate);

    // Total experience
    const totalExpFact = facts.get('profile.experience.total_years');
    assert.ok(totalExpFact, 'profile.experience.total_years must exist');
    assert.equal(totalExpFact.type, 'number');
    assert.equal(totalExpFact.value, 5.5);

    // Relevant experience
    const relExpFact = facts.get('profile.experience.relevant_years');
    assert.ok(relExpFact, 'profile.experience.relevant_years must exist');
    assert.equal(relExpFact.type, 'number');
    assert.equal(relExpFact.value, 4);

    // Skill-specific experience from parsed string
    const javaFact = facts.get('profile.skills.java');
    assert.ok(javaFact, 'profile.skills.java must exist');
    assert.equal(javaFact.type, 'number');
    assert.equal(javaFact.value, 4);

    const pythonFact = facts.get('profile.skills.python');
    assert.ok(pythonFact, 'profile.skills.python must exist');
    assert.equal(pythonFact.type, 'number');
    assert.equal(pythonFact.value, 3);

    // Skill without explicit years
    const tsFact = facts.get('profile.skills.typescript');
    assert.ok(tsFact, 'profile.skills.typescript must exist');
    assert.ok(tsFact.value !== undefined);

    // Skills from confirmed_facts
    const goFact = facts.get('profile.skills.go');
    assert.ok(goFact, 'profile.skills.go must exist');
    assert.equal(goFact.type, 'number');
    assert.equal(goFact.value, 2);
    assert.equal(goFact.source, 'confirmed_facts');
  });

  await t.test('maps highest_qualification and university_name into education facts', () => {
    const candidate = {
      full_name: 'Bob Scholar',
      highest_qualification: "Bachelor's Degree",
      university_name: 'University of California, Berkeley',
      graduation_year: '2020',
    };

    const facts = buildVerifiedFacts(candidate);

    const degreeFact = facts.get('profile.education.degree') || facts.get('profile.education.highest_qualification');
    assert.ok(degreeFact, 'education degree fact must exist');
    assert.equal(degreeFact.type, 'string');
    assert.equal(degreeFact.value, "Bachelor's Degree");

    const uniFact = facts.get('profile.education.university') || facts.get('profile.education.university_name');
    assert.ok(uniFact, 'education university fact must exist');
    assert.equal(uniFact.type, 'string');
    assert.equal(uniFact.value, 'University of California, Berkeley');

    const gradFact = facts.get('profile.education.graduation_year');
    assert.ok(gradFact, 'graduation_year fact must exist');
    assert.equal(gradFact.type, 'number');
    assert.equal(gradFact.value, 2020);
  });

  await t.test('maps certifications into a normalized list of certification facts', () => {
    const candidate = {
      full_name: 'Carol Sec',
      certifications: 'AWS Certified Solutions Architect, Certified Information Systems Security Professional (CISSP), PMP',
    };

    const facts = buildVerifiedFacts(candidate);

    const certsFact = facts.get('profile.certifications');
    assert.ok(certsFact, 'profile.certifications fact must exist');
    assert.equal(certsFact.type, 'string[]');
    assert.ok(Array.isArray(certsFact.value), 'value must be an array');
    assert.equal(certsFact.value.length, 3);
    assert.ok(certsFact.value.includes('AWS Certified Solutions Architect'));
    assert.ok(certsFact.value.includes('PMP'));

    // Also supports individual certification index lookup
    const awsCert = facts.get('profile.certifications.aws_certified_solutions_architect') ||
                    facts.get('profile.certifications.aws');
    assert.ok(awsCert, 'individual cert fact should exist');
  });

  await t.test('maps approved Answer Bank entries into answer_bank.{topic} facts', () => {
    const candidate = { full_name: 'Dan Walker' };

    // Test with Map
    const answerBankMap = new Map([
      ['relocation', 'Yes, open to relocation across North America'],
      ['why_work_here', 'Excited about the cutting-edge agentic workflow mission.'],
    ]);

    const facts = buildVerifiedFacts(candidate, answerBankMap);

    const relocFact = facts.get('answer_bank.relocation');
    assert.ok(relocFact, 'answer_bank.relocation fact must exist');
    assert.equal(relocFact.type, 'string');
    assert.equal(relocFact.value, 'Yes, open to relocation across North America');
    assert.equal(relocFact.source, 'answer_bank');

    const whyFact = facts.get('answer_bank.why_work_here');
    assert.ok(whyFact, 'answer_bank.why_work_here fact must exist');
    assert.equal(whyFact.value, 'Excited about the cutting-edge agentic workflow mission.');

    // Test with Array of entries
    const answerBankArray = [
      { topic: 'salary_expectations', answer: '$150,000 - $170,000 USD' }
    ];
    const facts2 = buildVerifiedFacts(candidate, answerBankArray);
    const salaryFact = facts2.get('answer_bank.salary_expectations');
    assert.ok(salaryFact, 'answer_bank.salary_expectations must exist from array');
    assert.equal(salaryFact.value, '$150,000 - $170,000 USD');
  });

  await t.test('omits unconfirmed fields so that missing facts are never treated as blank or truthy defaults', () => {
    const sparseCandidate = {
      full_name: 'Eve Minimal',
      visa_status: null,
      authorized_in_usa: null,
      need_sponsorship_now: undefined,
      need_sponsorship_future: null,
      current_city: '',
      current_state: null,
      country: undefined,
      total_experience_years: null,
      highest_qualification: '',
      certifications: null,
    };

    const facts = buildVerifiedFacts(sparseCandidate);

    // Name exists
    assert.ok(facts.has('profile.name'));

    // All unconfirmed/null/undefined/blank fields MUST NOT be in facts
    assert.equal(facts.has('profile.work_auth.visa_status'), false, 'null visa_status must be omitted');
    assert.equal(facts.has('profile.work_auth.authorized_in_usa'), false, 'null authorized_in_usa must be omitted');
    assert.equal(facts.has('profile.work_auth.need_sponsorship_now'), false, 'undefined need_sponsorship_now must be omitted');
    assert.equal(facts.has('profile.work_auth.need_sponsorship_future'), false, 'null need_sponsorship_future must be omitted');
    assert.equal(facts.has('profile.location.city'), false, 'empty city must be omitted');
    assert.equal(facts.has('profile.location.state'), false, 'null state must be omitted');
    assert.equal(facts.has('profile.location.country'), false, 'undefined country must be omitted');
    assert.equal(facts.has('profile.experience.total_years'), false, 'null total_experience_years must be omitted');
    assert.equal(facts.has('profile.education.degree'), false, 'empty degree must be omitted');
    assert.equal(facts.has('profile.education.highest_qualification'), false, 'empty highest_qualification must be omitted');
    assert.equal(facts.has('profile.certifications'), false, 'null certifications must be omitted');
  });

  await t.test('attaches rawSnippet and evidence references when candidate evidence exists', () => {
    const candidate = {
      full_name: 'Grace Hopper',
      highest_qualification: 'PhD in Mathematics',
      evidence: [
        { field: 'highest_qualification', snippet: 'Earned PhD in Mathematics from Yale University in 1934', page: 1 }
      ]
    };

    const facts = buildVerifiedFacts(candidate);
    const degreeFact = facts.get('profile.education.degree') || facts.get('profile.education.highest_qualification');
    assert.ok(degreeFact);
    assert.equal(degreeFact.rawSnippet, 'Earned PhD in Mathematics from Yale University in 1934');
  });

  await t.test('isBlockedAutofillField allows demographic self-ID fields while blocking PII, consent, and marketing opt-ins', () => {
    assert.equal(typeof fieldSafety.isBlockedAutofillField, 'function', 'isBlockedAutofillField must be exported');

    // Allowed demographic / self-ID fields
    assert.equal(fieldSafety.isBlockedAutofillField({ label: 'Race', options: ['Asian', 'White'] }), false);
    assert.equal(
      fieldSafety.isBlockedAutofillField({
        label: 'Which of the following communities do you belong to?',
        options: ['Person with disability', 'Veteran', 'I prefer not to answer'],
      }),
      false,
    );
    assert.equal(fieldSafety.isBlockedAutofillField({ label: 'Gender', options: ['Male', 'Female'] }), false);

    // Phase A isPrivateAutofillField still blocks EEO fields
    assert.equal(fieldSafety.isPrivateAutofillField({ label: 'Race', options: ['Asian', 'White'] }), true);

    // Blocked PII, consent, marketing, future opportunities
    assert.equal(fieldSafety.isBlockedAutofillField({ label: 'Date of birth' }), true);
    assert.equal(fieldSafety.isBlockedAutofillField({ label: 'Contact me about future job opportunities' }), true);
    assert.equal(fieldSafety.isBlockedAutofillField({ label: 'I agree to the privacy policy' }), true);
    assert.equal(fieldSafety.isBlockedAutofillField({ type: 'password', label: 'Account password' }), true);
    assert.equal(fieldSafety.isBlockedAutofillField({ label: 'Social Security Number' }), true);
  });

  await t.test('builds demographics.* facts ONLY when enabled === true and normalizes veteran/protectedVeteran cleanly', () => {
    const candidate = { full_name: 'Alex Rivera' };
    const screening = {
      age_18_or_older: true,
      notice_period_days: 14,
      willing_to_relocate: false,
      visa_sponsorship_needed: false,
    };

    // Disabled -> zero demographics.* facts
    const disabledFacts = buildVerifiedFacts(candidate, [], screening, {
      enabled: false,
      answers: { gender: ['Male'], raceEthnicity: ['Asian'] },
    });
    for (const key of disabledFacts.keys()) {
      assert.equal(key.startsWith('demographics.'), false, `Disabled demographics must not emit ${key}`);
    }

    // Enabled -> emits demographics.<key>
    const enabledFacts = buildVerifiedFacts(candidate, [], screening, {
      enabled: true,
      answers: { gender: ['Male'], veteran: ['No'], raceEthnicity: ['  '] },
    });
    assert.deepEqual(enabledFacts.get('demographics.gender'), {
      id: 'demographics.gender',
      type: 'string[]',
      value: ['Male'],
      source: 'profile',
      category: 'demographics',
    });
    assert.deepEqual(enabledFacts.get('demographics.veteran'), {
      id: 'demographics.veteran',
      type: 'string[]',
      value: ['No'],
      source: 'profile',
      category: 'demographics',
    });
    assert.equal(enabledFacts.get('demographics.protectedVeteran')?.value?.[0], 'No');
    assert.equal(enabledFacts.has('demographics.raceEthnicity'), false);

    // Only protectedVeteran saved -> normalizes veteran alias cleanly
    const protectedOnlyFacts = buildVerifiedFacts(candidate, [], screening, {
      enabled: true,
      answers: { protectedVeteran: ['I am not a protected veteran'] },
    });
    assert.deepEqual(protectedOnlyFacts.get('demographics.protectedVeteran')?.value, ['I am not a protected veteran']);
    assert.deepEqual(protectedOnlyFacts.get('demographics.veteran')?.value, ['I am not a protected veteran']);

    // Both saved -> preserves both without overwriting
    const bothVeteranFacts = buildVerifiedFacts(candidate, [], screening, {
      enabled: true,
      answers: { veteran: ['Yes'], protectedVeteran: ['No'] },
    });
    assert.deepEqual(bothVeteranFacts.get('demographics.veteran')?.value, ['Yes']);
    assert.deepEqual(bothVeteranFacts.get('demographics.protectedVeteran')?.value, ['No']);
  });

  await t.test('surfaces structured location (base, remote_regions, work_format) and country_specific_answers.*', () => {
    const candidate = {
      full_name: 'Sam Patel',
      confirmed_facts: {
        location: {
          whereBased: 'Austin, United States',
          regions: ['North America', 'United States'],
          workFormat: ['Remote', 'Hybrid'],
        },
        screeningAnswers: {
          country_specific_answers: {
            us_sponsorship: 'no',
            us_auth: 'yes',
            empty_field: '   ',
          },
        },
      },
    };

    const facts = buildVerifiedFacts(candidate);
    assert.equal(facts.get('profile.location.base')?.value, 'Austin, United States');
    assert.equal(facts.get('profile.location.city')?.value, 'Austin');
    assert.equal(facts.get('profile.location.country')?.value, 'United States');
    assert.equal(facts.has('profile.location.state'), false);
    assert.deepEqual(facts.get('profile.location.remote_regions')?.value, ['North America', 'United States']);
    assert.deepEqual(facts.get('profile.location.work_format')?.value, ['Remote', 'Hybrid']);
    assert.equal(facts.get('country_specific_answers.us_sponsorship')?.value, 'no');
    assert.equal(facts.get('country_specific_answers.us_auth')?.value, 'yes');
    assert.equal(facts.has('country_specific_answers.empty_field'), false);
  });

  await t.test('recovers real name from contacts.fullName over Applicant placeholder and derives first/last name', () => {
    const facts = buildVerifiedFacts({
      full_name: 'Applicant',
      confirmed_facts: {
        contacts: {
          fullName: 'Bhargav Reddy',
          email: 'bhargav@example.com',
        },
      },
    });
    assert.equal(facts.get('profile.name')?.value, 'Bhargav Reddy');
    assert.equal(facts.get('profile.first_name')?.value, 'Bhargav');
    assert.equal(facts.get('profile.last_name')?.value, 'Reddy');
    assert.equal(facts.get('profile.contact.email')?.value, 'bhargav@example.com');
  });
});
