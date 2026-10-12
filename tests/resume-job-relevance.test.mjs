import test from 'node:test';
import assert from 'node:assert/strict';

const candidate = { provenance_status: 'confirmed', primary_skills: 'Python, SQL, Apache Airflow', target_job_titles: 'Data Engineer' };
const jobs = [
  { id: 'unrelated', title: 'Accountant', description: 'Use SQL for financial reports', state: 'active' },
  { id: 'related', title: 'Senior Data Engineer', description: 'Build pipelines using Python, SQL and Apache Airflow', state: 'active' },
  { id: 'closed', title: 'Data Engineer', description: 'Python and SQL', state: 'closed' },
  { id: 'partial', title: 'Python Developer', description: 'Build APIs in Python', state: 'active' },
];

test('resume recommendations exclude unrelated and closed jobs and explain the ranked results', async () => {
  const { rankResumeJobs } = await import('../src/lib/jobs/relevance.ts');
  const result = rankResumeJobs(jobs, candidate);
  assert.deepEqual(result.map(j => j.id), ['related', 'partial']);
  assert.ok(result[0].match_reasons.some(reason => reason.includes('Python')));
  assert.ok(result[0].match_reasons.some(reason => reason.includes('Data Engineer')));
  assert.ok(result[0].relevance_score > result[1].relevance_score);
});

test('recommendations do not use unreviewed or missing profile facts', async () => {
  const { rankResumeJobs } = await import('../src/lib/jobs/relevance.ts');
  assert.deepEqual(rankResumeJobs(jobs, { ...candidate, provenance_status: 'legacy_unconfirmed' }), []);
  assert.deepEqual(rankResumeJobs(jobs, { provenance_status: 'confirmed' }), []);
});

test('skill matching respects Java, C++, C#, .NET and short-word boundaries', async () => {
  const { rankResumeJobs } = await import('../src/lib/jobs/relevance.ts');
  const list = [
    { id: 'js', title: 'JavaScript Developer', description: '' },
    { id: 'java', title: 'Java Developer', description: '' },
    { id: 'cpp', title: 'C++ Developer', description: '' },
    { id: 'cs', title: 'C# Developer', description: '' },
    { id: 'net', title: '.NET Developer', description: '' },
    { id: 'go', title: 'Golang Developer', description: '' },
    { id: 'verb', title: 'Product Manager', description: 'Go above and beyond with our team' },
  ];
  for (const [skill, id] of [['Java', 'java'], ['C++', 'cpp'], ['C#', 'cs'], ['.NET', 'net'], ['Go', 'go']]) {
    assert.deepEqual(rankResumeJobs(list, { provenance_status: 'confirmed', primary_skills: skill }).map(j => j.id), [id]);
  }
});

test('role-only profiles still find relevant titles without matching generic engineer words', async () => {
  const { rankResumeJobs } = await import('../src/lib/jobs/relevance.ts');
  assert.deepEqual(rankResumeJobs(jobs, { provenance_status: 'confirmed', current_job_title: 'Data Engineer' }).map(j => j.id), ['related']);
});
