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
let armedOutsideForm;
let legacyResume;
let resumeEndpointAvailable = false;
let portalCaptureSupport;
let activeJob;
let lastResumeMatch;
let matchRequest = 0;
let answerReview;
let startedApplication;
let pendingAppliedPrompt;

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
    ? (resumeEndpointAvailable ? 'Upload a PDF or DOCX here to attach it to applications.' : 'Resume files are unavailable.')
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
  $('autofill').disabled = busy || !currentForm || !candidate;
  $('auto-submit-option').hidden = !currentForm || !candidate || currentForm.frameId !== 0;
  $('ai-screening-option').hidden = !currentForm || !candidate;
  $('review-answers').hidden = !currentForm || !candidate;
  $('review-answers').disabled = busy;
}

function renderJob(job, form, saved) {
  const workspace = !!workspaceUrl(currentTab?.url);
  const host = /^https?:/.test(currentTab?.url || '') ? new URL(currentTab.url).hostname : '';
  $('site-label').textContent = workspace ? 'NextKinHR Workspace' : host || 'Current tab';
  $('active-site').hidden = !host;
  $('site-title').textContent = job?.title || (workspace ? 'My Profile and Applications' : host ? 'Career Portal' : 'Recruiting Copilot');
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
    return chrome.scripting.executeScript({
      target: scope,
      func: () => {
        const application = globalThis.NextkinApplication;
        if (!application) return null;
        return { ...application.scan(), answered: application.hasAnswers() };
      },
    });
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

async function getStoredCredentials() {
  const session = await chrome.storage.session.get(['token', 'origin']).catch(() => ({}));
  const local = await chrome.storage.local.get(['origin', 'token', 'user', 'resumePreferences', 'activeCandidateId']);
  return {
    origin: session.origin || local.origin,
    token: session.token || local.token,
    user: local.user,
    resumePreferences: local.resumePreferences,
    activeCandidateId: local.activeCandidateId,
  };
}

function buildScopedProfile(candidate) {
  if (!candidate) return null;
  const facts = candidate.confirmed_facts || candidate;
  const allowedKeys = [
    'full_name', 'first_name', 'last_name', 'preferred_first_name',
    'email', 'phone', 'current_city', 'current_state', 'current_location',
    'zip_code', 'country', 'full_address', 'linkedin_url', 'github_url',
    'website', 'current_employer', 'current_title', 'total_experience_years',
    'primary_skills', 'authorized_in_usa', 'needs_sponsorship', 'open_to_relocation',
    'visa_status', 'work_authorization', 'summary', 'bio', 'gender', 'race',
    'veteran', 'veteran_status', 'disability', 'disability_status', 'availability',
    'salary_expectation', 'highest_education', 'school', 'graduation_year',
    'preferred_work_type', 'saved_answers', 'highest_qualification'
  ];
  const scopedFacts = {};
  for (const key of allowedKeys) {
    if (facts[key] !== undefined) scopedFacts[key] = facts[key];
    else if (candidate[key] !== undefined) scopedFacts[key] = candidate[key];
  }
  return {
    id: candidate.id,
    version: candidate.version,
    ...scopedFacts,
    confirmed_facts: scopedFacts,
  };
}

async function refresh() {
  if (busy) return;
  const number = ++refreshNumber;
  const [[tab], storage] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    getStoredCredentials(),
  ]);
  if (number !== refreshNumber || busy) return;
  const session = workspaceUrl(storage.origin) && storage.token && storage.user?.id ? storage : null;
  const pageKey = [tab?.id, tab?.url, session?.origin, session?.user.id].join('|');
  const pageChanged = pageKey !== resultsPage;
  if (pageChanged) {
    $('auto-submit').checked = false;
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
      api('candidates?savedOnly=true', {}, session),
      api('resume', {}, session),
    ]);
    const profileError = profileResult.status === 'rejected' ? profileResult.reason : null;
    const resumeError = resumeResult.status === 'rejected' ? resumeResult.reason : null;
    account = profileResult.status === 'fulfilled' ? profileResult.value : null;
    if (authFailed(profileError) || authFailed(resumeError) || (account && account.actorId !== session.user.id)) {
      issue = 'Your NextKinHR connection could not be verified. Click Connect to pair again.';
      account = null;
      legacyResume = null;
    } else {
      authenticated = !!account || resumeResult.status === 'fulfilled';
      canUpload = resumeResult.status === 'fulfilled';
      resumeList = resumeResult.status === 'fulfilled' ? resumeResult.value.documents || [] : [];
      const profile = account?.candidates?.[0];
      const hasDocument = resumeList.some(doc => doc.status !== 'failed' && (!doc.candidate_id || doc.candidate_id === profile?.id));
      if (profile && !hasDocument && (profile.has_original_resume || recoverableResumeError(resumeError))) {
        try {
          resumeList = [...resumeList, ...await syncLegacyResume(session, profile)];
        } catch (error) {
          issue = 'Resume sync: ' + error.message;
        }
      } else {
        legacyResume = null;
      }
      if (profileError && !issue) issue = 'Candidate profile: ' + profileError.message;
      if (resumeError && !recoverableResumeError(resumeError) && !issue) issue = 'Resume sync: ' + resumeError.message;
    }
  } else {
    legacyResume = null;
  }
  const frames = await scans;
  if (number !== refreshNumber || busy) return;
  connection = authenticated ? session : null;
  resumeEndpointAvailable = canUpload;
  allProfilesMap.clear();
  for (const c of account?.candidates || []) {
    if (c?.id && c.provenance_status === 'confirmed' && c.confirmed_facts?.full_name &&
      !String(c.confirmed_facts.notes || '').startsWith('Profile created from an uploaded resume.')) {
      allProfilesMap.set(c.id, c);
    }
  }

  preferences = storage.resumePreferences || {};
  const preferenceKey = connection && connection.origin + '|' + connection.user.id;

  // Determine active candidate ID
  let activeCandId = storage.activeCandidateId || preferences?.[preferenceKey + '|candidate'] || null;
  if (!activeCandId && allProfilesMap.size > 0) {
    activeCandId = allProfilesMap.keys().next().value;
  }

  candidate = allProfilesMap.get(activeCandId) || allProfilesMap.values().next().value || null;

  documents = resumeList.filter(doc => doc?.id).map(doc => {
    const docCand = doc.candidate_id ? allProfilesMap.get(doc.candidate_id) : null;
    const candName = doc.candidate_name || docCand?.full_name || (candidate && doc.candidate_id === candidate.id ? candidate.full_name : '');
    return {
      ...doc,
      displayName: candName ? `${candName} — ${doc.filename}` : doc.filename
    };
  });

  const usable = documents.filter(doc => doc.status !== 'failed' && (!doc.candidate_id || doc.candidate_id === candidate?.id));
  selected = usable.find(doc => doc.id === preferences[preferenceKey]) ||
    usable.find(doc => doc.candidate_id === candidate?.id) || usable[0] || null;
  if (documents.some(doc => doc.id === preferences?.[preferenceKey] && doc.status === 'failed')) {
    notice('upload-status', 'Resume processing failed. Choose another PDF or DOCX.', true);
  }
  const ashbyFrame = tab?.url && new URL(tab.url).searchParams.has('ashby_jid')
    ? frames.find(frame => frame.result?.job && embeddedOutsideForm(tab, frame)) : undefined;
  currentForm = (ashbyFrame?.result.hasForm && ashbyFrame) ||
    frames.find(frame => frame.frameId === 0 && frame.result?.hasForm) ||
    frames.find(frame => frame.result?.hasForm && frame.result.job && embeddedOutsideForm(tab, frame)) ||
    frames.find(frame => frame.result?.hasForm) || null;
  const embeddedFrame = embeddedOutsideForm(tab, currentForm);
  let job = embeddedOutsideJob(embeddedFrame ? currentForm : ashbyFrame) ||
    frames.find(frame => frame.frameId === 0 && frame.result?.job)?.result.job ||
    frames.find(frame => frame.result?.job)?.result.job || null;
  if (!job && /^https?:/.test(tab?.url || '')) {
    job = await loadKekaPosting(tab.url).catch(() => null);
    if (number !== refreshNumber || busy) return;
  }
  activeJob = job;
  renderAccount();
  renderJob(job, !!currentForm, false);

  // Ported from freehire: an answered form that disappears is the signal to ask,
  // not to assume. Receipt pages are unreliable (SPA modals, iframes, odd wording),
  // so the candidate confirms and we record the application ourselves.
  if (startedApplication && startedApplication.tabId !== tab?.id) {
    startedApplication = null;
    pendingAppliedPrompt = null;
  }
  if (job && candidate?.id && outsideApplicationPage(tab?.url || '')) {
    const answered = frames.some(frame => frame.result?.answered && frame.result?.job);
    if (currentForm && answered) {
      startedApplication = { job, tabId: tab.id, url: tab.url, candidateId: candidate.id };
      pendingAppliedPrompt = null;
    } else if (!currentForm && startedApplication) {
      pendingAppliedPrompt = startedApplication;
      startedApplication = null;
    } else if (currentForm && pendingAppliedPrompt) {
      pendingAppliedPrompt = null;
    }
  }
  renderAppliedPrompt();
  const resumeForMatch = selected;
  const matching = refreshResumeMatch(job, resumeForMatch, connection);
  if (issue) {
    notice('notice', issue, true);
    $('notice').dataset.accountSync = 'true';
  } else if ($('notice').dataset.accountSync === 'true') {
    notice('notice', '');
  }
  if (!connection || !job) return;
  if (currentForm?.result.job && candidate?.id && outsideApplicationPage(tab.url) &&
    (embeddedFrame || currentForm.frameId === 0))
    armOutsideForm(tab, currentForm, embeddedFrame, candidate.id);
  else if (candidate?.id && ashbyFrame && /\/application\/?$/.test(new URL(ashbyFrame.result.url).pathname))
    armOutsideForm(tab, ashbyFrame, embeddedOutsideForm(tab, ashbyFrame), candidate.id, false);
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

