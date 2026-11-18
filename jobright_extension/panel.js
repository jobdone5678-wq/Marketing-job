const $ = id => document.getElementById(id);
const portalOrigin = 'https://www.nextkinhr.com';
let sidePanelPort;
try {
  if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
    sidePanelPort = chrome.runtime.connect({ name: 'nextkin_side_panel' });
  }
} catch {}
window.addEventListener('beforeunload', () => {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'NEXTKIN_SIDE_PANEL_STATE', isOpen: false }).catch(() => {});
      }
    }).catch(() => {});
  } catch {}
});
const captureScripts = ['adapters/ats-adapters.js', 'core/form-discovery.js', 'core/field-mapping.js',
  'core/field-writer.js', 'core/job-capture.js', 'core/application.js'];
const profileLabels = {
  full_name: 'Full name',
  email: 'Email',
  phone: 'Phone',
  current_employer: 'Current company',
  current_job_title: 'Current title',
  current_city: 'City',
  current_state: 'State',
  zip_code: 'Postal Code',
  authorized_in_usa: 'Authorized to work in the US',
  need_sponsorship_now: 'Requires sponsorship now',
  need_sponsorship_future: 'Requires future sponsorship',
  primary_skills: 'Primary skills',
  linkedin_url: 'LinkedIn URL',
};

let connection, candidate, currentTab, currentForm, documents = [], selected, preferences = {}, allProfilesMap = new Map();
let refreshNumber = 0;
let refreshTimer;
let refreshing = false;
let busy = false;
let resultsPage;
let lastCapture;
let legacyResume;
let resumeEndpointAvailable = false;
let pairing = false;
let portalCaptureSupport;
let activeJob;
let answerReview;
let lastResumeMatch;
let matchRequest = 0;

function apiOrigin(origin) {
  return origin === 'https://nextkinhr.com' ? portalOrigin : origin;
}

function workspaceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(url.hostname)) return url.origin;
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
  } catch {}
  return null;
}

function setLine(id, message, ready) {
  $(id).lastElementChild.textContent = message;
  $(id).dataset.ready = String(ready);
}

function notice(id, message, isError = false) {
  $(id).textContent = message;
  $(id).hidden = !message;
  $(id).dataset.error = String(isError);
  delete $(id).dataset.accountSync;
  delete $(id).dataset.jobSave;
}

