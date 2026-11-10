import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFieldLabel } from '../src/lib/clean-field-label.ts';

test('cleanFieldLabel handles Ashby systemfield and placeholder concatenation', () => {
  assert.equal(
    cleanFieldLabel('_systemfield_name _systemfield_name Type here... Name Name', 'name'),
    'Full Name'
  );
  assert.equal(
    cleanFieldLabel('_systemfield_email _systemfield_email hello@example.com... Email Email', 'email'),
    'Email Address'
  );
  assert.equal(
    cleanFieldLabel(
      '41ccef44-1237-42d7-9bb4-f5a573ccc9fa 41ccef44-1237-42d7-9bb4-f5a573ccc9fa 1-415-555-1234... Phone number Phone number Phone number',
      'phone'
    ),
    'Phone Number'
  );
  assert.equal(
    cleanFieldLabel('Start typing... Location', 'location'),
    'Location'
  );
  assert.equal(
    cleanFieldLabel(
      'Pick date... What is the earliest date you could start working on this project?',
      'date_field'
    ),
    'What is the earliest date you could start working on this project?'
  );
});

test('cleanFieldLabel formats common job application fields cleanly', () => {
  assert.equal(cleanFieldLabel('LinkedIn Profile URL', 'linkedin'), 'LinkedIn Profile');
  assert.equal(cleanFieldLabel('GitHub Profile URL', 'github'), 'GitHub Profile');
  assert.equal(cleanFieldLabel('Portfolio URL', 'portfolio'), 'Portfolio / Website');
  assert.equal(cleanFieldLabel('What is your desired salary or compensation?', 'salary'), 'What is your desired salary or compensation?');
  assert.equal(cleanFieldLabel('Do you require visa sponsorship now or in the future?', 'sponsorship'), 'Do you require visa sponsorship now or in the future?');
  assert.equal(cleanFieldLabel('q1', 'first_name'), 'First Name');
});
