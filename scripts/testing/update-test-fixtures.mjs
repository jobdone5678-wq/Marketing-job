import {readFile, writeFile} from 'node:fs/promises';

// Candidate-only test fixtures. Each rule rewrites a staff-scoped fixture to
// the single candidate role that now exists.
const files = [
  'tests/api-performance.test.mjs',
  'tests/applied-resume-persistence.test.mjs',
  'tests/auth-profile-ui.test.mjs',
  'tests/candidate-email-access.test.mjs',
  'tests/candidate-email-database.test.mjs',
  'tests/candidate-job-applications.test.mjs',
  'tests/dashboard-access.test.mjs',
  'tests/dashboard-real-data.test.mjs',
  'tests/e2e-autofill-dom-capture.test.mjs',
  'tests/extension-domain-exclusions.test.mjs',
  'tests/extension-installed-smoke.test.mjs',
  'tests/extension-manual-recovery.test.mjs',
  'tests/extension-screening-access.test.mjs',
  'tests/extension-tailor-resume.test.mjs',
  'tests/gmail-production.test.mjs',
  'tests/jd-tailoring-database.test.mjs',
  'tests/match-result-selection.test.mjs',
  'tests/recruiting-integration.test.mjs',
  'tests/recruiting-queue.test.mjs',
  'tests/resume-discovery-api.test.mjs',
  'tests/resume-jobs-ui.test.mjs',
  'tests/rtr-submission-api.test.mjs',
  'tests/rtr-upload-flow.test.mjs',
  'tests/service-collections.test.mjs',
  'tests/service-collections-routes.test.mjs',
  'tests/submission-filters-ui.test.mjs',
  'tests/submission-persistence.test.mjs',
  'tests/tailoring-access.test.mjs',
  'tests/test-outside-jobs-persistence.test.mjs',
  'tests/task-claims.test.mjs',
  'tests/job-dates-persistence.test.mjs',
  'tests/job-freshness.test.mjs',
  'tests/email-schema-integration.test.mjs',
  'tests/application-answer-capture.test.mjs',
  'tests/recruitment-design.test.mjs',
  'tests/resume-autofill.test.mjs',
  'tests/resume-jobs-api.test.mjs',
];

// Ordered replacements. The longest / most specific first.
const replacements = [
  // protectedRoute and requireProfile lost their access-tier argument.
  [/protectedRoute\(\s*_?r(?:equest)?\s*,\s*_?(?:access|role)\s*,\s*/g, 'protectedRoute('],
  [/protectedRoute\(\s*request\s*,\s*'(?:candidate_or_staff|recruiting_staff|staff|admin)'\s*,\s*/g, 'protectedRoute(request, '],
  [/protectedRoute\(\s*request\s*,\s*"(?:candidate_or_staff|recruiting_staff|staff|admin)"\s*,\s*/g, 'protectedRoute(request, '],
  [/requireProfile\(\s*'(?:candidate_or_staff|recruiting_staff|staff|admin)'\s*\)/g, 'requireProfile()'],
  [/requireProfile\(\s*"(?:candidate_or_staff|recruiting_staff|staff|admin)"\s*\)/g, 'requireProfile()'],
  [/profileAccess\(([^)]*?),\s*'(?:candidate_or_staff|recruiting_staff|staff|admin)'\)/g, 'profileAccess($1)'],
  [/profileAccess\(([^)]*?),\s*"(?:candidate_or_staff|recruiting_staff|staff|admin)"\)/g, 'profileAccess($1)'],

  // A candidate is the only role.
  [/role:\s*'super_admin'/g, "role: 'client'"],
  [/role:\s*"super_admin"/g, 'role: "client"'],
  [/role:\s*'technical_recruiter'/g, "role: 'client'"],
  [/role:\s*"technical_recruiter"/g, 'role: "client"'],
  [/role:\s*'recruiter'/g, "role: 'client'"],
  [/role:\s*"recruiter"/g, 'role: "client"'],
  [/role:\s*'job_seeker'/g, "role: 'client'"],
  [/role:\s*"job_seeker"/g, 'role: "client"'],
  [/'super_admin'/g, "'client'"],
  [/"super_admin"/g, '"client"'],
  [/technical_recruiter/g, 'client'],
  [/'recruiter'/g, "'client'"],
  [/"recruiter"/g, '"client"'],
  [/job_seeker/g, 'client'],

  // Recruiter attribution columns no longer exist.
  [/,?\s*assigned_recruiter_id:\s*(?:null|'[^']*'|"[^"]*")/g, ''],
  [/,?\s*assigned_technical_recruiter_id:\s*(?:null|'[^']*'|"[^"]*")/g, ''],
  [/\s*recruiter_id:\s*(?:null|'[^']*'|"[^"]*"),?/g, ''],
  [/\s*technical_recruiter_id:\s*(?:null|'[^']*'|"[^"]*"),?/g, ''],

  // The hook exposes a single candidate flag.
  [/isRecruiter:\s*true/g, 'isCandidate: true'],
  [/isRecruiter:\s*role\s*===\s*'client'/g, "isCandidate: role === 'client'"],
  [/isRecruiter:\s*role\s*===\s*"client"/g, 'isCandidate: role === "client"'],
  [/isTechnicalRecruiter:role==='client'/g, 'isCandidate:role===\'client\''],
  [/isTechnicalRecruiter:role==="client"/g, 'isCandidate:role==="client"'],
  [/isSuperAdmin:role==='client'/g, 'isCandidate:role===\'client\''],
  [/isSuperAdmin:role==="client"/g, 'isCandidate:role==="client"'],
  [/isSuperAdmin:\s*role\s*===\s*'client'/g, "isCandidate: role === 'client'"],
  [/isSuperAdmin:\s*role\s*===\s*"client"/g, 'isCandidate: role === "client"'],
  [/isClient:\s*role\s*===\s*'client'/g, "isCandidate: role === 'client'"],
  [/isClient:\s*role\s*===\s*"client"/g, 'isCandidate: role === "client"'],
  [/isClient:window\.fixtureRole==="client"/g, 'isCandidate:window.fixtureRole==="client"'],
];

let changed = 0;
for (const file of files) {
  let content;
  try { content = await readFile(file, 'utf8'); } catch { console.log(`SKIP ${file}`); continue; }
  const original = content;
  for (const [find, replace] of replacements) content = content.replace(find, replace);
  if (content !== original) { await writeFile(file, content); changed++; console.log(`updated ${file}`); }
}
console.log(`\n${changed} file(s) updated`);