function renderAppliedPrompt() {
  const section = $('applied-prompt');
  if (!section) return;
  section.hidden = !pendingAppliedPrompt || busy;
  if (!pendingAppliedPrompt) return;
  const job = pendingAppliedPrompt.job;
  $('applied-prompt-job').textContent = [job.title, job.company].filter(Boolean).join(' · ');
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
    label.textContent = field.label;
    item.append(label, document.createTextNode(' — ' + field.value));
    return item;
  }));

  // Unfilled section
  const unfilledList = result.unfilled || [];
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

$('connect').addEventListener('click', async () => {
  try {
    const stored = await chrome.storage.local.get('origin');
    const origin = apiOrigin(workspaceUrl(currentTab?.url) || workspaceUrl(stored.origin) || portalOrigin);
    const path = apiOrigin(connection?.origin) === origin ? '/auth/jobseeker' : '/auth/jobseeker/connected';
    await chrome.tabs.create({ url: new URL(path, origin).href });
  } catch (error) {
    notice('notice', 'Could not open NextKinHR: ' + error.message, true);
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
      activeCandidateId: selected.candidate_id
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
async function checkFormContext(tab, session) {
  const [[activeTab], auth] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    getStoredCredentials(),
  ]);
  if (activeTab?.id !== tab.id || activeTab.url !== tab.url || auth.origin !== session.origin || auth.token !== session.token) {
    throw new Error('The active tab or account changed. Open the application and try again.');
  }
}

function formTarget(tab, frame) {
  return frame.documentId ? { tabId: tab.id, documentIds: [frame.documentId] }
    : { tabId: tab.id, frameIds: [frame.frameId] };
}

function answerScope(session, profile) {
  return 'reusableAnswers:' + JSON.stringify([apiOrigin(session.origin), session.user.id, profile.id]);
}

async function reusableAnswers(session, profile) {
  const scope = answerScope(session, profile);
  const storage = await chrome.storage.local.get(scope);
  // Server-saved answers come from the profile; locally saved answers are newer.
  const server = profile?.confirmed_facts?.saved_answers || {};
  const merged = {};
  for (const [key, entry] of Object.entries(server)) {
    const value = entry && typeof entry === 'object' ? (entry.answer ?? entry.value) : entry;
    if (value === undefined || value === null || value === '') continue;
    merged[key] = { type: entry?.type || 'text', value };
  }
  return { ...merged, ...(storage[scope] || {}) };
}

function answerText(value) {
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'boolean' ? (value ? 'Checked' : 'Unchecked') : value;
}

async function draftScreening(session, profile, tab, job, questions) {
  if (!job || !job.description || job.description.trim().length < 40) {
    throw new Error('Open the complete job posting to draft screening answers.');
  }
  const sessionId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  let result = await api('answer-drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId, requestId, consent: true, candidateId: profile.id,
      jobTitle: job.title, companyName: job.company, jobDescription: job.description, jobUrl: job.jobUrl, questions,
    }),
  }, session);
  for (let attempt = 0; attempt < 25 && result.status !== 'succeeded'; attempt++) {
    if (result.sessionId !== sessionId || !result.taskId) throw new Error('NextKinHR returned an invalid screening task.');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await checkFormContext(tab, session);
    result = await api('answer-drafts?taskId=' + encodeURIComponent(result.taskId), {}, session);
  }
  if (result.sessionId !== sessionId || result.status !== 'succeeded') {
    throw new Error('AI drafts are still processing. Try again shortly.');
  }
  return result.answers || {};
}