async function api(path, options = {}, session = connection) {
  if (!session?.token || !workspaceUrl(session.origin)) throw new Error('Connect to NextKinHR first.');
  const response = await fetch(new URL('/api/extension/' + path, apiOrigin(session.origin)), {
    ...options,
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    headers: { ...options.headers, Authorization: 'Bearer ' + session.token },
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(data?.error || `NextKinHR returned HTTP ${response.status} for ${path.split('?')[0]}.`);
    error.status = response.status;
    error.fromApi = Boolean(data?.error);
    throw error;
  }
  return data;
}

function authFailed(error) {
  return error?.status === 401 || error?.status === 403;
}

function recoverableResumeError(error) {
  return error?.status === 404 || error?.status === 405;
}

async function syncLegacyResume(session, profile) {
  if (!profile?.id) return [];
  const key = JSON.stringify([session.origin, session.user.id, profile.id, profile.version]);
  if (legacyResume?.key !== key || legacyResume.token !== session.token || Date.now() >= legacyResume.expiresAt) {
    const file = await api('resume-file?' + new URLSearchParams({ candidateId: profile.id, originalOnly: 'true' }), {}, session)
      .catch(error => {
        if (error.status === 404) return null;
        throw error;
      });
    // Older servers can generate a DOCX when no uploaded file is found.
    const generatedName = (profile.full_name || 'Candidate').replace(/[^a-zA-Z0-9]/g, '_') + '_Resume.docx';
    const knownFilename = profile.confirmed_facts?.filename;
    const isOriginal = file?.source === 'upload' ||
      (!file?.source && (file?.filename !== generatedName || file?.filename === knownFilename));
    const original = file?.base64 && file.filename && isOriginal ? file : null;
    legacyResume = { key, token: session.token, file: original, expiresAt: Date.now() + 60000 };
  }
  return legacyResume.file ? [{
    id: 'dashboard-resume', filename: legacyResume.file.filename, candidate_id: profile.id, status: 'confirmed',
  }] : [];
}

function showFacts(id, facts) {
  $(id).replaceChildren();
  for (const [label, value] of facts) {
    if (value === '' || value == null) continue;
    const name = document.createElement('dt');
    const detail = document.createElement('dd');
    name.textContent = label;
    detail.textContent = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
    $(id).append(name, detail);
  }
}

function renderAccount() {
  const connected = !!connection;
  const name = candidate?.full_name || connection?.user?.name;
  setLine('connection', connected ? 'NextKinHR Connected' : 'Connect to NextKinHR', connected);
  setLine('candidate', name ? 'Candidate: ' + name : 'Candidate profile', !!name);
  $('connect').textContent = connected ? 'Change' : 'Connect';
  $('resume-title').textContent = name || 'Resume';
  $('resume-filename').textContent = selected?.filename || (connected
    ? (resumeEndpointAvailable ? 'Upload a resume here or in My Profile & Resume.' : 'Upload a resume in My Profile & Resume.')
    : 'Connect your NextKinHR account to sync your resume.');
  $('resume-email').textContent = candidate?.email || connection?.user?.email || '';
  $('resume-email').hidden = !$('resume-email').textContent;
  $('change-resume').hidden = !connected || !documents.length;
  $('first-upload').hidden = !connected || !!documents.length || !resumeEndpointAvailable;
  $('upload-resume').hidden = !resumeEndpointAvailable;
  $('profile-panel').hidden = !connected;
  if (!connected) {
    $('resume-options').hidden = true;
    $('upload-form').hidden = true;
  }
  $('resume-select').replaceChildren(...documents.map(doc => {
    const label = (doc.displayName || doc.filename) + (doc.status === 'failed' ? ' (processing failed)' : '');
    const option = new Option(label, doc.id);
    option.disabled = doc.status === 'failed';
    return option;
  }));
  if (selected) $('resume-select').value = selected.id;
  showFacts('profile-facts', Object.entries(profileLabels).map(([key, label]) => [label, candidate?.[key]]));
  $('zip-code-input').value = candidate?.zip_code || '';
  $('autofill').disabled = busy || !currentForm || !candidate;
  $('ai-screening-option').hidden = !currentForm || !candidate;
  $('review-answers').hidden = !currentForm || !candidate;
  $('review-answers').disabled = busy;
}

function renderJob(job, form, saved) {
  const workspace = !!workspaceUrl(currentTab?.url);
  const host = /^https?:/.test(currentTab?.url || '') ? new URL(currentTab.url).hostname : '';
  $('site-label').textContent = workspace ? 'NextKinHR Workspace' : host || 'Current tab';
  $('active-site').hidden = !host;
  $('site-title').textContent = job?.title || (workspace ? 'Recruiter & Candidate Hub' : host ? 'Career Portal' : 'Recruiting Copilot');
  $('site-summary').textContent = job ? [job.company, job.location].filter(Boolean).join(' · ')
    : workspace ? 'Ready to assist on an outside career portal' : 'Open a job posting or application form';
  setLine('job-status', job ? (saved ? 'Job details saved' : 'Job details detected') : 'Open a job page to evaluate ATS match', !!job);
  setLine('form-status', form ? (candidate ? 'Application form ready for autofill' : 'Application form detected') : 'Open an application form to autofill', form);
}

function renderMatch(message, report = null) {
  $('match-title').textContent = report?.score != null ? `ATS Match · ${report.score}%` : 'ATS Match';
  $('match-status').textContent = message;
  $('match-breakdown').hidden = !report;
  if (!report) return;
  showFacts('match-skills', [
    ['Matching skills', report.matched.join(', ') || 'None identified'],
    ['Missing skills', report.missing.join(', ') || 'None identified'],
  ]);
  for (const [id, points] of [
    ['match-points', report.matchedPoints],
    ['unmatched-points', report.unmatchedPoints.map(requirement => ({ requirement }))],
  ]) {
    $(id).replaceChildren(...(points.length ? points : [{ requirement: 'None identified.' }]).map(point => {
      const li = document.createElement('li');
      li.textContent = point.requirement;
      if (point.evidence) {
        const evidence = document.createElement('small');
        evidence.textContent = 'Resume evidence: ' + point.evidence;
        li.append(evidence);
      }
      return li;
    }));
  }
}

async function refreshResumeMatch(job, resume, session) {
  const request = ++matchRequest;
  $('match-panel').hidden = !job;
  if (!job || !session || !resume) {
    lastResumeMatch = null;
    renderMatch(!session ? 'Connect to NextKinHR to compare your resume.' :
      'Upload or select a resume to compare with this job.');
    return null;
  }
  const legacy = resume.id === 'dashboard-resume';
  const source = legacy ? { candidateId: resume.candidate_id } : { documentId: resume.id };
  const key = JSON.stringify([session.origin, session.user.id, source, resume.filename, legacy ? candidate?.version : null, job.jobUrl, job.description]);
  const label = report => report.score === null ? `No scorable requirements found for ${report.filename}.` :
    `Estimated job requirement coverage for ${report.filename}. Missing items lack evidence in this resume.`;
  if (lastResumeMatch?.key === key && Date.now() < lastResumeMatch.expiresAt) {
    renderMatch(lastResumeMatch.message, lastResumeMatch.report);
    return lastResumeMatch.report;
  }
  renderMatch(`Comparing ${resume.filename} with this job…`);
  try {
    const report = await api('resume-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...source, jobDescription: job.description }),
    }, session);
    if (request !== matchRequest) return null;
    lastResumeMatch = { key, report, message: label(report), expiresAt: Date.now() + 300_000 };
    renderMatch(lastResumeMatch.message, report);
    return report;
  } catch (error) {
    if (request === matchRequest) {
      const message = error.status === 405 || (error.status === 404 && !error.fromApi)
        ? 'Resume comparison requires the updated NextKinHR backend.' : error.message;
      lastResumeMatch = { key, report: null, message, expiresAt: Date.now() + 30_000 };
      renderMatch(message);
    }
    return null;
  }
}

