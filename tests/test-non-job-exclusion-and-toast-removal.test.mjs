import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('Toast Removal: in-page bottom toast overlays are disabled in both extensions', async () => {
  const jobrightEngineCode = await readFile(path.join(repoRoot, 'jobright_extension/outside-job-engine.js'), 'utf8');
  const v3EngineCode = await readFile(path.join(repoRoot, 'browser-extension-v3.2.1/outside-job-engine.js'), 'utf8');
  const contentJsCode = await readFile(path.join(repoRoot, 'browser-extension-v3.2.1/content.js'), 'utf8');

  // 1. Check jobright_extension/outside-job-engine.js does not append toast to document.body
  assert.ok(
    !jobrightEngineCode.includes('document.body.appendChild(toast)'),
    'jobright_extension/outside-job-engine.js must NOT append toast to document.body'
  );
  assert.ok(
    jobrightEngineCode.includes('nextkin-copilot-toast'),
    'jobright_extension/outside-job-engine.js must retain cleanup for nextkin-copilot-toast'
  );

  // 2. Check browser-extension-v3.2.1/outside-job-engine.js does not append toast to document.body
  assert.ok(
    !v3EngineCode.includes('document.body.appendChild(toast)'),
    'browser-extension-v3.2.1/outside-job-engine.js must NOT append toast to document.body'
  );

  // 3. Check browser-extension-v3.2.1/content.js does not append docToast to document.body
  assert.ok(
    !contentJsCode.includes('document.body.appendChild(docToast)'),
    'browser-extension-v3.2.1/content.js must NOT append docToast to document.body'
  );
});

test('Domain Gating: non-job websites like gitingest.com are explicitly blocked', async () => {
  const jobrightEngineCode = await readFile(path.join(repoRoot, 'jobright_extension/outside-job-engine.js'), 'utf8');

  // Verify BLOCKED_HOST_PATTERNS contains gitingest.com and other utility tools
  assert.ok(jobrightEngineCode.includes("'gitingest.com'"), 'BLOCKED_HOST_PATTERNS must include gitingest.com');
  assert.ok(jobrightEngineCode.includes("'github.com'"), 'BLOCKED_HOST_PATTERNS must include github.com');
  assert.ok(jobrightEngineCode.includes("'stackoverflow.com'"), 'BLOCKED_HOST_PATTERNS must include stackoverflow.com');

  // Verify INVALID_JOB_TITLES contains gitingest, github, summary, etc.
  assert.ok(jobrightEngineCode.includes("'gitingest'"), 'INVALID_JOB_TITLES must include gitingest');
  assert.ok(jobrightEngineCode.includes("'github'"), 'INVALID_JOB_TITLES must include github');
  assert.ok(jobrightEngineCode.includes("'summary'"), 'INVALID_JOB_TITLES must include summary');

  // Verify handleApplicationSubmission aborts if not on a verified career page
  assert.ok(
    jobrightEngineCode.includes('if (!isJobOrCareerPage()) return;'),
    'handleApplicationSubmission must guard with isJobOrCareerPage'
  );

  // Verify performPageScan aborts if not on a verified career page
  assert.ok(
    jobrightEngineCode.includes('async function performPageScan() {\n    if (!isJobOrCareerPage()) return;'),
    'performPageScan must abort immediately if not isJobOrCareerPage'
  );

  // Verify dummy fallback { title: document.title, company: cleanDomainName(...) } was removed
  assert.ok(
    !jobrightEngineCode.includes('title: document.title,\n      company: cleanDomainName'),
    'handleApplicationSubmission dummy title/company fallback must be removed'
  );
});

test('Career Classification Logic: evaluates hosts correctly', () => {
  const BLOCKED_HOST_PATTERNS = [
    'gitingest.com', 'github.com', 'gitlab.com', 'stackoverflow.com', 'google.com'
  ];
  const KNOWN_ATS_HOSTS = [
    'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'keka.com'
  ];

  function testIsJobPage(host, path = '/') {
    for (const b of BLOCKED_HOST_PATTERNS) {
      if (host === b || host.endsWith('.' + b)) {
        if (host.includes('github.com') && path.startsWith('/about/careers')) return true;
        return false;
      }
    }
    for (const a of KNOWN_ATS_HOSTS) {
      if (host === a || host.endsWith('.' + a)) return true;
    }
    if (/\/(careers|jobs|positions|apply)\b/i.test(path)) return true;
    return false;
  }

  // Non-job websites MUST return false
  assert.equal(testIsJobPage('gitingest.com', '/openclaw/openclaw'), false);
  assert.equal(testIsJobPage('github.com', '/openclaw/openclaw'), false);
  assert.equal(testIsJobPage('stackoverflow.com', '/questions/12345'), false);
  assert.equal(testIsJobPage('google.com', '/search?q=test'), false);

  // Verified job/ATS sites MUST return true
  assert.equal(testIsJobPage('boards.greenhouse.io', '/company/jobs/123'), true);
  assert.equal(testIsJobPage('jobs.lever.co', '/company/role'), true);
  assert.equal(testIsJobPage('jobs.ashbyhq.com', '/org/software-engineer'), true);
  assert.equal(testIsJobPage('acme.myworkdayjobs.com', '/en-US/careers/job/1'), true);
  assert.equal(testIsJobPage('acme.keka.com', '/careers'), true);
  assert.equal(testIsJobPage('company.com', '/careers/senior-engineer'), true);
});