function outsideApplicationPage(value) {
  return /^https:\/\//.test(value || '') && !workspaceUrl(value) &&
    !new URLSearchParams(new URL(value).hash.slice(1)).has('marketing-intent');
}

function embeddedOutsideForm(tab, frame) {
  if (!frame?.frameId || !frame.documentId || !outsideApplicationPage(tab?.url) || !outsideApplicationPage(frame.result?.url)) return undefined;
  const parent = new URL(tab.url);
  const url = new URL(frame.result.url);
  const id = parent.searchParams.get('ashby_jid');
  if (id && (url.origin !== 'https://jobs.ashbyhq.com' || url.pathname.split('/')[2]?.toLowerCase() !== id.toLowerCase())) return undefined;
  return { frameId: frame.frameId, documentId: frame.documentId, url: frame.result.url };
}

function embeddedOutsideJob(frame) {
  if (!frame?.result?.job) return null;
  const jobUrl = frame.result.url;
  const url = new URL(jobUrl);
  const ashbyId = url.origin === 'https://jobs.ashbyhq.com' ? url.pathname.split('/')[2] : null;
  return { ...frame.result.job, jobUrl, externalId: ashbyId || frame.result.job.externalId };
}

function armOutsideForm(tab, frame, embeddedFrame, candidateId, discover = true) {
  const scope = [tab.id, tab.url, frame.documentId, frame.result.url, candidateId, connection.token, discover].join('|');
  if (armedOutsideForm === scope) return;
  armedOutsideForm = scope;
  const job = embeddedFrame ? embeddedOutsideJob(frame) : frame.result.job;
  void chrome.runtime.sendMessage({ action: 'prepare_application_tracking', tabId: tab.id,
    url: tab.url, embeddedFrame, job, candidateId, discover }).then(result => {
    if (!result?.tracked && armedOutsideForm === scope) armedOutsideForm = null;
  }, () => { if (armedOutsideForm === scope) armedOutsideForm = null; });
}