let kekaDescription;
async function loadKekaPosting(tabUrl) {
  const posting = NextkinJobCapture.kekaPosting(new URL(tabUrl));
  if (!posting || !/\/applyjob\//i.test(new URL(tabUrl).pathname)) return null;
  if (kekaDescription?.url === posting.details) return kekaDescription.job;
  const response = await fetch(posting.details, {
    credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return null;
  const template = document.createElement('template');
  template.innerHTML = await response.text();
  const job = NextkinJobCapture.read(template.content, posting.details);
  if (job) kekaDescription = { url: posting.details, job };
  return job;
}

async function scan(tab) {
  if (tab?.id == null || !/^https?:/.test(tab.url || '')) return [];
  const target = { tabId: tab.id, allFrames: true };
  const inspect = async (scope) => {
    await chrome.scripting.executeScript({ target: scope, files: captureScripts });
    return chrome.scripting.executeScript({ target: scope, func: () => globalThis.NextkinApplication?.scan() });
  };
  try {
    return await inspect(target);
  } catch {
    try {
      return await inspect({ tabId: tab.id });
    } catch {
      return [];
    }
  }
}

async function refresh() {
  if (busy) return;
  const number = ++refreshNumber;
  const [[tab], storage] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.local.get(['origin', 'token', 'user', 'resumePreferences', 'candidateProfile', 'resumeData', 'savedProfiles', 'savedResumes', 'activeCandidateId']),
  ]);
  if (number !== refreshNumber || busy) return;
  const session = (workspaceUrl(storage.origin) && storage.token && storage.user?.id)
    ? storage
    : (storage.candidateProfile && workspaceUrl(storage.origin)
      ? {
          origin: storage.origin,
          token: storage.token || 'local_session_token',
          user: storage.user || { id: storage.candidateProfile.id || 'candidate', name: storage.candidateProfile.full_name || 'Candidate', role: 'candidate' }
        }
      : null);
  const pageKey = [tab?.id, tab?.url, session?.origin, session?.user.id].join('|');
  const pageChanged = pageKey !== resultsPage;
  if (pageChanged) {
    $('results').hidden = true;
    $('answer-review').hidden = true;
    answerReview = null;
    notice('notice', '');
    resultsPage = pageKey;
  }
  const accountChanged = session?.origin !== connection?.origin || session?.user.id !== connection?.user.id;
  if (accountChanged) {
    $('resume-options').hidden = true;
    $('upload-form').hidden = true;
    $('upload-form').reset();
    notice('upload-status', '');
  }
  currentTab = tab;
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'NEXTKIN_SIDE_PANEL_STATE', isOpen: true }).catch(() => {});
  }
  const scans = scan(tab);
  let account;
  let resumeList = [];
  let issue = null;
  let authenticated = false;
  let canUpload = false;
  if (session) {
    const [profileResult, resumeResult] = await Promise.allSettled([
      api('candidates', {}, session),
      api('resume', {}, session),
    ]);
    const profileError = profileResult.status === 'rejected' ? profileResult.reason : null;
    const resumeError = resumeResult.status === 'rejected' ? resumeResult.reason : null;
    account = profileResult.status === 'fulfilled' ? profileResult.value : null;
    if (authFailed(profileError) || authFailed(resumeError) || (account && account.actorId !== session.user.id)) {
      if (!storage.candidateProfile) {
        issue = 'Your NextKinHR connection could not be verified. Click Connect to pair again.';
        account = null;
        legacyResume = null;
      } else {
        authenticated = true;
      }
    } else {
      authenticated = !!account || resumeResult.status === 'fulfilled' || !!storage.candidateProfile;
      if (resumeResult.status === 'fulfilled') {
        canUpload = true;
        resumeList = resumeResult.value.documents || [];
        const profile = account?.candidates?.[0] || storage.candidateProfile;
        if (!resumeList.some(doc => doc.status !== 'failed' && (!doc.candidate_id || doc.candidate_id === profile?.id)) &&
          /^data:application\/(?:pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,/i.test(profile?.resume_url || '')) {
          try {
            resumeList = [...resumeList, ...await syncLegacyResume(session, profile)];
          } catch (error) {
            issue = 'Resume sync: ' + error.message;
          }
        } else {
          legacyResume = null;
        }
      } else if (recoverableResumeError(resumeError) && (account || storage.candidateProfile)) {
        try {
          resumeList = await syncLegacyResume(session, account?.candidates?.[0] || storage.candidateProfile);
        } catch (error) {
          if (authFailed(error) && !storage.candidateProfile) {
            authenticated = false;
            account = null;
            legacyResume = null;
          }
          issue = 'Resume sync: ' + error.message;
        }
      } else if (!storage.candidateProfile) {
        issue = 'Resume sync: ' + resumeError.message;
      }
      if (profileError && !issue && !storage.candidateProfile) issue = 'Candidate profile: ' + profileError.message;
    }
  } else {
    legacyResume = null;
  }
  const frames = await scans;
  if (number !== refreshNumber || busy) return;
  connection = authenticated ? session : (storage.candidateProfile && session ? session : null);
  resumeEndpointAvailable = canUpload;
  allProfilesMap.clear();
  // 1. Load candidates from API account
  for (const c of account?.candidates || []) {
    if (c?.id) allProfilesMap.set(c.id, c);
  }
  // 2. Load candidates from local storage savedProfiles (ensures NO candidate is wiped)
  for (const [id, c] of Object.entries(storage.savedProfiles || {})) {
    if (c && (c.id || id)) allProfilesMap.set(c.id || id, c);
  }
  // 3. Include active candidateProfile if present
  if (storage.candidateProfile) {
    const id = storage.candidateProfile.id || storage.activeCandidateId || 'current_candidate';
    allProfilesMap.set(id, storage.candidateProfile);
  }

  preferences = storage.resumePreferences || {};
  const preferenceKey = connection && connection.origin + '|' + connection.user.id;

  // Determine active candidate ID
  let activeCandId = storage.activeCandidateId || preferences?.[preferenceKey + '|candidate'] || storage.candidateProfile?.id || null;
  if (!activeCandId && allProfilesMap.size > 0) {
    activeCandId = allProfilesMap.keys().next().value;
  }

  candidate = (activeCandId && allProfilesMap.get(activeCandId)) || storage.candidateProfile || account?.candidates?.[0] || null;

  // Preserve and build all documents from API and local savedResumes
  const docMap = new Map();
  for (const doc of resumeList || []) {
    if (doc?.id) docMap.set(doc.id, doc);
  }
  for (const [docId, doc] of Object.entries(storage.savedResumes || {})) {
    if (doc?.id || docId) docMap.set(doc?.id || docId, doc);
  }
  if (storage.resumeData) {
    const rId = storage.resumeData.id || 'dashboard-resume';
    docMap.set(rId, {
      ...storage.resumeData,
      base64: storage.resumeData.base64,
      mimeType: storage.resumeData.mimeType,
      id: rId,
      filename: storage.resumeData.filename || `${candidate?.full_name || 'Candidate'}_Resume.pdf`,
      candidate_id: candidate?.id,
      status: 'confirmed',
      raw_text: storage.resumeData.raw_text || storage.resumeData.source_text || ''
    });
  }

  documents = [...docMap.values()].map(doc => {
    const docCand = doc.candidate_id ? allProfilesMap.get(doc.candidate_id) : null;
    const candName = doc.candidate_name || docCand?.full_name || (candidate && doc.candidate_id === candidate.id ? candidate.full_name : '');
    return {
      ...doc,
      displayName: candName ? `${candName} — ${doc.filename}` : doc.filename
    };
  });

  const usable = documents.filter(doc => doc.status !== 'failed');
  selected = usable.find(doc => doc.id === preferences[preferenceKey]) ||
    usable.find(doc => candidate && doc.candidate_id === candidate.id) ||
    usable[0] || null;
  if (documents.some(doc => doc.id === preferences?.[preferenceKey] && doc.status === 'failed')) {
    notice('upload-status', 'Resume processing failed. Choose another PDF or DOCX.', true);
  }
  currentForm = frames.find(frame => frame.frameId === 0 && frame.result?.hasForm) ||
    frames.find(frame => frame.result?.hasForm) || null;
  let job = frames.find(frame => frame.frameId === 0 && frame.result?.job)?.result.job ||
    frames.find(frame => frame.result?.job)?.result.job || null;
  if (!job && /^https?:/.test(tab?.url || '')) {
    job = await loadKekaPosting(tab.url).catch(() => null);
    if (number !== refreshNumber || busy) return;
  }
  activeJob = job;
  renderAccount();
  renderJob(job, !!currentForm, false);
  const resumeForMatch = selected;
  const matching = refreshResumeMatch(job, resumeForMatch, connection);
  if (issue) {
    notice('notice', issue, true);
    $('notice').dataset.accountSync = 'true';
  } else if ($('notice').dataset.accountSync === 'true') {
    notice('notice', '');
  }
  if (!connection || !job) return;
  const jobOrigin = workspaceUrl(job.jobUrl);
  const portalJob = jobOrigin && /^\/(?:dashboard\/jobs|jobs\/info)\//.test(new URL(job.jobUrl).pathname);
  if (portalJob && apiOrigin(jobOrigin) !== apiOrigin(connection.origin)) {
    notice('notice', 'Connect to this workspace to save its job details.', true);
    return;
  }

  const resumeMatch = await matching;
  if (number !== refreshNumber || busy || selected?.id !== resumeForMatch?.id) return;
  // REMOVED automatic saving of external jobs
  renderJob(job, !!currentForm, !!job && lastCapture?.jobUrl === job.jobUrl && lastCapture.ownerId === connection?.user.id);
}

