import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Side Panel DOM: contains onboarding and authenticated view containers', () => {
  const html = readFileSync(new URL('../jobright_extension/panel.html', import.meta.url), 'utf8');

  assert.ok(html.includes('id="onboarding-view"'), 'Must have #onboarding-view container');
  assert.ok(html.includes('id="authenticated-view"'), 'Must have #authenticated-view container');
  assert.ok(!html.includes('id="onboarding-view" class="onboarding-card" hidden'), 'Initial HTML must NOT hide #onboarding-view');
  assert.ok(html.includes('id="authenticated-view" hidden'), 'Initial HTML must hide #authenticated-view to prevent flash of disabled content');
  assert.ok(html.includes('id="onboarding-connect"'), 'Must have #onboarding-connect button');
  assert.ok(html.includes('1-Click Autofill'), 'Must list 1-Click Autofill value prop');
  assert.ok(html.includes('Smart Resume Sync'), 'Must list Smart Resume Sync value prop');
  assert.ok(html.includes('Automatic Tracking'), 'Must list Automatic Tracking value prop');
});

test('Side Panel Logic: panel.js defines onboarding view toggle logic', () => {
  const js = readFileSync(new URL('../jobright_extension/panel.js', import.meta.url), 'utf8');

  assert.ok(js.includes('onboarding-view'), 'panel.js must reference onboarding-view');
  assert.ok(js.includes('authenticated-view'), 'panel.js must reference authenticated-view');
  assert.ok(js.includes('onboarding-connect'), 'panel.js must wire onboarding-connect listener');
});
