import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const rawCountries = JSON.parse(readFileSync(resolve(repoRoot, 'src/lib/profile-countries.json'), 'utf8'));

function loadScreeningLib() {
  const cache = new Map();
  function loadAbs(absPath) {
    if (cache.has(absPath)) return cache.get(absPath);
    const code = ts.transpileModule(readFileSync(absPath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const exports = {};
    const module = { exports };
    cache.set(absPath, exports);
    const dir = dirname(absPath);
    runInNewContext(code, {
      exports,
      module,
      console,
      process,
      require: (spec) => {
        if (spec === 'zod') return { z };
        if (spec === 'node:crypto') return {};
        if (spec.includes('profile-countries.json')) return rawCountries;
        let target = spec.startsWith('@/') ? resolve(repoRoot, 'src', spec.slice(2)) : resolve(dir, spec);
        if (!target.endsWith('.ts')) target += '.ts';
        return loadAbs(target);
      },
    });
    return module.exports;
  }
  return loadAbs(resolve(repoRoot, 'src/lib/ingest/screeninganswers.ts'));
}

test('Intentional EEO exclusion strips gender, race, veteran, disability, and age range fields', () => {
  const { stripEeoFields, isEeoDemographicField } = loadScreeningLib();
  const input = {
    authorized_countries: ['US', 'CA'],
    willing_to_relocate: true,
    age_18_or_older: true,
    gender: 'Male',
    race: 'Asian',
    race_ethnicity: 'Asian',
    veteran: 'No',
    veteran_status: 'No',
    disability: 'No',
    disability_status: 'No',
    demographics: { gender: 'Male' },
    age_range: '25-34',
  };

  const sanitized = stripEeoFields(input);
  assert.deepEqual({ ...sanitized }, {
    authorized_countries: ['US', 'CA'],
    willing_to_relocate: true,
    age_18_or_older: true,
  });
  assert.equal(isEeoDemographicField('What is your ethnicity?'), true);
  assert.equal(isEeoDemographicField('Are you 18 or older?'), false);
});