function scheduleRefresh(delay = 250) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (refreshing) {
      scheduleRefresh(500);
      return;
    }
    refreshing = true;
    try { await refresh(); } catch (error) { notice('notice', error.message, true); }
    finally { refreshing = false; }
  }, delay);
}

function renderResults(result) {
  $('results').hidden = false;
  $('results').dataset.empty = String(!result.filled.length);
  $('verified').hidden = !result.filled.length;
  $('results-title').textContent = `Filled ${result.filled.length} out of ${result.total} fields`;
  $('results-summary').textContent = result.filled.length === result.total
    ? 'All application details were populated from your candidate profile.'
    : 'Review the populated details below and complete the remaining unfilled fields before submitting.';

  // Filled section
  const filledCount = result.filled.length;
  if ($('filled-count')) $('filled-count').textContent = String(filledCount);
  $('fields-filled').hidden = !filledCount;
  if ($('filled-section')) $('filled-section').hidden = !filledCount;
  $('fields-filled').replaceChildren(...result.filled.map(field => {
    const item = document.createElement('li');
    item.className = 'filled-item';
    const label = document.createElement('strong');
    label.textContent = field.label + (field.ai ? ' (AI draft)' : field.learned ? ' (Saved answer)' : '');
    item.append(label, document.createTextNode(' — ' + field.value));
    return item;
  }));

  // Unfilled section
  const unfilledList = (result.unfilled && result.unfilled.length)
    ? result.unfilled
    : (result.questions || []).map(q => ({ label: q.label || q.id, reason: 'Missing in candidate details' }));
  const unfilledCount = unfilledList.length;
  if ($('unfilled-count')) $('unfilled-count').textContent = String(unfilledCount);
  if ($('fields-unfilled')) {
    $('fields-unfilled').hidden = !unfilledCount;
    $('fields-unfilled').replaceChildren(...unfilledList.map(field => {
      const item = document.createElement('li');
      item.className = 'unfilled-item';
      const label = document.createElement('strong');
      label.textContent = field.label;
      const reasonText = field.reason ? ` — ${field.reason}` : ' — Needs manual answer';
      item.append(label, document.createTextNode(reasonText));
      return item;
    }));
  }
  if ($('unfilled-section')) $('unfilled-section').hidden = !unfilledCount;
}