async function fillForm(tab, frame, profile, file, documentId, saved = null, aiAnswers = null) {
  const scopedProfile = buildScopedProfile(profile);
  const [filled] = await chrome.scripting.executeScript({
    target: formTarget(tab, frame),
    func: async (url, profile, resume, documentId, reusable, drafts, continuation) => {
      try {
        return await globalThis.NextkinApplication.startAutofill(url, profile, resume, documentId, continuation, reusable, drafts);
      } catch (error) { return { error: error.message }; }
    },
    args: [frame.result.url, scopedProfile, file, documentId, saved, aiAnswers, false],
  });
  if (!filled?.result || filled.result.error) throw new Error(filled?.result?.error || 'Could not fill this form.');
  return filled.result;
}

$('autofill').addEventListener('click', async () => {
  if (busy || !currentForm || !candidate || !connection) return;
  const tab = currentTab;
  const frame = currentForm;
  const embeddedFrame = embeddedOutsideForm(tab, frame);
  const session = connection;
  const autoSubmit = frame.frameId === 0 && $('auto-submit').checked;
  const useAI = $('ai-screening').checked;
  $('auto-submit').checked = false;
  const cachedProfile = candidate;
  busy = true;
  $('autofill').disabled = true;
  $('review-answers').disabled = true;
  $('answer-review').hidden = true;
  answerReview = null;
  $('results').hidden = true;
  notice('notice', 'Filling the application…');
  try {
    const [freshProfile, job] = await Promise.all([
      api('candidates?' + new URLSearchParams({ candidateId: cachedProfile.id, savedOnly: 'true' }), {}, session)
        .then(data => data.candidates?.[0]),
      embeddedFrame ? embeddedOutsideJob(frame) : activeJob || scan(tab).then(frames => frames.find(frame => frame.result?.job)?.result.job),
    ]);
    if (freshProfile?.provenance_status !== 'confirmed' || !freshProfile.confirmed_facts?.full_name ||
      String(freshProfile.confirmed_facts.notes || '').startsWith('Profile created from an uploaded resume.')) {
      throw new Error('Save your candidate details in My Profile first.');
    }
    const profile = freshProfile;
    const reusable = await reusableAnswers(session, profile);
    let file = null;
    if (selected || profile.id) {
      try {
        if (selected?.id === 'dashboard-resume' && legacyResume?.file) {
          file = legacyResume.file;
        } else if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(selected?.id || '')) {
          file = await api('resume?documentId=' + encodeURIComponent(selected.id), {}, session);
        } else if (profile.id) {
          await syncLegacyResume(session, profile);
          file = legacyResume?.file ?? null;
        }
      } catch (error) {
        if (error.status === 401 || error.status === 403) throw error;
        notice('notice', 'Resume unavailable. Attach the file on the application page.', true);
      }
    }
    await checkFormContext(tab, session);
    const tracking = await chrome.runtime.sendMessage({
      action: 'prepare_application_tracking', tabId: tab.id, url: tab.url, embeddedFrame, job, candidateId: profile.id,
    }).catch(() => ({ error: 'Application tracking could not start.' }));
    await checkFormContext(tab, session);
    const documentId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(selected?.id || '') ? selected.id : null;
    const result = await fillForm(tab, frame, profile, file ?? null, documentId, reusable, useAI ? {} : null);
    renderResults(result);
    if (file || !selected) notice('notice', '');
    if (useAI && result.questions?.length) {
      notice('notice', 'Drafting screening answers…');
      const drafts = await draftScreening(session, profile, tab, job, result.questions);
      await checkFormContext(tab, session);
      const completed = await fillForm(tab, frame, profile, null, documentId, reusable, drafts);
      const fields = new Map(result.filled.map(field => [field.key, field]));
      for (const field of completed.filled) fields.set(field.key, field);
      renderResults({ filled: [...fields.values()], unfilled: completed.unfilled, total: completed.total });
      notice('notice', completed.filled.some(field => field.ai)
        ? 'Review the AI drafts before submitting.'
        : 'AI found no supported answers for the remaining questions.');
    }
    if (frame.frameId === 0 && !autoSubmit && !useAI) notice('notice', 'Use Next on the employer form to fill the following step.');
    if (job) {
      await api('save-external-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...job, jobUrl: tracking?.outsideJobUrl || job.jobUrl,
          candidateId: profile.id, applicationUrl: job.applicationUrl ?? undefined }),
      }, session);
      lastCapture = { ...job, ownerId: session.user.id };
    }
    if (!tracking?.tracked) notice('notice', tracking?.error || 'Application tracking is unavailable. Check your NextKinHR connection.', true);
    else if (autoSubmit) {
      await checkFormContext(tab, session);
      const [attempt] = await chrome.scripting.executeScript({
        target: formTarget(tab, frame),
        func: async url => {
          try { await globalThis.NextkinApplication.submitApplication(url); return {}; }
          catch (error) { return { error: error.message }; }
        },
        args: [frame.result.url],
      });
      if (!attempt?.result || attempt.result.error) throw new Error(attempt?.result?.error || 'Submit manually on the employer page.');
      notice('notice', 'Submission requested. Waiting for employer confirmation.');
    }
  } catch (error) {
    notice('notice', error.message, true);
  } finally {
    busy = false;
    renderAccount();
    scheduleRefresh(0);
  }
});

