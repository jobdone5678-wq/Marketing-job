import test from 'node:test';
import assert from 'node:assert/strict';

// Helper mimicking resume/route.ts demographics and facts mapping
function mapCandidateFacts(body, existingCandidate = null) {
  const screening = (body.screeningAnswers || {});
  const countryAnswers = screening.country_specific_answers || {};
  const usAnswers = (countryAnswers.us || {});

  const locationObj = (body.location || {});
  const openToRelocation = locationObj.openToRelocation !== undefined
    ? Boolean(locationObj.openToRelocation)
    : screening.willing_to_relocate === 'yes'
    ? true
    : screening.willing_to_relocate === 'no'
    ? false
    : body.open_to_relocation ?? null;

  const demographics = (body.demographics || {});
  const gender = demographics.gender || usAnswers.gender || body.gender || null;
  const race = demographics.raceEthnicity || usAnswers.race_ethnicity || body.race || body.race_ethnicity || null;
  const veteran = countryAnswers.us_veteran === 'Not stated' ? null
    : demographics.veteranStatus || countryAnswers.us_veteran || usAnswers.veteran_status || body.veteran || body.veteran_status || null;
  const disability = countryAnswers.us_disability === 'Not stated' ? null
    : demographics.disabilityStatus || countryAnswers.us_disability || usAnswers.disability_status || body.disability || body.disability_status || null;

  const mergedFacts = {
    ...((existingCandidate?.confirmed_facts || {})),
    headline: body.headline || null,
    summary: body.summary || null,
    location: body.location || null,
    demographics: {
      gender,
      raceEthnicity: race,
      veteranStatus: veteran,
      disabilityStatus: disability,
    },
    gender,
    race,
    race_ethnicity: race,
    veteran,
    veteran_status: veteran,
    disability,
    disability_status: disability,
    open_to_relocation: openToRelocation,
  };

  return {
    mergedFacts,
    gender,
    race,
    veteran,
    disability,
    openToRelocation,
  };
}

test('mapCandidateFacts extracts demographics, summary, and location preferences', () => {
  const body = {
    headline: 'Senior Full Stack Engineer',
    summary: 'Experienced developer with 8+ years experience.',
    location: {
      workFormat: ['Remote', 'Hybrid'],
      whereBased: 'Austin, TX',
      regions: ['Worldwide', 'North America'],
      countries: ['us', 'in'],
      openToRelocation: true,
      timezone: 'America/Chicago',
    },
    demographics: {
      gender: 'Male',
      raceEthnicity: 'Asian (Not Hispanic or Latino)',
      veteranStatus: 'I am not a protected veteran',
      disabilityStatus: 'No, I do not have a disability',
    },
  };

  const result = mapCandidateFacts(body);

  assert.equal(result.gender, 'Male');
  assert.equal(result.race, 'Asian (Not Hispanic or Latino)');
  assert.equal(result.veteran, 'I am not a protected veteran');
  assert.equal(result.disability, 'No, I do not have a disability');
  assert.equal(result.openToRelocation, true);
  assert.equal(result.mergedFacts.headline, 'Senior Full Stack Engineer');
  assert.equal(result.mergedFacts.summary, 'Experienced developer with 8+ years experience.');
  assert.deepEqual(result.mergedFacts.location.countries, ['us', 'in']);
  assert.deepEqual(result.mergedFacts.location.regions, ['Worldwide', 'North America']);
});

test('mapCandidateFacts falls back to legacy usAnswers if demographics is empty', () => {
  const body = {
    screeningAnswers: {
      country_specific_answers: {
        us: {
          gender: 'Female',
          race_ethnicity: 'White',
        },
        us_veteran: 'I identify as one or more classifications of protected veteran',
      },
      willing_to_relocate: 'no',
    },
  };

  const result = mapCandidateFacts(body);

  assert.equal(result.gender, 'Female');
  assert.equal(result.race, 'White');
  assert.equal(result.veteran, 'I identify as one or more classifications of protected veteran');
  assert.equal(result.openToRelocation, false);
});