$('zip-code-input').addEventListener('change', async () => {
  if (!candidate) return;
  candidate.zip_code = $('zip-code-input').value;
  await chrome.storage.local.set({ candidateProfile: candidate });
  scheduleRefresh(0);
});

$('connect').addEventListener('click', async () => {
  if (pairing) return;
  const origin = apiOrigin(workspaceUrl(currentTab?.url) || connection?.origin || portalOrigin);
  if (apiOrigin(connection?.origin) === origin) {
    await chrome.tabs.create({ url: new URL('/auth/jobseeker', origin).href });
    return;
  }
  pairing = true;
  $('connect').disabled = true;
  notice('notice', 'Checking your NextKinHR sign-in…');
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const workspaceTabs = tabs.filter(tab => workspaceUrl(tab.url) === origin && tab.id != null && tab.status === 'complete');
    const portalTab = workspaceTabs.find(tab => new URL(tab.url).pathname.startsWith('/dashboard')) || workspaceTabs[0];
    if (portalTab) {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: portalTab.id },
        func: async expectedOrigin => {
          if (location.origin !== expectedOrigin) return null;
          const response = await fetch('/api/extension/quick-pair', {
            method: 'POST', credentials: 'same-origin', redirect: 'error',
            headers: { 'Content-Type': 'application/json' }, body: '{}',
            signal: AbortSignal.timeout(8000),
          });
          if (response.status === 401) return null;
          const data = await response.json();
          return response.ok ? data : { error: data.error || 'NextKinHR could not connect this account.' };
        },
        args: [origin],
      });
      if (result?.error) throw new Error(result.error);
      if (result?.user?.role === 'candidate' && result.user.id && /^[A-Za-z0-9_-]{20,128}$/.test(result.token || '')) {
        await chrome.storage.local.set({ origin, token: result.token, user: result.user });
        notice('notice', '');
        scheduleRefresh(0);
        return;
      }
    }
    await chrome.tabs.create({ url: new URL('/auth/jobseeker', origin).href });
    notice('notice', 'Sign in on the NextKinHR tab to connect.');
  } catch (error) {
    notice('notice', 'Connection failed: ' + error.message, true);
  } finally {
    pairing = false;
    $('connect').disabled = false;
  }
});
$('open-profile').addEventListener('click', async () => {
  if (connection) await chrome.tabs.create({ url: new URL('/dashboard/candidates', apiOrigin(connection.origin)).href });
});
$('change-resume').addEventListener('click', () => { $('resume-options').hidden = !$('resume-options').hidden; });
for (const id of ['first-upload', 'upload-resume']) {
  $(id).addEventListener('click', () => { $('upload-form').hidden = !$('upload-form').hidden; });
}
$('resume-select').addEventListener('change', async event => {
  if (!connection) return;
  const key = connection.origin + '|' + connection.user.id;
  selected = documents.find(doc => doc.id === event.target.value) || null;
  // If the selected resume belongs to a specific candidate, switch active candidate cleanly!
  if (selected?.candidate_id && allProfilesMap.has(selected.candidate_id)) {
    candidate = allProfilesMap.get(selected.candidate_id);
    await chrome.storage.local.set({
      activeCandidateId: selected.candidate_id,
      candidateProfile: candidate,
      resumeData: selected
    });
  }
  renderAccount();
  ++matchRequest;
  if (activeJob) renderMatch('Updating resume comparison…');
  await chrome.storage.local.set({ resumePreferences: { ...preferences, [key]: event.target.value } });
});
$('upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!connection || busy || !resumeEndpointAvailable) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const file = data.get('resume');
  if (!file?.size || file.size > 10 * 1024 * 1024) return notice('upload-status', 'Choose a PDF or DOCX up to 10 MiB.', true);
  if (candidate) data.set('candidateId', candidate.id);
  busy = true;
  $('autofill').disabled = true;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  notice('upload-status', 'Uploading resume…');
  try {
    const key = connection.origin + '|' + connection.user.id;
    const result = await api('resume', { method: 'POST', body: data });
    await chrome.storage.local.set({ resumePreferences: { ...preferences, [key]: result.documentId } });
    form.reset();
    form.hidden = true;
    notice('upload-status', candidate ? 'Resume saved to NextKinHR.' : 'Resume saved. Autofill will be available after your profile is ready.');
  } catch (error) {
    notice('upload-status', error.message, true);
  } finally {
    submit.disabled = false;
    busy = false;
    scheduleRefresh(0);
  }
});
function answerScope(session, profile) {
  return 'reusableAnswers:' + JSON.stringify([apiOrigin(session.origin), session.user.id, profile.id]);
}

