import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadBuildScopedProfile({ effectiveDob = (c) => c?.confirmed_facts?.date_of_birth || c?.date_of_birth || null } = {}) {
  const panelSource = readFileSync(new URL('../jobright_extension/panel.js', import.meta.url), 'utf8');
  const start = panelSource.indexOf('function buildScopedProfile(');
  assert.ok(start !== -1, 'buildScopedProfile function not found in panel.js');

  let depth = 0;
  let end = -1;
  for (let i = start; i < panelSource.length; i++) {
    if (panelSource[i] === '{') depth++;
    else if (panelSource[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  assert.ok(end > start, 'Could not determine bounds of buildScopedProfile');
  const fnSource = panelSource.slice(start, end);
  const sandbox = { effectiveDob };
  runInNewContext(fnSource + '\n;this.buildScopedProfile = buildScopedProfile;', sandbox);
  return sandbox.buildScopedProfile;
}

test('buildScopedProfile: returns null for falsy candidate', () => {
  const buildScopedProfile = loadBuildScopedProfile();
  assert.equal(buildScopedProfile(null), null);
  assert.equal(buildScopedProfile(undefined), null);
});

test('buildScopedProfile: preserves provenance_status and falls back to "confirmed"', () => {
  const buildScopedProfile = loadBuildScopedProfile();

  const candidateWithStatus = {
    id: 'cand-1',
    version: 1,
    provenance_status: 'confirmed',
    full_name: 'Jane Doe',
  };
  const scoped1 = buildScopedProfile(candidateWithStatus);
  assert.equal(scoped1.provenance_status, 'confirmed');

  const candidateWithoutStatus = {
    id: 'cand-2',
    version: 1,
    full_name: 'John Smith',
  };
  const scoped2 = buildScopedProfile(candidateWithoutStatus);
  assert.equal(scoped2.provenance_status, 'confirmed', 'Must default provenance_status to "confirmed"');

  const candidateCustomStatus = {
    id: 'cand-3',
    version: 1,
    provenance_status: 'pending_review',
    full_name: 'Alice Wonder',
  };
  const scoped3 = buildScopedProfile(candidateCustomStatus);
  assert.equal(scoped3.provenance_status, 'pending_review', 'Must preserve custom provenance_status');
});

test('buildScopedProfile: retains extended keys in both top-level and confirmed_facts', () => {
  const buildScopedProfile = loadBuildScopedProfile();

  const candidate = {
    id: 'cand-extended',
    version: 2,
    provenance_status: 'confirmed',
    full_name: 'Alex Morgan',
    race_ethnicity: 'Hispanic or Latino',
    primary_skills: 'React, Node.js, TypeScript',
    skills: 'React, Node.js, TypeScript, Docker, GraphQL',
    current_job_title: 'Staff Software Engineer',
    current_title: 'Staff Software Engineer',
    experience_years: 8,
    total_experience_years: 8,
  };

  const scoped = buildScopedProfile(candidate);

  // Top-level properties
  assert.equal(scoped.race_ethnicity, 'Hispanic or Latino');
  assert.equal(scoped.primary_skills, 'React, Node.js, TypeScript');
  assert.equal(scoped.skills, 'React, Node.js, TypeScript, Docker, GraphQL');
  assert.equal(scoped.current_job_title, 'Staff Software Engineer');
  assert.equal(scoped.experience_years, 8);
  assert.equal(scoped.total_experience_years, 8);

  // confirmed_facts properties
  assert.ok(scoped.confirmed_facts, 'confirmed_facts must be defined');
  assert.equal(scoped.confirmed_facts.race_ethnicity, 'Hispanic or Latino');
  assert.equal(scoped.confirmed_facts.primary_skills, 'React, Node.js, TypeScript');
  assert.equal(scoped.confirmed_facts.skills, 'React, Node.js, TypeScript, Docker, GraphQL');
  assert.equal(scoped.confirmed_facts.current_job_title, 'Staff Software Engineer');
  assert.equal(scoped.confirmed_facts.experience_years, 8);
  assert.equal(scoped.confirmed_facts.total_experience_years, 8);
});

test('buildScopedProfile: extracts extended keys from confirmed_facts sub-object', () => {
  const buildScopedProfile = loadBuildScopedProfile();

  const candidate = {
    id: 'cand-nested',
    version: 1,
    provenance_status: 'confirmed',
    confirmed_facts: {
      full_name: 'Pat Doe',
      race_ethnicity: 'Asian',
      primary_skills: 'Python, Django',
      skills: 'Python, Django, AWS',
      current_job_title: 'Senior Backend Engineer',
      experience_years: 5,
      total_experience_years: 5,
    },
  };

  const scoped = buildScopedProfile(candidate);

  // Top-level properties
  assert.equal(scoped.race_ethnicity, 'Asian');
  assert.equal(scoped.primary_skills, 'Python, Django');
  assert.equal(scoped.skills, 'Python, Django, AWS');
  assert.equal(scoped.current_job_title, 'Senior Backend Engineer');
  assert.equal(scoped.experience_years, 5);
  assert.equal(scoped.total_experience_years, 5);

  // confirmed_facts properties
  assert.equal(scoped.confirmed_facts.race_ethnicity, 'Asian');
  assert.equal(scoped.confirmed_facts.primary_skills, 'Python, Django');
  assert.equal(scoped.confirmed_facts.skills, 'Python, Django, AWS');
  assert.equal(scoped.confirmed_facts.current_job_title, 'Senior Backend Engineer');
  assert.equal(scoped.confirmed_facts.experience_years, 5);
  assert.equal(scoped.confirmed_facts.total_experience_years, 5);
});
