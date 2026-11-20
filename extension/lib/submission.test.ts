import { describe, expect, it } from 'vitest';
import { confirmsSubmission } from './submission';

describe('application confirmation', () => {
  it.each([
    'Thank you for applying!',
    'Your application has been successfully submitted.',
    'Thank you! Your application was received.',
    "You've successfully applied",
  ])('recognizes %s', (message) => expect(confirmsSubmission(message)).toBe(true));

  it.each([
    'Submit application',
    'Application could not be submitted',
    'Your application is still in progress.',
    'Thank you for signing up for job alerts.',
  ])('ignores %s', (message) => expect(confirmsSubmission(message)).toBe(false));
});
