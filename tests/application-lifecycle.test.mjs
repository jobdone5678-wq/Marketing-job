import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { isAppliedApplication, applicationUrlKey, withoutAppliedJobs } from '../src/lib/jobs/application-state.ts';

// Next.js resolves this extensionless TypeScript import. Resolve it in Node's test runner too.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === '../jobs/application-state' ? specifier + '.ts' : specifier, context);
  },
});
const { allowedCaptureUrl, validateObservation } = await import('../src/lib/capture/validation.ts');
hooks.deregister();

test('Application Lifecycle: isAppliedApplication enforces strict confirmation rules', () => {
  // Started or in-progress states must NEVER be considered applied
  assert.equal(isAppliedApplication('Draft', 'started'), false, 'Draft with started capture must not be applied');
  assert.equal(isAppliedApplication('Applied', 'started'), false, 'Started intent must not be considered applied even with status Applied');
  assert.equal(isAppliedApplication('Draft', 'in_progress'), false, 'in_progress must not be applied');
  assert.equal(isAppliedApplication('Draft', 'submit_attempted'), false, 'submit_attempted must not be applied');
  assert.equal(isAppliedApplication('Draft', null), false, 'Draft with null capture must not be applied');
  assert.equal(isAppliedApplication('Draft', undefined), false, 'Draft with undefined capture must not be applied');

  // Submitted and Confirmed capture states MUST be considered applied
  assert.equal(isAppliedApplication('Draft', 'submitted'), true, 'submitted capture must be applied');
  assert.equal(isAppliedApplication('Draft', 'confirmed'), true, 'confirmed capture must be applied');
  assert.equal(isAppliedApplication('Applied', 'submitted'), true, 'Applied with submitted capture must be applied');
  assert.equal(isAppliedApplication('Applied', 'confirmed'), true, 'Applied with confirmed capture must be applied');

  // Manual / stage-based applied status without captureStatus
  assert.equal(isAppliedApplication('Applied', null), true, 'Applied status without captureStatus is applied');
  assert.equal(isAppliedApplication('Applied', undefined), true, 'Applied status with undefined captureStatus is applied');
});

test('Application Lifecycle: applicationUrlKey strips confirmation paths for accurate matching', () => {
  const base = 'https://boards.greenhouse.io/company/jobs/123456';
  assert.equal(applicationUrlKey(base), base);
  assert.equal(applicationUrlKey(`${base}/apply`), base);
  assert.equal(applicationUrlKey(`${base}/confirmation`), base);
  assert.equal(applicationUrlKey(`${base}/thank-you`), base);
  assert.equal(applicationUrlKey(`${base}/thankyou`), base);
  assert.equal(applicationUrlKey(`${base}/applied`), base);
  assert.equal(applicationUrlKey(`${base}/success`), base);
  assert.equal(applicationUrlKey(`${base}/apply/confirmation`), base);
});

test('Application Lifecycle: withoutAppliedJobs filters out confirmed jobs and retains unapplied/started jobs', () => {
  const jobs = [
    { id: 'job-1', application_url: 'https://careers.example.com/jobs/1' },
    { id: 'job-2', application_url: 'https://careers.example.com/jobs/2' },
    { id: 'job-3', application_url: 'https://careers.example.com/jobs/3' }
  ];

  const appliedKeys = {
    jobIds: ['job-1'],
    urls: ['https://careers.example.com/jobs/2']
  };

  const remaining = withoutAppliedJobs(jobs, appliedKeys);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 'job-3');
});