async function checkFormContext(tab, session) {
  const [[activeTab], auth] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.local.get(['origin', 'token']),
  ]);
  if (activeTab?.id !== tab.id || activeTab.url !== tab.url || auth.origin !== session.origin || auth.token !== session.token) {
    throw new Error('The active tab or account changed. Open the application and try again.');
  }
}

function formTarget(tab, frame) {
  return frame.documentId ? { tabId: tab.id, documentIds: [frame.documentId] }
    : { tabId: tab.id, frameIds: [frame.frameId] };
}

function answerText(value) {
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'boolean' ? (value ? 'Checked' : 'Unchecked') : value;
}

$('review-answers').addEventListener('click', async () => {
  if (busy || !currentForm || !candidate || !connection) return;
  const tab = currentTab;
  const frame = currentForm;
  const profile = candidate;
  const session = connection;
  try {
    await checkFormContext(tab, session);
    const [response] = await chrome.scripting.executeScript({
      target: formTarget(tab, frame),
      func: (url, profile) => {
        try { return globalThis.NextkinApplication.savedAnswers(url, profile); }
        catch (error) { return { error: error.message }; }
      },
      args: [frame.result.url, profile],
    });
    if (!Array.isArray(response?.result)) throw new Error(response?.result?.error || 'Could not read the form answers.');
    await checkFormContext(tab, session);
    answerReview = { tab, session, profile };
    $('answer-options').replaceChildren(...response.result.map(answer => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = answer.key;
      label.append(checkbox, document.createTextNode(answer.label + ' — ' + answerText(answer.value)));
      return label;
    }));
    answerReview.answers = response.result;
    $('answer-review').hidden = !response.result.length;
    if (!response.result.length) notice('notice', 'Answer a reusable question on this form first.');
  } catch (error) {
    notice('notice', error.message, true);
  }
});

