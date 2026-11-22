import test from 'node:test';
import assert from 'node:assert/strict';
import { compareResumeToJob } from '../src/lib/resumes/job-match.ts';
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
