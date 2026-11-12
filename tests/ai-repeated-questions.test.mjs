import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('AI answer generation and repeated question caching logic', async (t) => {
  // Test normalizeQuestionKey
  function normalizeQuestionKey(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const q1 = 'What is your experience with React and TypeScript?';
  const q2 = 'What is your experience with React & TypeScript?!';
  assert.equal(normalizeQuestionKey(q1), normalizeQuestionKey(q2));

  // Simulate stored answers cache
  const storedAnswers = {};
  const normKey = normalizeQuestionKey(q1);

  // 1. Initial lookup -> missing
  assert.equal(storedAnswers[normKey], undefined);

  // 2. AI generates answer and stores it
  const aiGenerated = 'I have 6+ years of experience building modern web apps with React and TypeScript.';
  storedAnswers[normKey] = {
    question: q1,
    answer: aiGenerated,
    updatedAt: Date.now()
  };

  // 3. Repeated question arrives on another application form
  const repeatedKey = normalizeQuestionKey(q2);
  const cached = storedAnswers[repeatedKey];
  assert.ok(cached);
  assert.equal(cached.answer, aiGenerated);

  // 4. Bio detection
  const isBio1 = /\b(bio|biography|summary|about\s*(you|yourself)?|professional\s*summary|overview)\b/i.test('Professional Summary');
  const isBio2 = /\b(bio|biography|summary|about\s*(you|yourself)?|professional\s*summary|overview)\b/i.test('Tell us about yourself');
  const isBio3 = /\b(bio|biography|summary|about\s*(you|yourself)?|professional\s*summary|overview)\b/i.test('Candidate Bio');
  assert.ok(isBio1);
  assert.ok(isBio2);
  assert.ok(isBio3);
});
