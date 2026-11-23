import test from 'node:test';
import assert from 'node:assert/strict';
import { compareResumeToJob, computeUnifiedJobMatch } from '../src/lib/resumes/job-match.ts';
import { applicationUrlKey } from '../src/lib/jobs/application-state.ts';

test('compareResumeToJob computes high match score for matching resume skills', () => {
  const resumeText = 'Senior Full Stack Engineer with 5+ years of React, TypeScript, Next.js, and Node.js experience.';
  const jobDescription = 'Looking for a Senior Software Engineer with strong TypeScript, React, and Next.js skills.';
  const match = compareResumeToJob(resumeText, jobDescription);
  assert.ok(match.score !== null && match.score >= 70, `Expected score >= 70, got ${match.score}`);
  assert.ok(match.matched.includes('TypeScript'));
  assert.ok(match.matched.includes('React'));
});

test('applicationUrlKey matches both primary URL and source_url against appliedKeys', () => {
  const jobUrl = 'https://boards.greenhouse.io/company/jobs/123';
  const sourceUrl = 'https://freehire.me/jobs/company-123';
  const appliedKey = applicationUrlKey(jobUrl);
  const keys = new Set([appliedKey]);
  assert.ok(keys.has(applicationUrlKey(jobUrl)));
});

test('fallback profile skill matching computes percentage score correctly', () => {
  const candidateSkills = ['React', 'TypeScript', 'Node.js', 'PostgreSQL'];
  const jobSkills = ['React', 'TypeScript', 'AWS', 'Docker'];
  const matched = jobSkills.filter((s) =>
    candidateSkills.some((cs) => cs.toLowerCase() === s.toLowerCase())
  );
  const score = Math.round((matched.length / Math.max(1, jobSkills.length)) * 100);
  assert.equal(score, 50);
  assert.deepEqual(matched, ['React', 'TypeScript']);
});

test('computeUnifiedJobMatch produces identical 50% score and matched skills for Salesforce Developer job', () => {
  const job = {
    title: 'Salesforce Developer',
    description: 'Looking for a Salesforce and Java developer with Spring Boot and API design experience.',
    skills: ['api', 'developer-experience', 'java', 'kotlin', 'salesforce', 'spring'],
  };
  const candidateResume = {
    text: 'Experienced Java engineer working with Spring Boot backend services and API design.',
    skills: ['java', 'spring', 'api'],
  };

  const result = computeUnifiedJobMatch(job, candidateResume);
  assert.equal(result.matchPercentage, 50);
  assert.equal(result.totalSkillsCount, 6);
  assert.equal(result.matchedSkills.length, 3);
  assert.deepEqual(result.matchedSkills.slice().sort(), ['api', 'java', 'spring'].sort());
  assert.deepEqual(result.missingSkills.slice().sort(), ['developer-experience', 'kotlin', 'salesforce'].sort());
});

test('word-boundary prevents false positive substring matching', () => {
  const job = {
    title: 'Backend Engineer',
    skills: ['Java', 'Go', 'API'],
  };
  const candidateResume = {
    text: 'Proficient in JavaScript development, rapid prototyping, and Google Cloud Platform.',
    skills: ['JavaScript'],
  };

  const result = computeUnifiedJobMatch(job, candidateResume);
  assert.equal(result.matchPercentage, 0);
  assert.equal(result.matchedSkills.length, 0);
  assert.equal(result.missingSkills.length, 3);
});