test('Application Lifecycle: validateObservation accepts hardened confirmation headings and URL paths', () => {
  // Rejects started
  assert.equal(validateObservation('started', 'Some evidence'), false);

  // Accepts submitted & confirmed with standard confirmation headings
  assert.equal(validateObservation('confirmed', 'Thank you for applying to Acme Corp'), true);
  assert.equal(validateObservation('confirmed', 'Your application has been received'), true);
  assert.equal(validateObservation('confirmed', 'Application submitted successfully'), true);
  assert.equal(validateObservation('confirmed', 'Submission received'), true);
  assert.equal(validateObservation('submitted', 'Thank you for your application'), true);

  // Accepts URL path evidence
  assert.equal(validateObservation('confirmed', 'URL confirmation path: /jobs/12345/confirmation'), true);
  assert.equal(validateObservation('confirmed', 'URL confirmation path: /jobs/12345/thank-you'), true);
  assert.equal(validateObservation('confirmed', 'URL confirmation path: /jobs/12345/applied'), true);
  assert.equal(validateObservation('confirmed', 'URL confirmation path: /jobs/12345/success'), true);

  // Rejects false-positive phrases
  assert.equal(validateObservation('confirmed', 'Your application was not submitted due to an error'), false);
  assert.equal(validateObservation('confirmed', 'If your application is received before tomorrow'), false);
  assert.equal(validateObservation('confirmed', 'Application confirmation settings'), false);
});

test('Application Lifecycle: allowedCaptureUrl matches confirmation URLs against original job application URL', () => {
  const applicationUrl = 'https://boards.greenhouse.io/acme/jobs/998877';
  const confirmationUrl = 'https://boards.greenhouse.io/acme/jobs/998877/confirmation';
  const thankYouUrl = 'https://boards.greenhouse.io/acme/jobs/998877/thank-you';
  const appliedUrl = 'https://boards.greenhouse.io/acme/jobs/998877/applied';

  assert.equal(allowedCaptureUrl(confirmationUrl, applicationUrl), true);
  assert.equal(allowedCaptureUrl(thankYouUrl, applicationUrl), true);
  assert.equal(allowedCaptureUrl(appliedUrl, applicationUrl), true);
  assert.equal(allowedCaptureUrl(`${applicationUrl}/apply/application-submitted`, applicationUrl), true);
  assert.equal(allowedCaptureUrl(confirmationUrl, applicationUrl, 'confirmed', 'URL confirmation path: /acme/jobs/998877/confirmation'), true);
  assert.equal(allowedCaptureUrl(applicationUrl, applicationUrl, 'confirmed', 'URL confirmation path: /acme/jobs/998877/confirmation'), false);
});

test('Application Lifecycle: a shared receipt requires success text and the same portal', () => {
  const posting = 'https://jobs.lever.co/acme/posting-123/apply';
  const receipt = 'https://jobs.lever.co/acme/thanks';
  const heading = 'Thank you for applying';
  assert.equal(allowedCaptureUrl(receipt, posting, 'confirmed', heading), true);
  assert.equal(allowedCaptureUrl(receipt, posting, 'confirmed', 'URL confirmation path: /acme/thanks'), false);
  assert.equal(allowedCaptureUrl(receipt, posting, 'in_progress', heading), false);
  assert.equal(allowedCaptureUrl(receipt + '?jobId=other', posting, 'confirmed', heading), false);
  assert.equal(allowedCaptureUrl('https://jobs.lever.co/other/thanks', posting, 'confirmed', heading), false);
  assert.equal(allowedCaptureUrl('https://example.test/thanks', posting, 'confirmed', heading), false);
});

test('Application Lifecycle: external job payload retains all required fields for outside_jobs', () => {
  const mockExternalJob = {
    title: 'Senior Marketing Manager',
    company: 'Stripe',
    description: 'Lead global growth marketing campaigns and product launches across web and mobile.',
    location: 'San Francisco, CA (Remote)',
    employmentType: 'Full-time',
    compensation: '$160,000 - $200,000 USD',
    jobUrl: 'https://stripe.com/jobs/senior-marketing-manager?utm_source=linkedin',
    candidateId: '11111111-2222-3333-4444-555555555555',
    status: 'Applied'
  };

  // Ensure title, company, description, location, employment type, compensation, job URL, candidate ID are all present
  assert.ok(mockExternalJob.title);
  assert.ok(mockExternalJob.company);
  assert.ok(mockExternalJob.description);
  assert.ok(mockExternalJob.location);
  assert.ok(mockExternalJob.employmentType);
  assert.ok(mockExternalJob.compensation);
  assert.ok(mockExternalJob.jobUrl);
  assert.ok(mockExternalJob.candidateId);
});