$('save-answers').addEventListener('click', async () => {
  if (busy || !answerReview) return;
  const { tab, session, profile, answers } = answerReview;
  const keys = new Set([...$('answer-options').querySelectorAll('input:checked')].map(input => input.value));
  if (!keys.size) return notice('notice', 'Select at least one answer to save.');
  $('save-answers').disabled = true;
  try {
    await checkFormContext(tab, session);
    const scope = answerScope(session, profile);
    const storage = await chrome.storage.local.get(scope);
    const entries = new Map(Object.entries(storage[scope] || {}));
    for (const { key, type, value } of answers.filter(answer => keys.has(answer.key))) {
      entries.delete(key);
      entries.set(key, { type, value });
    }
    await chrome.storage.local.set({ [scope]: Object.fromEntries([...entries].slice(-200)) });
    $('answer-review').hidden = true;
    answerReview = null;
    notice('notice', `${keys.size} reusable answer${keys.size === 1 ? '' : 's'} saved in this browser.`);
  } catch (error) {
    notice('notice', error.message, true);
  } finally {
    $('save-answers').disabled = false;
  }
});

async function draftScreening(session, profile, tab, job, questions) {
  const sessionId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const jobTitle = job?.title || tab?.title?.split(/[-|–]/)[0]?.trim() || 'Role';
  const companyName = job?.company || 'Company';
  const jobDescription = job?.description?.trim() || `${jobTitle} at ${companyName}`;
  try {
    let result = await api('answer-drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId, requestId, consent: true, candidateId: profile.id,
        jobTitle, companyName, jobDescription, jobUrl: job?.jobUrl || tab?.url || '', questions,
      }),
    }, session);
    for (let attempt = 0; attempt < 12 && result?.status !== 'succeeded'; attempt++) {
      if (result?.sessionId !== sessionId || !result?.taskId) break;
      await new Promise(resolve => setTimeout(resolve, 1500));
      await checkFormContext(tab, session);
      result = await api('answer-drafts?taskId=' + encodeURIComponent(result.taskId), {}, session);
    }
    if (result?.status === 'succeeded' && result.answers && Object.keys(result.answers).length) {
      return result.answers;
    }
  } catch (err) {
    console.warn('[AI Screening]', err);
  }
  return {};
}

async function fillForm(tab, frame, profile, file, saved, aiAnswers) {
  const [filled] = await chrome.scripting.executeScript({
    target: formTarget(tab, frame),
    func: async (url, profile, resume, reusable, drafts) => {
      try { return await globalThis.NextkinApplication.fill(url, profile, resume, reusable, drafts); }
      catch (error) { return { error: error.message }; }
    },
    args: [frame.result.url, profile, file, saved, aiAnswers],
  });
  if (!filled?.result || filled.result.error) throw new Error(filled?.result?.error || 'Could not fill this form.');
  return filled.result;
}

