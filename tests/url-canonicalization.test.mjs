import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationUrlKey, canonicalJobUrl } from '../src/lib/jobs/application-state.ts';

test('canonicalJobUrl preserves whitelisted job ID params and strips tracking params', () => {
  const input = 'https://boards.greenhouse.io/embed/job_app?gh_jid=12345&utm_source=linkedin&ref=board#section';
  const expected = 'https://boards.greenhouse.io/embed/job_app?gh_jid=12345';
  assert.equal(canonicalJobUrl(input), expected);
});

test('canonicalJobUrl preserves Workday, Taleo, and generic job id params', () => {
  const input = 'https://company.wd1.myworkdayjobs.com/Careers/job/1?jobId=R-9876&source=referral';
  const expected = 'https://company.wd1.myworkdayjobs.com/Careers/job/1?jobId=R-9876';
  assert.equal(canonicalJobUrl(input), expected);
});

test('applicationUrlKey returns identical key for matching URLs with different tracking params', () => {
  const url1 = 'https://jobs.lever.co/example/abc-123?utm_medium=feed';
  const url2 = 'https://jobs.lever.co/example/abc-123?utm_source=email&ref=campaign';
  assert.equal(applicationUrlKey(url1), applicationUrlKey(url2));
});
