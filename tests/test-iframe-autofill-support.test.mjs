import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('Iframe Manifest Configuration: all_frames is enabled for universal autofill', async () => {
  const manifestRaw = await readFile(path.join(repoRoot, 'jobright_extension/manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);

  const mainScriptEntry = manifest.content_scripts.find(cs =>
    cs.js && cs.js.includes('outside-job-engine.js')
  );
  assert.ok(mainScriptEntry, 'outside-job-engine.js content script entry must exist in manifest');
  assert.equal(mainScriptEntry.all_frames, true, 'outside-job-engine.js content script MUST have all_frames: true');

  const frameAgentEntry = manifest.content_scripts.find(cs =>
    cs.js && cs.js.includes('frame-agent.js')
  );
  assert.ok(frameAgentEntry, 'frame-agent.js content script entry must exist in manifest');
  assert.equal(frameAgentEntry.all_frames, true, 'frame-agent.js content script MUST have all_frames: true');
  assert.ok(frameAgentEntry.matches.includes('<all_urls>'), 'frame-agent.js must match all URLs, not just greenhouse');
});

test('Iframe Form Discovery: walks accessible iframe contentDocuments', async () => {
  const formDiscoveryCode = await readFile(path.join(repoRoot, 'jobright_extension/form-discovery.js'), 'utf8');

  // Verify that iframe detection now attempts to walk contentDocument
  assert.ok(
    formDiscoveryCode.includes('el.contentDocument'),
    'form-discovery.js must check el.contentDocument'
  );
  assert.ok(
    formDiscoveryCode.includes('walk(el.contentDocument)'),
    'form-discovery.js must walk el.contentDocument'
  );
});

test('Embedded Support: validates ATS frames universally without Stripe restriction', async () => {
  const embeddedSupportCode = await readFile(path.join(repoRoot, 'jobright_extension/embedded-support.js'), 'utf8');

  // Verify known ATS list includes major ATS providers
  assert.ok(embeddedSupportCode.includes('greenhouse.io'), 'must include greenhouse.io');
  assert.ok(embeddedSupportCode.includes('lever.co'), 'must include lever.co');
  assert.ok(embeddedSupportCode.includes('ashbyhq.com'), 'must include ashbyhq.com');
  assert.ok(embeddedSupportCode.includes('myworkdayjobs.com'), 'must include myworkdayjobs.com');
  assert.ok(embeddedSupportCode.includes('smartrecruiters.com'), 'must include smartrecruiters.com');
  assert.ok(embeddedSupportCode.includes('keka.com'), 'must include keka.com');

  // Evaluate validFrame logic directly
  const fn = new Function('globalThis', embeddedSupportCode);
  const sandbox = {};
  fn(sandbox);

  const { validFrame } = sandbox.NextkinEmbeddedSupport || globalThis.NextkinEmbeddedSupport;
  assert.ok(typeof validFrame === 'function', 'validFrame must be exported');

  // Verify Greenhouse embed for any company returns true
  assert.equal(validFrame('https://careers.airbnb.com/job/123', 'https://boards.greenhouse.io/embed/job_app?token=123'), true);
  // Verify Lever embed returns true
  assert.equal(validFrame('https://careers.netflix.com/job/456', 'https://jobs.lever.co/netflix/456/apply'), true);
  // Verify Ashby embed returns true
  assert.equal(validFrame('https://careers.remote.com/job/789', 'https://jobs.ashbyhq.com/remote/789/application'), true);
});

test('Outside Job Engine: cross-frame broadcast and multi-frame control collection', async () => {
  const outsideEngineCode = await readFile(path.join(repoRoot, 'jobright_extension/outside-job-engine.js'), 'utf8');

  // 1. Verify broadcastAutofillToFrames exists and posts message to iframes
  assert.ok(outsideEngineCode.includes('broadcastAutofillToFrames'), 'must define broadcastAutofillToFrames');
  assert.ok(outsideEngineCode.includes('frame.contentWindow.postMessage'), 'must post message to frame.contentWindow');
  assert.ok(outsideEngineCode.includes('NEXTKIN_BROADCAST_AUTOFILL'), 'must notify background worker to broadcast');

  // 2. Verify controls collection traverses frames
  assert.ok(outsideEngineCode.includes('collectControls'), 'must use recursive collectControls');
  assert.ok(outsideEngineCode.includes('frame.contentDocument'), 'must collect from frame.contentDocument');

  // 3. Verify onMessage listener receives broadcast in child frames
  assert.ok(outsideEngineCode.includes('chrome.runtime.onMessage.addListener'), 'must listen for broadcast messages');
});

test('Background Worker: handles NEXTKIN_BROADCAST_AUTOFILL to dispatch across tab frames', async () => {
  const bgCode = await readFile(path.join(repoRoot, 'jobright_extension/static/background/index.js'), 'utf8');

  assert.ok(bgCode.includes("type === 'NEXTKIN_BROADCAST_AUTOFILL'"), 'background must handle NEXTKIN_BROADCAST_AUTOFILL');
  assert.ok(bgCode.includes('chrome.tabs.sendMessage'), 'background must call chrome.tabs.sendMessage');
});