$('autofill').addEventListener('click', async () => {
  if (busy || !currentForm || !candidate || !connection) return;
  const tab = currentTab;
  const frame = currentForm;
  const session = connection;
  const profile = candidate;
  // Ensure we have the latest job details
  const job = activeJob || (await scan(tab)).find(f => f.result?.job)?.result.job;
  const useAI = $('ai-screening').checked;
  
  if (!job) {
    notice('notice', 'Could not detect job details. Please ensure the job page is open.', true);
    busy = false;
    $('autofill').disabled = false;
    return;
  }
  
  busy = true;
  $('autofill').disabled = true;
  $('review-answers').disabled = true;
  $('answer-review').hidden = true;
  answerReview = null;
  $('results').hidden = true;
  notice('notice', 'Filling the application…');
  try {
    let file = null;
    if (selected) {
      try {
        const localResume = (await chrome.storage.local.get('resumeData'))?.resumeData;
        if (selected.id === 'dashboard-resume' && legacyResume?.file) {
          file = legacyResume.file;
        } else if (localResume && (selected.id === localResume.id || selected.filename === localResume.filename || selected.id === 'synced-resume')) {
          file = {
            filename: localResume.filename,
            base64: localResume.base64 || null,
            mimeType: localResume.mimeType || 'application/pdf',
            raw_text: localResume.raw_text || localResume.source_text || '',
            source: 'upload'
          };
        } else {
          file = await api('resume?documentId=' + encodeURIComponent(selected.id), {}, session);
        }
      } catch (error) {
        if (error.status === 401 || error.status === 403) throw error;
        notice('notice', 'Resume unavailable. Attach the file on the application page.', true);
      }
    }
    await checkFormContext(tab, session);
    const tracking = await chrome.runtime.sendMessage({
      action: 'prepare_application_tracking', tabId: tab.id, url: tab.url, job, candidateId: profile.id,
    }).catch(() => ({ error: 'Application tracking could not start.' }));
    await checkFormContext(tab, session);
    const scope = answerScope(session, profile);
    const storage = await chrome.storage.local.get(scope);
    const reusable = storage[scope] || {};
    const result = await fillForm(tab, frame, profile, file ?? null, reusable, useAI ? {} : null);
    renderResults(result);
    if (file || !selected) notice('notice', '');
    if (useAI && result.questions.length) {
      notice('notice', 'Drafting screening answers…');
      const drafts = await draftScreening(session, profile, tab, job, result.questions);
      await checkFormContext(tab, session);
      const completed = await fillForm(tab, frame, profile, null, reusable, drafts);
      const fields = new Map(result.filled.map(field => [field.key, field]));
      for (const field of completed.filled) fields.set(field.key, field);
      renderResults({ filled: [...fields.values()], total: completed.total });
      notice('notice', completed.filled.some(field => field.ai) ? 'Review the AI drafts before submitting.' : 'AI found no supported answers for the remaining questions.');
    }
    await api('save-external-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...job, applicationUrl: job.applicationUrl ?? undefined }),
    }, session);
    lastCapture = { ...job, ownerId: session.user.id };
    if (tracking?.error) notice('notice', tracking.error, true);
  } catch (error) {
    notice('notice', error.message, true);
  } finally {
    busy = false;
    scheduleRefresh(0);
  }
});

function clearResumeMatch() {
  answerReview = null;
  ++matchRequest;
  $('match-panel').hidden = true;
  renderMatch('');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'RESUME_SYNCED') {
    clearResumeMatch();
    scheduleRefresh(0);
    sendResponse?.({ success: true });
  }
});

chrome.tabs.onActivated.addListener(() => {
  clearResumeMatch();
  scheduleRefresh();
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (id === currentTab?.id && (change.url || change.status === 'complete')) {
    if (change.url) clearResumeMatch();
    scheduleRefresh();
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ['token', 'origin', 'resumePreferences', 'candidateProfile', 'resumeData', 'user'].some(key => key in changes)) {
    if ('token' in changes || 'origin' in changes || 'candidateProfile' in changes || 'resumeData' in changes) clearResumeMatch();
    scheduleRefresh(0);
  }
});
window.addEventListener('focus', () => scheduleRefresh());
setInterval(() => {
  if (document.visibilityState === 'visible') scheduleRefresh(0);
}, 6000);
scheduleRefresh(0);
