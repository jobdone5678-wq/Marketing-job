import test from 'node:test';
import assert from 'node:assert/strict';
import { computeJobDetailsMatch } from '../src/lib/resumes/job-match.ts';

test('calculates exact 50% match when 1 of 2 skills matched', () => {
  const jobSkills = ['Java', 'Analytics'];
  const candidateSkills = ['java', 'spring boot'];
  const result = computeJobDetailsMatch(jobSkills, candidateSkills);

  assert.equal(result.matchPercentage, 50);
  assert.equal(result.matchedSkills.length, 1);
  assert.equal(result.matchedSkills[0], 'Java');
  assert.equal(result.missingSkills.length, 1);
  assert.equal(result.missingSkills[0], 'Analytics');
  assert.equal(result.totalSkillsCount, 2);
});

test('matches skills mentioned in candidate resume text even if not in explicit skill array', () => {
  const jobSkills = ['Java', 'Docker', 'Kubernetes'];
  const candidateSkills = ['Java'];
  const resumeText = 'Extensive experience deploying microservices with Docker and AWS.';
  const result = computeJobDetailsMatch(jobSkills, candidateSkills, resumeText);

  assert.equal(result.matchedSkills.includes('Java'), true);
  assert.equal(result.matchedSkills.includes('Docker'), true);
  assert.equal(result.missingSkills.includes('Kubernetes'), true);
  assert.equal(result.matchPercentage, 67);
  assert.equal(result.totalSkillsCount, 3);
});

test('handles empty job skills without NaN or crashing', () => {
  const result = computeJobDetailsMatch([], ['Java']);
  assert.equal(result.matchPercentage, 100);
  assert.equal(result.totalSkillsCount, 0);
  assert.equal(result.matchedSkills.length, 0);
  assert.equal(result.missingSkills.length, 0);
});