$('review-answers').addEventListener('click', async () => {
  if (busy || !currentForm || !candidate || !connection) return;
  const tab = currentTab;
  const frame = currentForm;
  const profile = candidate;
  const session = connection;
  busy = true;
  $('autofill').disabled = true;
  $('review-answers').disabled = true;
  $('answer-review').hidden = true;
  answerReview = null;
  try {
    await checkFormContext(tab, session);
    const [response] = await chrome.scripting.executeScript({
      target: formTarget(tab, frame),
      func: (url, current) => {
        try { return globalThis.NextkinApplication.savedAnswers(url, current); }
        catch (error) { return { error: error.message }; }
      },
      args: [frame.result.url, profile],
    });
    if (!Array.isArray(response?.result)) throw new Error(response?.result?.error || 'Could not read the form answers.');
    await checkFormContext(tab, session);
    answerReview = { tab, session, profile, answers: response.result };
    $('answer-options').replaceChildren(...response.result.map(answer => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = answer.key;
      checkbox.checked = true;
      label.append(checkbox, document.createTextNode(answer.label + ' — ' + answerText(answer.value)));
      return label;
    }));
    $('answer-review').hidden = !response.result.length;
    if (!response.result.length) notice('notice', 'Answer a reusable question on this form first.');
  } catch (error) {
    notice('notice', error.message, true);
  } finally {
    busy = false;
    renderAccount();
  }
});

