import test from 'node:test';
import assert from 'node:assert/strict';
import { extractResumeLocal } from '../src/lib/resumes/local-extract.ts';

test('Deterministic Resume Parser extracts candidate details for automatic profile autofill', () => {
  const sampleResume = `
Jane Doe
jane.doe@example.com | (415) 555-9876 | Austin, TX
https://linkedin.com/in/janedoe
https://github.com/janedoe

PROFESSIONAL SUMMARY
Lead Full-Stack Software Engineer with 8+ years of experience designing high-scale cloud platforms.

WORK EXPERIENCE
Lead Software Engineer - Acme Cloud Services, Austin, TX
2021 - Present
- Architected distributed backend services in Node.js and TypeScript
- Maintained Docker and Kubernetes infrastructure on AWS
- Led a team of 6 engineers building React dashboards

Senior Software Developer - TechPulse Inc, San Francisco, CA
2018 - 2021
- Designed REST and GraphQL APIs using Python and PostgreSQL
- Built real-time WebSocket notifications

EDUCATION
Master of Science in Computer Science - University of Texas at Austin
2016 - 2018

Bachelor of Technology in Computer Science - IIT Madras
2012 - 2016

SKILLS
TypeScript, JavaScript, React, Node.js, Python, PostgreSQL, AWS, Docker, Kubernetes, GraphQL, Next.js
`;

  const extracted = extractResumeLocal(sampleResume, 'Jane_Doe_Resume.pdf');
  const fields = extracted.fields;

  // Assert basic extracted fields
  assert.strictEqual(fields.full_name, 'Jane Doe');
  assert.strictEqual(fields.email, 'jane.doe@example.com');
  assert.ok(fields.phone?.includes('555-9876'));
  assert.ok(fields.linkedin_url?.includes('linkedin.com/in/janedoe'));

  // Assert skills
  assert.ok(fields.primary_skills?.includes('TypeScript'));
  assert.ok(fields.primary_skills?.includes('React'));
  assert.ok(fields.primary_skills?.includes('Node.js'));

  // Assert education history
  assert.ok(extracted.educationHistory.length >= 1);
  assert.ok(
    extracted.educationHistory.some(
      (e) => e.degree?.includes('Science') || e.institution?.includes('University')
    )
  );

  // Assert employment history
  assert.ok(extracted.employmentHistory.length >= 1);
  assert.ok(
    extracted.employmentHistory.some(
      (e) => e.title?.toLowerCase().includes('engineer') || e.employer?.toLowerCase().includes('acme')
    )
  );
});

test('Resume parsing handles missing optional fields gracefully', () => {
  const minimalResume = `
Alex Smith
alex@example.io
Frontend Developer specializing in React and CSS.
`;

  const extracted = extractResumeLocal(minimalResume, 'minimal.txt');
  assert.strictEqual(extracted.fields.full_name, 'Alex Smith');
  assert.strictEqual(extracted.fields.email, 'alex@example.io');
  assert.ok(extracted.fields.primary_skills?.includes('React'));
});
