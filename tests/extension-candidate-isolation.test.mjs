import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

async function setupBackground(configState = {}) {
  const bgCode = await readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
  let messageListener = null;

  const localState = {
    ...configState
  };

  const chromeMock = {
    storage: {
      local: {
        get: async (keys) => {
          if (keys == null) return { ...localState };
          const result = {};
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) result[k] = localState[k];
          return result;
        },
        remove:async key=>{delete localState[key];},
        set: async (obj) => {
          Object.assign(localState, obj);
        }
      }
    },
    runtime: {
      onMessage: {
        addListener: (fn) => { messageListener = fn; }
      }
    },
    tabs: {
      onRemoved: { addListener: () => {} }
    }
  };

  const sandbox = {
    chrome: chromeMock,
    crypto:webcrypto,TextEncoder,AbortSignal,setTimeout:fn=>setTimeout(fn,0),
    URL,
    URLSearchParams,
    Promise,
    Date,
    console,
    fetch: async (url, options) => {
      if (configState.mockFetch) return configState.mockFetch(url, options);
      return { ok: false, status: 403, json: async () => ({ error: 'Unauthorized' }) };
    },
    NextkinResumeWorkflows: { handle: () => ({ success: true }) }
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(await readFile(new URL('../browser-extension/resume-engine.js',import.meta.url),'utf8'),context);
  vm.runInContext(bgCode, context);

  return {
    sendMessage: (msg) => new Promise((resolve) => {
      messageListener(msg, { tab: { id: 1 }, url: 'https://job-boards.greenhouse.io/test/jobs/1' }, resolve);
    }),
    localState
  };
}

test('Wrong-candidate fallback bug: candidate A receiving 403 must NEVER return candidate B uploaded facts', async () => {
  const candidateA = { id: 'cand-A', full_name: 'Alice Candidate' };
  const candidateB = {
    id: 'cand-B',
    full_name: 'Bob Uploaded',
    total_experience_years: 10,
    primary_skills: 'Go, Kubernetes'
  };

  const { sendMessage } = await setupBackground({
    token: 'jwt-token',
    origin: 'https://portal.example.test',
    candidates: [candidateA],
    uploadedCandidate: candidateB,
    mockFetch: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Access denied to candidate' })
    })
  });

  const res = await sendMessage({
    type: 'get_ai_answers',
    candidateId: 'cand-A',consent:true,sessionId:'one',jobTitle:'Engineer',companyName:'Fixture',jobDescription:'Python engineering with backend and reporting experience.',jobUrl:'https://jobs.example.test/one',
    questions: [{ id: 'q1', label: 'How many years of experience do you have?' }]
  });

  // Must report error, NOT return candidate B's answers!
  assert.match(res.error,/Access denied/, 'Must return the actual 403 access error');
  assert.ok(!res.answers, 'Must not return answers of an unrelated candidate');
});

test('Sponsorship vs Work-Authorization: sponsorship question must NOT use work-authorization value', async () => {
  // Candidate is US authorized (e.g. H1B or Citizen), but DOES require sponsorship
  const candidate = {
    id: 'cand-1',
    full_name: 'H1B Candidate',
    authorized_in_usa: true,
    need_sponsorship_now: true,
    need_sponsorship_future: true
  };

  const { sendMessage } = await setupBackground({
    token: null, // offline/standalone mode
    uploadedCandidate: candidate
  });

  const res = await sendMessage({
    type: 'get_ai_answers',
    candidateId: 'cand-1',
    questions: [
      { id: 'q_auth', label: 'Are you authorized to work in the United States?' },
      { id: 'q_sponsor', label: 'Will you now or in the future require visa sponsorship?' }
    ]
  });

  assert.equal(res.success, true);
  assert.equal(res.answers.q_auth, 'Yes', 'Auth question should be Yes');
  assert.equal(res.answers.q_sponsor, 'Yes', 'Sponsorship question should be Yes');
});

test('Unknown authorization or sponsorship must NOT default to No in offline fallback', async () => {
  const candidate = {
    id: 'cand-unknown',
    full_name: 'Unknown Facts Candidate',
    authorized_in_usa: null,
    need_sponsorship_now: null,
    need_sponsorship_future: null
  };

  const { sendMessage } = await setupBackground({
    token: null,
    uploadedCandidate: candidate
  });

  const res = await sendMessage({
    type: 'get_ai_answers',
    candidateId: 'cand-unknown',
    questions: [
      { id: 'q_auth', label: 'Are you authorized to work in the United States?' },
      { id: 'q_sponsor', label: 'Will you require sponsorship?' }
    ]
  });

  assert.equal(res.success, true);
  assert.equal(res.answers.q_auth, undefined, 'Unknown auth must not be answered');
  assert.equal(res.answers.q_sponsor, undefined, 'Unknown sponsorship must not be answered');
});

test('connected screening polls read-only results and reuses the same request identity',async()=>{
 const calls=[];let posts=0;
 const {sendMessage}=await setupBackground({token:'synthetic',origin:'https://portal.example.test',mockFetch:async(url,options)=>{
  calls.push({url:String(url),method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
  if(options.method==='POST'){posts++;return {ok:true,json:async()=>({taskId:'task-fixture',status:'queued',answers:{}})};}
  return {ok:true,json:async()=>({taskId:'task-fixture',status:'succeeded',sessionId:'one',answers:{q:'Python'}})};
 }});
 const message={type:'get_ai_answers',candidateId:'candidate-a',consent:true,sessionId:'one',jobTitle:'Engineer',companyName:'Fixture',jobDescription:'Python backend and reporting experience required.',jobUrl:'https://jobs.example.test/one',questions:[{id:'q',label:'Describe your skills?',type:'text'}]};
 assert.equal((await sendMessage(message)).answers.q,'Python');assert.equal((await sendMessage(message)).answers.q,'Python');
 assert.equal(posts,2);assert.equal(calls[0].body.requestId,calls[2].body.requestId);assert.equal(calls[1].method,'GET');assert.match(calls[0].url,/answer-drafts$/);assert.equal(calls[0].body.version,2);
});
test('no consent prevents any provider-service request',async()=>{
 let calls=0;const {sendMessage}=await setupBackground({token:'synthetic',origin:'https://portal.example.test',mockFetch:async()=>{calls++;throw Error('unexpected request');}});
 assert.match((await sendMessage({type:'get_ai_answers',candidateId:'candidate-a',questions:[]})).error,/Agree/);assert.equal(calls,0);
});