$('save-answers').addEventListener('click', async () => {
  if (busy || !answerReview) return;
  const { tab, session, profile, answers } = answerReview;
  const keys = new Set([...$('answer-options').querySelectorAll('input:checked')].map(input => input.value));
  if (!keys.size) return notice('notice', 'Select at least one answer to save.');
  busy = true;
  $('save-answers').disabled = true;
  try {
    await checkFormContext(tab, session);
    const scope = answerScope(session, profile);
    const storage = await chrome.storage.local.get(scope);
    const entries = new Map(Object.entries(storage[scope] || {}));
    for (const answer of answers.filter(item => keys.has(item.key))) {
      entries.delete(answer.key);
      entries.set(answer.key, { type: answer.type, value: answer.value });
    }
    await chrome.storage.local.set({ [scope]: Object.fromEntries([...entries].slice(-200)) });
    $('answer-review').hidden = true;
    answerReview = null;
    notice('notice', `${keys.size} reusable answer${keys.size === 1 ? '' : 's'} saved for future applications.`);
  } catch (error) {
    notice('notice', error.message, true);
  } finally {
    busy = false;
    $('save-answers').disabled = false;
    renderAccount();
  }
});

$('not-applied').addEventListener('click', () => {
  pendingAppliedPrompt = null;
  renderAppliedPrompt();
  notice('notice', '');
});

$('mark-applied').addEventListener('click', async () => {
  const pending = pendingAppliedPrompt;
  if (!pending || !connection || busy) return;
  const job = pending.job;
  busy = true;
  $('mark-applied').disabled = true;
  notice('notice', 'Saving your application…');
  try {
    await api('auto-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: pending.candidateId,
        eventKey: crypto.randomUUID(),
        companyName: job.company,
        jobTitle: job.title,
        jobUrl: job.jobUrl || pending.url,
        confirmationUrl: pending.url,
        portalSource: job.portalSource,
        jobLocation: job.location,
        evidence: 'Candidate confirmed submission in the NextKinHR side panel.',
        manualAttestation: true,
      }),
    }, connection);
    pendingAppliedPrompt = null;
    startedApplication = null;
    renderAppliedPrompt();
    notice('notice', `✓ Marked as applied — ${job.title} is in your applications.`);
    chrome.runtime.sendMessage({ type: 'NEXTKIN_OUTSIDE_APPLICATION_SAVED' }).catch(() => {});
  } catch (error) {
    notice('notice', error.message, true);
  } finally {
    busy = false;
    $('mark-applied').disabled = false;
    renderAppliedPrompt();
  }
});

function clearResumeMatch() {
  ++matchRequest;
  $('match-panel').hidden = true;
  renderMatch('');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'NEXTKIN_PROFILE_SAVED') {
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
  if (area === 'local' && ['token', 'origin', 'resumePreferences', 'activeCandidateId', 'user'].some(key => key in changes)) {
    if ('token' in changes || 'origin' in changes || 'user' in changes) clearResumeMatch();
    scheduleRefresh(0);
  }
});
window.addEventListener('focus', () => scheduleRefresh());
setInterval(() => {
  if (document.visibilityState === 'visible') scheduleRefresh(0);
}, 6000);
scheduleRefresh(0);
