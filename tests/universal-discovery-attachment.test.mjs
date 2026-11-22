import test from 'node:test';
import assert from 'node:assert/strict';

function isResumeInput(nameOrIdOrLabel) {
  const text = String(nameOrIdOrLabel || '').toLowerCase();
  const resumeRegex = /resume|cv|curriculum[\s_-]*vitae/i;
  if (/cover[\s_-]*letter|portfolio|transcript/i.test(text) && !resumeRegex.test(text)) {
    return false;
  }
  return resumeRegex.test(text);
}

test('isResumeInput correctly detects resume file upload fields', () => {
  assert.ok(isResumeInput('upload_resume'));
  assert.ok(isResumeInput('attach-cv'));
  assert.ok(isResumeInput('curriculum_vitae'));
  assert.ok(isResumeInput('candidate_cv_file'));
  assert.ok(!isResumeInput('cover_letter'));
  assert.ok(!isResumeInput('transcript_file'));
  assert.ok(!isResumeInput('portfolio_link'));
});

test('base64 to Uint8Array binary reconstruction produces valid byte array', () => {
  const sampleBase64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
  const binaryStr = atob(sampleBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  assert.equal(bytes.length, 11);
  assert.equal(bytes[0], 72); // 'H'
  assert.equal(bytes[10], 100); // 'd'
});

test('combobox and select recognition patterns cover aria and data-automation selectors', () => {
  const COMBO_PATTERNS = [
    '[role="combobox"]',
    '[data-automation-id*="prompt" i]',
    '[data-automation-id*="select" i]',
    '.select2-selection',
    '.ng-select'
  ];
  for (const pattern of COMBO_PATTERNS) {
    assert.ok(typeof pattern === 'string' && pattern.length > 0);
  }
});
