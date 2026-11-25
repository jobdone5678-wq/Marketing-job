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
  current_location: 'Current location',
  visa_status: 'Visa status',
  work_authorization: 'Work authorization',
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
let pendingAiSettingsRefresh = false;
let aiScreeningUserToggled = false;
let lastScreeningWarnings = [];
const DOB_SESSION_KEY = 'nextkinCandidateDobOverrides';
let candidateDobOverride = null;

function candidateDobKey(session = connection, profile = candidate) {
  return session?.origin && session.user?.id && profile?.id
    ? [session.origin, session.user.id, profile.id].join('|') : null;
}

function isoDate(value) {
  const raw = String(value || '').trim();
  const canonical = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const legacyUS = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!canonical && !legacyUS) return '';
  const [year, month, day] = canonical ? canonical.slice(1) : [legacyUS[3], legacyUS[1], legacyUS[2]];
  const date = new Date(Date.UTC(+year, +month - 1, +day));
  return +year >= 1900 && date.getUTCFullYear() === +year && date.getUTCMonth() + 1 === +month &&
    date.getUTCDate() === +day && date.getTime() <= Date.now()
    ? `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : '';
}

function effectiveDob(profile = candidate) {
  return isoDate(candidateDobOverride !== null ? candidateDobOverride :
    profile?.confirmed_facts?.date_of_birth || profile?.confirmed_facts?.dob ||
    profile?.date_of_birth || profile?.dob || profile?.birth_date);
}

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
  const onboardingView = $('onboarding-view');
  const authenticatedView = $('authenticated-view');
  if (onboardingView && authenticatedView) {
    onboardingView.hidden = connected;
    authenticatedView.hidden = !connected;
  }
  if (connected) {
    const forceReload = pendingAiSettingsRefresh;
    pendingAiSettingsRefresh = false;
    void loadAiSettings(forceReload);
  }
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
  $('candidate-dob').disabled = !candidate;
  $('candidate-dob').value = effectiveDob();
  $('dob-save-status').textContent = '';
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
  const session = await chrome.storage.session.get(['token', 'origin', 'accountId']).catch(() => ({}));
  const local = await chrome.storage.local.get(['origin', 'token', 'user', 'resumePreferences', 'activeCandidateId']);
  const paired = session.accountId && session.accountId === local.user?.id &&
    workspaceUrl(session.origin) === workspaceUrl(local.origin);
  return {
    origin: session.origin || local.origin,
    token: paired ? session.token : undefined,
    needsPairing: !paired && Boolean(session.token || local.token),
    user: paired ? local.user : undefined,
    resumePreferences: local.resumePreferences,
    activeCandidateId: local.activeCandidateId,
  };
}

function buildScopedProfile(candidate) {
  if (!candidate) return null;
  const facts = candidate.confirmed_facts || candidate;
  const allowedKeys = [
    'full_name', 'first_name', 'last_name', 'preferred_first_name',
    'email', 'phone', 'current_city', 'current_state', 'current_location', 'date_of_birth',
    'zip_code', 'country', 'full_address', 'linkedin_url', 'github_url', 'twitter_url', 'other_url',
    'website', 'portfolio_url', 'current_employer', 'current_title', 'current_job_title',
    'experience_years', 'total_experience_years', 'primary_skills', 'skills',
    'authorized_in_usa', 'needs_sponsorship', 'need_sponsorship_now',
    'need_sponsorship_future', 'open_to_relocation', 'relocation_preference', 'willing_to_relocate',
    'intended_work_country', 'employment_country', 'work_location_country',
    'visa_status', 'work_authorization', 'citizenship_status', 'summary', 'bio', 'gender',
    'race', 'race_ethnicity', 'veteran', 'veteran_status', 'disability', 'disability_status',
    'availability', 'salary_expectation', 'highest_education', 'school', 'graduation_year',
    'preferred_work_type', 'saved_answers', 'highest_qualification'
  ];
  const scopedFacts = {};
  for (const key of allowedKeys) {
    if (facts[key] !== undefined) scopedFacts[key] = facts[key];
    else if (candidate[key] !== undefined) scopedFacts[key] = candidate[key];
  }
  const dob = effectiveDob(candidate);
  if (dob) scopedFacts.date_of_birth = dob;
  else delete scopedFacts.date_of_birth;
  return {
    id: candidate.id,
    version: candidate.version,
    provenance_status: candidate.provenance_status || 'confirmed',
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
  let session = workspaceUrl(storage.origin) && storage.token && storage.user?.id ? storage : null;
  if (!session) {
    try {
      let targetTab = (tab?.url && workspaceUrl(tab.url)) ? tab : null;
      if (!targetTab) {
        const allTabs = await chrome.tabs.query({ currentWindow: true }).catch(() => []);
        targetTab = allTabs.find(t => t?.url && workspaceUrl(t.url)) || null;
      }
      if (targetTab?.id) {
        try {
          await chrome.tabs.sendMessage(targetTab.id, { type: 'NEXTKIN_TRIGGER_PAIR' });
        } catch {
          if (typeof chrome.scripting?.executeScript === 'function') {
            await chrome.scripting.executeScript({
              target: { tabId: targetTab.id },
              files: ['portal-connection.js'],
            }).catch(() => {});
            await new Promise(r => setTimeout(r, 200));
          }
        }
        const updatedStorage = await getStoredCredentials();
        if (workspaceUrl(updatedStorage.origin) && updatedStorage.token && updatedStorage.user?.id) {
          session = updatedStorage;
        }
      }
    } catch {}
  }
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
    aiSettingsLoaded = false;
    aiSettingsDirty = false;
    aiSettingsConfigVersion = 1;
    pendingAiSettingsRefresh = Boolean(session);
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.remove([
        'ai_api_key',
        'ai_provider_mode',
        'ai_provider_type',
        'ai_base_url',
        'ai_model_id',
      ]).catch(() => {});
    }
  }
  currentTab = tab;
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'NEXTKIN_SIDE_PANEL_STATE', isOpen: true }).catch(() => {});
  }
  const scans = scan(tab);
  let account;
  let resumeList = [];
  let issue = storage.needsPairing ? 'Click Connect to pair your NextKinHR account again.' : null;
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

  // DOB entered in the side panel is per account/candidate and only retained
  // in trusted, memory-backed session storage. It is never sent to AI drafts.
  const dobKey = candidateDobKey(connection, candidate);
  const dobState = await chrome.storage.session.get(DOB_SESSION_KEY).catch(() => ({}));
  if (number !== refreshNumber || busy) return;
  const dobOverrides = dobState[DOB_SESSION_KEY] || {};
  candidateDobOverride = dobKey && Object.hasOwn(dobOverrides, dobKey) ? dobOverrides[dobKey] : null;

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

async function renderTrackingStatus() {
  const panel = $('tracking-status-panel');
  if (!panel) return;

  try {
    const queueStatus = await chrome.runtime.sendMessage({ type: 'NEXTKIN_GET_SUBMISSION_QUEUE_STATUS' }).catch(() => null);
    const tabId = currentTab?.id;
    let context = null;
    if (tabId != null && typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
      const keys = ['application-intent:' + tabId, 'embedded-outside-application:' + tabId];
      const sessionData = await chrome.storage.session.get([...keys, 'origin', 'accountId', 'token']).catch(() => ({}));
      if (sessionData.token && sessionData.accountId) {
        context = keys.map(key => sessionData[key]).find(item =>
          item?.accountId === sessionData.accountId && item.workspace === workspaceUrl(sessionData.origin)) || null;
      }
    }

    const badge = $('tracking-badge');
    const msg = $('tracking-message');
    const retryBtn = $('retry-sync-btn');
    const conflictBtn = $('resolve-conflict-btn');
    const dismissBtn = $('dismiss-tracking-btn');

    retryBtn.hidden = true;
    conflictBtn.hidden = true;
    dismissBtn.hidden = true;

    if (queueStatus?.conflicts?.length > 0) {
      badge.className = 'badge badge-conflict';
      badge.textContent = 'CONFLICT_NEEDS_RESOLVE';
      msg.textContent = 'Synchronization needs review for an application receipt.';
      conflictBtn.hidden = false;
      dismissBtn.hidden = false;
      panel.hidden = false;
      return;
    }

    if (queueStatus?.pending?.length > 0) {
      const item = queueStatus.pending[0];
      if (item.syncStatus === 'SAVE_FAILED') {
        badge.className = 'badge badge-failed';
        badge.textContent = 'SAVE FAILED';
        msg.textContent = 'Could not save or sync this application receipt. Retry to recover it.';
        retryBtn.hidden = false;
      } else if (item.syncStatus === 'AUTH_REQUIRED') {
        badge.className = 'badge badge-auth-required';
        badge.textContent = 'AUTH_REQUIRED';
        msg.textContent = 'Authentication session expired. Please connect to NextKinHR to sync your application.';
        retryBtn.hidden = false;
      } else if (item.syncStatus === 'RETRY_PENDING') {
        badge.className = 'badge badge-retrying';
        badge.textContent = 'RETRYING';
        msg.textContent = `Sync retry in progress (attempt ${item.attempts || 1} of 8)…`;
        retryBtn.hidden = false;
      } else {
        badge.className = 'badge badge-queued';
        badge.textContent = 'QUEUED';
        msg.textContent = 'Application receipt saved locally. Syncing to your NextKinHR dashboard…';
        retryBtn.hidden = false;
      }
      panel.hidden = false;
      return;
    }

    if (queueStatus?.deadLetter?.length > 0) {
      const item = queueStatus.deadLetter[0];
      badge.className = 'badge badge-failed';
      badge.textContent = 'FAILED';
      msg.textContent = `Synchronization failed: ${item.syncStatus || 'Validation error'}.`;
      retryBtn.hidden = false;
      dismissBtn.hidden = false;
      panel.hidden = false;
      return;
    }

    if (queueStatus?.ownershipReviewCount > 0) {
      badge.className = 'badge badge-conflict';
      badge.textContent = 'REVIEW NEEDED';
      msg.textContent = 'Older application receipts are on hold because their accounts could not be verified.';
      panel.hidden = false;
      return;
    }

    if (context?.reported) {
      badge.className = 'badge badge-synced';
      badge.textContent = 'SYNCED';
      msg.textContent = 'Application confirmed by employer and recorded in NextKinHR.';
      panel.hidden = false;
      return;
    }

    if (context?.submissionEvidence) {
      badge.className = 'badge badge-submitted';
      badge.textContent = 'SUBMITTED';
      msg.textContent = 'Employer confirmation receipt verified.';
      panel.hidden = false;
      return;
    }

    panel.hidden = true;
  } catch {
    panel.hidden = true;
  }
}

function scheduleRefresh(delay = 250) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (refreshing) {
      scheduleRefresh(500);
      return;
    }
    refreshing = true;
    try {
      await refresh();
      void renderTrackingStatus();
    } catch (error) { notice('notice', error.message, true); }
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

$('onboarding-connect')?.addEventListener('click', async () => {
  try {
    const stored = await chrome.storage.local.get('origin');
    const origin = apiOrigin(workspaceUrl(currentTab?.url) || workspaceUrl(stored.origin) || portalOrigin);

    let targetTab = (currentTab?.url && workspaceUrl(currentTab.url)) ? currentTab : null;
    if (!targetTab) {
      const allTabs = await chrome.tabs.query({ currentWindow: true }).catch(() => []);
      targetTab = allTabs.find(t => t?.url && workspaceUrl(t.url)) || null;
    }
    if (targetTab?.id) {
      try {
        await chrome.tabs.sendMessage(targetTab.id, { type: 'NEXTKIN_TRIGGER_PAIR' });
      } catch {
        if (typeof chrome.scripting?.executeScript === 'function') {
          await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            files: ['portal-connection.js'],
          }).catch(() => {});
          await new Promise(r => setTimeout(r, 200));
        }
      }
      const fresh = await getStoredCredentials();
      if (fresh.token && fresh.user?.id) {
        scheduleRefresh(0);
        return;
      }
    }

    await chrome.tabs.create({ url: new URL('/auth/jobseeker', origin).href });
  } catch (error) {
    notice('notice', 'Could not open NextKinHR: ' + error.message, true);
  }
});
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
$('candidate-dob').addEventListener('change', async event => {
  const key = candidateDobKey();
  if (!key) return;
  const value = event.target.value;
  if (value && !isoDate(value)) {
    $('dob-save-status').textContent = 'Please enter a valid date of birth.';
    return;
  }
  try {
    const stored = await chrome.storage.session.get(DOB_SESSION_KEY);
    const overrides = { ...(stored[DOB_SESSION_KEY] || {}), [key]: value };
    await chrome.storage.session.set({ [DOB_SESSION_KEY]: overrides });
    if (key === candidateDobKey()) {
      candidateDobOverride = value;
      $('dob-save-status').textContent = value
        ? 'DOB ready for autofill during this browser session.'
        : 'DOB cleared for this browser session.';
    }
  } catch {
    $('dob-save-status').textContent = 'Could not save DOB for this session. Try again.';
  }
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
    // Never reuse another candidate's session-only DOB while switching profiles.
    candidateDobOverride = null;
    await chrome.storage.local.set({
      activeCandidateId: selected.candidate_id
    });
    const key = candidateDobKey();
    const stored = await chrome.storage.session.get(DOB_SESSION_KEY).catch(() => ({}));
    if (key === candidateDobKey()) {
      const overrides = stored[DOB_SESSION_KEY] || {};
      candidateDobOverride = key && Object.hasOwn(overrides, key) ? overrides[key] : null;
    }
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
async function checkFormContext(tab, session, candidateId) {
  const [[activeTab], auth] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    getStoredCredentials(),
  ]);
  if (activeTab?.id !== tab.id || activeTab.url !== tab.url || auth.origin !== session.origin ||
    auth.token !== session.token || (candidateId && candidate?.id !== candidateId)) {
    throw new Error('The active tab or account changed. Open the application and try again.');
  }
}

function formTarget(tab, frame) {
  return frame.documentId ? { tabId: tab.id, documentIds: [frame.documentId] }
    : { tabId: tab.id, frameIds: [frame.frameId] };
}

async function readScreeningFrame(tab, frame) {
  const [snapshot] = await chrome.scripting.executeScript({
    target: formTarget(tab, frame),
    func: () => {
      const scan = globalThis.NextkinApplication?.scan();
      return scan && { url: scan.url, jobKey: globalThis.NextkinFieldMapping.screeningJobKey(scan.job) };
    },
  });
  if (!snapshot?.result || snapshot.result.url !== frame.result.url ||
    (frame.documentId && snapshot.documentId !== frame.documentId)) {
    throw new Error('The application frame changed. Start autofill again.');
  }
  return snapshot.result;
}

async function checkScreeningContext(tab, session, candidateId, { frame, source, kekaDetails, jobKey, selection }) {
  await checkFormContext(tab, session, candidateId);
  const target = await readScreeningFrame(tab, frame);
  if (source) {
    const posting = source === frame ? target : await readScreeningFrame(tab, source);
    if (!jobKey || posting.jobKey !== jobKey) throw new Error('The job changed. Start autofill again.');
  } else if (!kekaDetails || NextkinJobCapture.kekaPosting(new URL(tab.url))?.details !== kekaDetails) {
    throw new Error('The job could not be verified. Enter the remaining answers manually.');
  }
  const auth = await getStoredCredentials();
  if ((auth.activeCandidateId ?? null) !== selection || auth.token !== session.token || auth.origin !== session.origin) {
    throw new Error('The selected candidate or account changed. Start autofill again.');
  }
}

async function postingForAutofill(tab, frame, embedded) {
  if (frame.result.job) return { job: embedded ? embeddedOutsideJob(frame) : frame.result.job, source: frame };
  const frames = await scan(tab);
  const source = frames.find(entry => entry.frameId === 0 && entry.result?.job) ||
    frames.find(entry => entry.result?.job);
  if (source) return { job: source.result.job, source };
  const kekaDetails = NextkinJobCapture.kekaPosting(new URL(tab.url))?.details;
  if (kekaDetails && activeJob?.jobUrl === kekaDetails) return { job: activeJob, kekaDetails };
  return { job: activeJob };
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

async function mapConcurrent(items, limit, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

const MARKETING_OPT_IN_REGEX = /(marketing|promotional|newsletter|sms|text message|job alert|future opportunit|talent network|third[- ]?party|partner)/i;
const SENSITIVE_MANUAL_REGEX = /\b(?:password|secret|bank\s*routing|routing\s*number|bank\s*account|credit.?card|ssn|social.?security|tax.?id|pin|otp)\b/i;
const PRIVATE_AI_BLOCK_REGEX = /\b(?:date\s*of\s*birth|birth\s*date|birthdate|d\.?\s*o\.?\s*b\.?|dob|captcha|signature)\b/i;
const STAGE_B_PRIVATE_REGEX = /birth|dob|medical|health|disability|ethnicity|race|gender|veteran|religion|consent|privacy|captcha|signature/i;
const OPEN_PROSE_REGEX = /\b(bio|biography|summary|about\s*(?:you|yourself)?|cover\s*letter|why\b|describe|explain|tell\s+us|motivat|interest(?:ed)?\s+in|excite|passion|proudest|accomplish|achievement|project|strength|weakness|challenge|additional\s+information|anything\s+else|share\s+with\s+us|statement|experience\s+with|background)\b/i;
const STAGE_B_CONSEQUENTIAL_FACTS = new Set([
  'authorized_in_usa', 'needs_sponsorship', 'visa_status', 'work_authorization', 'date_of_birth',
  'citizenship_status', 'gender', 'race', 'race_ethnicity', 'veteran', 'veteran_status', 'disability', 'disability_status',
]);
const NON_PROSE_FIELD_TYPES = new Set([
  'checkbox', 'checkbox-group', 'radio', 'choice', 'select', 'combobox', 'multi-select', 'multi-combobox',
]);

let aiModulesPromise = null;
async function defaultLoadAiModules() {
  if (!aiModulesPromise) {
    aiModulesPromise = Promise.all([
      import(chrome.runtime.getURL('core/ai-router.js')),
      import(chrome.runtime.getURL('core/ai/planner-bundle.js')),
    ]).then(([routerMod, bundleMod]) => ({
      AIRouter: routerMod.AIRouter,
      buildVerifiedFacts: bundleMod.buildVerifiedFacts,
      inferQuestionDescriptor: bundleMod.inferQuestionDescriptor,
    })).catch((err) => {
      aiModulesPromise = null;
      throw err;
    });
  }
  return aiModulesPromise;
}

function normalizeQuestionLabel(label) {
  return String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isMarketingOptInQuestion(q) {
  const label = String(q?.label || '');
  if (!label) return false;
  if (q?.type === 'checkbox' || q?.type === 'checkbox-group') {
    return MARKETING_OPT_IN_REGEX.test(label);
  }
  return /(opt[- ]?in|subscribe|receive|send me).*(marketing|promotional|newsletter|sms|job alert|future opportunit|talent network|third[- ]?party|partner)/i.test(label);
}

function isFatalAiError(err) {
  if (!err) return false;
  const status = err.status;
  if (status === 401 || status === 403 || status === 422 || status === 503) return true;
  return /authentication failed|api key is required|not configured|image generation model|\bHTTP (?:401|403|422|503)\b|\bunauthorized\b|\bplanner is disabled\b/i.test(err.message || '');
}

async function resolveActiveAiConfig(session) {
  let stored = {};
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      stored = await chrome.storage.session.get([
        'ai_provider_mode',
        'ai_provider_type',
        'ai_base_url',
        'ai_model_id',
        'ai_api_key',
      ]);
    }
  } catch {}

  let mode = stored?.ai_provider_mode || '';
  let provider = stored?.ai_provider_type || '';
  let baseUrl = stored?.ai_base_url || '';
  let modelId = stored?.ai_model_id || '';
  const apiKey = typeof stored?.ai_api_key === 'string' ? stored.ai_api_key.trim() : '';

  if (!mode) {
    const remote = await api('ai/settings', {}, session).catch((err) => {
      if (typeof authFailed === 'function' && authFailed(err)) throw err;
      return null;
    });
    if (remote) {
      mode = remote.mode || 'server';
      provider = remote.provider || 'server';
      baseUrl = remote.baseUrl || '';
      modelId = remote.modelId || '';
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.session) {
          await chrome.storage.session.set({
            ai_provider_mode: mode,
            ai_provider_type: provider,
            ai_base_url: baseUrl || null,
            ai_model_id: modelId || null,
          });
        }
      } catch {}
    } else {
      mode = 'server';
    }
  }

  const normalizedMode = mode === 'local' ? 'local_direct' : mode;
  if (normalizedMode === 'extension_byok' && !apiKey) {
    throw new Error(
      'Enter your API key in AI Provider Settings for Extension Direct BYOK (or switch to Portal Encrypted BYOK).',
    );
  }

  const defaultsMap = typeof AI_PROVIDER_DEFAULTS !== 'undefined' ? AI_PROVIDER_DEFAULTS : {};
  if (normalizedMode === 'local_direct') {
    const defaults = defaultsMap[provider] || defaultsMap.ollama || { baseUrl: 'http://localhost:11434/v1', modelId: 'llama3.2:latest' };
    baseUrl = baseUrl || defaults.baseUrl;
    modelId = modelId || defaults.modelId;
  } else if (normalizedMode === 'extension_byok') {
    const defaults = defaultsMap[provider] || defaultsMap.openai || { baseUrl: 'https://api.openai.com/v1', modelId: 'gpt-4o-mini' };
    baseUrl = baseUrl || defaults.baseUrl;
    modelId = modelId || defaults.modelId;
  }

  return {
    mode: normalizedMode,
    provider: provider || 'server',
    baseUrl,
    modelId,
    apiKey,
  };
}

function buildStageBPrompts(profile, job, q) {
  const cf = profile?.confirmed_facts || profile || {};
  const candName = cf.full_name || profile?.full_name || 'Applicant';
  const candTitle = cf.current_job_title || cf.current_title || profile?.current_job_title || job?.title || '';
  const rawSkills = cf.primary_skills ?? profile?.primary_skills ?? cf.skills ?? profile?.skills ?? '';
  const skillsStr = Array.isArray(rawSkills) ? rawSkills.join(', ') : String(rawSkills || '');
  const candSummary = cf.summary || cf.bio || profile?.summary || profile?.bio || '';
  const rawSnippet = profile?.raw_text || cf.raw_text || '';
  const resumeContext = typeof rawSnippet === 'string' && rawSnippet
    ? `Resume Highlights: ${rawSnippet.slice(0, 800)}`
    : '';

  const systemPrompt = `You are an expert career copilot. Write a concise, compelling, first-person ("I") answer (2-3 sentences, maximum 60 words) for a job application field.
Candidate: ${candName}${candTitle ? ` (${candTitle})` : ''}
${skillsStr ? `Key Skills: ${skillsStr}` : ''}
${candSummary ? `Candidate Summary: ${candSummary}` : ''}
${resumeContext}
Target Role: ${job?.title || 'Role'} at ${job?.company || 'Target Company'}.
Strict Rules:
- Write strictly in first person ("I", "my") as the candidate.
- Highlight specific real skills and experience from the candidate's profile.
- Do NOT include quotation marks, markdown headings, or bullet points.
- Keep the response under 60 words, direct and natural.`;

  const userPrompt = `Write a professional response for application field: "${q.label}"`;
  return { systemPrompt, userPrompt };
}

async function readDeferredComboboxOptions(tab, scope, fieldId, label, matchIndex, fallbackOptions) {
  let liveOptions = [];
  if (tab?.id != null && scope?.frame && typeof chrome !== 'undefined' && chrome.scripting?.executeScript) {
    try {
      const [probe] = await chrome.scripting.executeScript({
        target: formTarget(tab, scope.frame),
        func: async ({ fieldId: targetFieldId, label: targetLabel, matchIndex: idx }) => {
          const formsApi = globalThis.NextkinForms;
          const writer = globalThis.NextkinFieldWriter;
          if (!formsApi?.discoverFields || !writer?.readChoices) return [];
          const fields = formsApi.discoverFields();
          const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
          const targetNorm = norm(targetLabel);
          let field = targetFieldId
            ? fields.find(
                (f) =>
                  f.id === targetFieldId ||
                  f.name === targetFieldId ||
                  f.key === targetFieldId ||
                  f.element?.id === targetFieldId ||
                  f.element?.name === targetFieldId,
              )
            : null;
          if (!field) {
            const comboMatches = fields.filter(
              (f) => (f.kind === 'combobox' || f.kind === 'multi-combobox') && norm(f.label || f.hint) === targetNorm,
            );
            field = comboMatches[idx] || comboMatches[0] || null;
          }
          if (!field) {
            const anyMatches = fields.filter((f) => norm(f.label || f.hint) === targetNorm);
            field = anyMatches[idx] || anyMatches[0] || null;
          }
          if (!field) return [];
          const raw = await writer.readChoices(field, () => true);
          return (Array.isArray(raw) ? raw : [])
            .map((o) => (typeof o === 'string' ? o : (o?.label ?? o?.value ?? '')))
            .map((s) => String(s).trim())
            .filter(Boolean);
        },
        args: [{ fieldId, label, matchIndex }],
      });
      if (Array.isArray(probe?.result)) {
        liveOptions = [...new Set(probe.result.map((o) => String(o).trim()).filter(Boolean))];
      }
    } catch {}
  }
  if (!liveOptions.length && Array.isArray(fallbackOptions) && fallbackOptions.length) {
    liveOptions = [...new Set(fallbackOptions.map((o) => String(o).trim()).filter(Boolean))];
  }
  return liveOptions;
}

async function draftScreening(session, profile, tab, job, questions, scope, reusable = null, questionMeta = null) {
  lastScreeningWarnings = [];
  const eligible = (questions || []).filter((q) => {
    if (!q || !q.label) return false;
    if (globalThis.NextkinFieldMapping?.isUrlField?.(q)) return false;
    const qid = q.id || q.label;
    const meta = questionMeta?.[qid];
    if (meta?.factKey === 'date_of_birth') return false;
    if (SENSITIVE_MANUAL_REGEX.test(q.label) || PRIVATE_AI_BLOCK_REGEX.test(q.label)) return false;
    if (isMarketingOptInQuestion(q)) return false;
    return true;
  });
  if (!eligible.length) return {};

  const aiConfig = await resolveActiveAiConfig(session);
  const { AIRouter, buildVerifiedFacts, inferQuestionDescriptor } = await (
    typeof loadAiModules === 'function' ? loadAiModules() : defaultLoadAiModules()
  );

  const router = new AIRouter({
    mode: aiConfig.mode,
    backendUrl: apiOrigin(session.origin),
    token: session.token,
    candidateId: profile.id,
    answerBank: reusable,
    config: {
      baseUrl: aiConfig.baseUrl || undefined,
      apiKey: aiConfig.apiKey || undefined,
      model: aiConfig.modelId || undefined,
    },
  });

  const facts = buildVerifiedFacts(profile, reusable);
  const planContext = {
    jobTitle: job?.title || '',
    company: job?.company || '',
    url: scope?.frame?.result?.url || job?.jobUrl || '',
  };

  const answers = Object.create(null);
  const errors = [];

  if (scope) await checkScreeningContext(tab, session, profile.id, scope);

  // Stage A: Structured Plan + Live Combobox Choose
  const planFields = eligible.map((q) => {
    const qid = q.id || q.label;
    const meta = questionMeta?.[qid] || {};
    return {
      id: meta.fieldId || qid,
      label: q.label,
      type: q.type || 'text',
      combo: typeof meta.combo === 'boolean' ? meta.combo : (q.type === 'combobox' || q.type === 'multi-combobox'),
      required: Boolean(meta.required),
      ...(Array.isArray(q.options) && q.options.length ? { options: q.options } : {}),
    };
  });

  let planRes = null;
  try {
    planRes = await router.plan(
      planFields,
      { facts, candidateId: profile.id, answerBank: reusable },
      planContext,
    );
  } catch (err) {
    errors.push(err instanceof Error ? err : new Error(String(err)));
    if (isFatalAiError(err)) {
      throw errors[0];
    }
  }

  if (planRes && Array.isArray(planRes.fills)) {
    for (const fill of planRes.fills) {
      if (!fill || fill.value === undefined || fill.value === null) continue;
      const val = String(fill.value).trim();
      if (!val) continue;

      let target = null;
      if (typeof fill.fieldId === 'string' && fill.fieldId.trim()) {
        target = eligible.find((q) => {
          const qid = q.id || q.label;
          if (Object.hasOwn(answers, qid)) return false;
          const fId = questionMeta?.[qid]?.fieldId || qid;
          return fId === fill.fieldId;
        });
      }
      if (!target && typeof fill.label === 'string') {
        const fillNorm = normalizeQuestionLabel(fill.label);
        target = eligible.find((q) => {
          const qid = q.id || q.label;
          return !Object.hasOwn(answers, qid) && normalizeQuestionLabel(q.label) === fillNorm;
        });
      }
      if (target) {
        answers[target.id || target.label] = val;
      }
    }
  }

  // Deferred combobox resolution via live DOM readChoices + AIRouter.choose
  const deferredItems = Array.isArray(planRes?.deferred) ? planRes.deferred : [];
  if (deferredItems.length > 0) {
    const processedDeferredQids = new Set();
    const labelMatchCounts = new Map();

    for (const deferredItem of deferredItems) {
      const defFieldId = typeof deferredItem === 'object' && deferredItem !== null
        ? (deferredItem.fieldId || deferredItem.id || '')
        : '';
      const defLabel = typeof deferredItem === 'object' && deferredItem !== null
        ? (deferredItem.label || '')
        : String(deferredItem || '');
      const defNorm = normalizeQuestionLabel(defLabel);

      while (true) {
        let target = null;
        if (defFieldId) {
          target = eligible.find((q) => {
            const qid = q.id || q.label;
            if (Object.hasOwn(answers, qid) || processedDeferredQids.has(qid)) return false;
            return (questionMeta?.[qid]?.fieldId || qid) === defFieldId;
          });
        }
        if (!target && defNorm) {
          target = eligible.find((q) => {
            const qid = q.id || q.label;
            if (Object.hasOwn(answers, qid) || processedDeferredQids.has(qid)) return false;
            const isCombo = Boolean(questionMeta?.[qid]?.combo) || q.type === 'combobox' || q.type === 'multi-combobox';
            return isCombo && normalizeQuestionLabel(q.label) === defNorm;
          }) || eligible.find((q) => {
            const qid = q.id || q.label;
            if (Object.hasOwn(answers, qid) || processedDeferredQids.has(qid)) return false;
            return normalizeQuestionLabel(q.label) === defNorm;
          });
        }
        if (!target) break;
        if (scope) await checkScreeningContext(tab, session, profile.id, scope);

        const targetQid = target.id || target.label;
        processedDeferredQids.add(targetQid);
        const targetMeta = questionMeta?.[targetQid] || {};
        const matchIndex = labelMatchCounts.get(defNorm) || 0;
        labelMatchCounts.set(defNorm, matchIndex + 1);

        const options = await readDeferredComboboxOptions(
          tab,
          scope,
          targetMeta.fieldId || targetQid,
          target.label,
          matchIndex,
          target.options,
        );
        if (options.length) {
          try {
            const chooseRes = await router.choose(
              {
                id: targetMeta.fieldId || targetQid,
                label: target.label,
                type: target.type || 'combobox',
                combo: true,
                required: Boolean(targetMeta.required),
              },
              options,
              { facts, candidateId: profile.id, answerBank: reusable },
              planContext,
            );
            if (chooseRes && typeof chooseRes.choice === 'string' && chooseRes.choice.trim()) {
              answers[targetQid] = chooseRes.choice.trim();
            }
          } catch (err) {
            errors.push(err instanceof Error ? err : new Error(String(err)));
            if (isFatalAiError(err) && !Object.keys(answers).length) {
              throw errors[0];
            }
          }
        }

        if (defFieldId) break;
      }
    }
  }

  // Stage B: Open-ended prose-only fallback for remaining eligible unanswered questions
  const consequentialSet = globalThis.NextkinFieldMapping?.CONSEQUENTIAL_FACTS || STAGE_B_CONSEQUENTIAL_FACTS;
  const stageBEligible = eligible.filter((q) => {
    const qid = q.id || q.label;
    if (Object.hasOwn(answers, qid)) return false;
    if (Array.isArray(q.options) && q.options.length > 0) return false;
    if (NON_PROSE_FIELD_TYPES.has(q.type)) return false;
    if (q.type !== 'textarea' && !OPEN_PROSE_REGEX.test(q.label)) return false;
    if (STAGE_B_PRIVATE_REGEX.test(q.label) || SENSITIVE_MANUAL_REGEX.test(q.label)) return false;
    if (isMarketingOptInQuestion(q)) return false;

    const meta = questionMeta?.[qid];
    if (meta?.factKey && (consequentialSet.has(meta.factKey) || meta.factKey === 'date_of_birth' || meta.factKey === 'consent' || meta.factKey === 'e_signature')) {
      return false;
    }

    const descriptor = inferQuestionDescriptor({ id: qid, label: q.label, type: q.type });
    if (descriptor.category !== '') return false;
    if (descriptor.canonical_name && consequentialSet.has(descriptor.canonical_name)) return false;
    return true;
  });

  if (stageBEligible.length > 0) {
    const isDirect = aiConfig.mode === 'extension_byok' || aiConfig.mode === 'local_direct';
    await mapConcurrent(stageBEligible, 3, async (q) => {
      if (scope) await checkScreeningContext(tab, session, profile.id, scope);
      const qid = q.id || q.label;
      try {
        if (isDirect) {
          const { systemPrompt, userPrompt } = buildStageBPrompts(profile, job, q);
          const result = await router.generateTextAnswer(systemPrompt, userPrompt);
          if (result?.ok && typeof result.answer === 'string' && result.answer.trim()) {
            answers[qid] = result.answer.trim();
          }
        } else {
          const result = await api('generate-answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: q.label,
              fieldLabel: q.label,
              fieldType: q.type,
              questionId: q.id,
              options: [],
              jobTitle: job?.title || '',
              companyName: job?.company || '',
              candidateId: profile.id,
            }),
          }, session);
          if (result?.ok && typeof result.answer === 'string' && result.answer.trim()) {
            answers[qid] = result.answer.trim();
          } else if (result?.error) {
            throw new Error(result.error);
          }
        }
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  if (scope) await checkScreeningContext(tab, session, profile.id, scope);

  if (!Object.keys(answers).length && errors.length > 0) {
    throw errors[0];
  }
  if (errors.length > 0) {
    lastScreeningWarnings = errors.map((e) => e.message).filter(Boolean);
  }

  return answers;
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

function aggregateAutofillResults(results) {
  if (!Array.isArray(results) || !results.length) {
    throw new Error('Could not fill this form.');
  }

  let firstError = null;
  const validOutputs = [];

  for (const item of results) {
    const res = (item && typeof item === 'object' && 'result' in item) ? item.result : item;
    if (res && typeof res === 'object') {
      if (res.error) {
        if (!firstError && typeof res.error === 'string') {
          firstError = res.error;
        }
      } else {
        validOutputs.push(res);
      }
    }
  }

  if (!validOutputs.length) {
    throw new Error(firstError || 'Could not fill this form.');
  }

  const filledMap = new Map();
  const unfilledMap = new Map();
  const questionsMap = new Map();
  const questionMeta = Object.create(null);
  const warnings = [];
  const unverified = [];
  let sumOfTotals = 0;

  for (const output of validOutputs) {
    if (typeof output.total === 'number') {
      sumOfTotals += output.total;
    }

    if (Array.isArray(output.filled)) {
      for (const item of output.filled) {
        if (!item) continue;
        const key = item.key || item.id || (item.label + ':' + item.value);
        if (!filledMap.has(key)) {
          filledMap.set(key, item);
        }
      }
    }

    if (Array.isArray(output.unfilled)) {
      for (const item of output.unfilled) {
        if (!item) continue;
        const key = item.key || item.id || item.label;
        if (!unfilledMap.has(key)) {
          unfilledMap.set(key, item);
        }
      }
    }

    if (Array.isArray(output.questions)) {
      for (const item of output.questions) {
        if (!item) continue;
        const key = item.key || item.id || item.label;
        if (!questionsMap.has(key)) {
          questionsMap.set(key, item);
        }
      }
    }

    if (output.questionMeta && typeof output.questionMeta === 'object') {
      for (const [metaKey, metaVal] of Object.entries(output.questionMeta)) {
        if (!Object.hasOwn(questionMeta, metaKey)) {
          questionMeta[metaKey] = metaVal;
        }
      }
    }

    if (Array.isArray(output.warnings)) {
      for (const w of output.warnings) {
        if (w && !warnings.includes(w)) warnings.push(w);
      }
    }

    if (Array.isArray(output.unverified)) {
      for (const u of output.unverified) {
        if (u && !unverified.includes(u)) unverified.push(u);
      }
    }
  }

  const filled = Array.from(filledMap.values());

  const filledKeys = new Set();
  for (const item of filled) {
    if (item.key) filledKeys.add(item.key);
    if (item.id) filledKeys.add(item.id);
    if (item.label) filledKeys.add(item.label);
  }

  const unfilled = [];
  for (const [key, item] of unfilledMap.entries()) {
    const itemKey = item.key || item.id || item.label;
    if (
      !filledKeys.has(key) &&
      !filledKeys.has(itemKey) &&
      !filled.some(f => (f.key && f.key === item.key) || (f.id && f.id === item.id) || (f.label && f.label === item.label))
    ) {
      unfilled.push(item);
    }
  }

  const questions = Array.from(questionsMap.values());
  const total = Math.max(sumOfTotals, filled.length + unfilled.length);

  return {
    filled,
    unfilled,
    questions,
    questionMeta,
    warnings,
    unverified,
    total,
  };
}

async function fillForm(tab, frame, profile, file, documentId, saved = null, aiAnswers = null, expectedJobKey = null) {
  const scopedProfile = buildScopedProfile(profile);
  const injectionResults = await chrome.scripting.executeScript({
    target: formTarget(tab, frame),
    func: async (url, profile, resume, documentId, reusable, drafts, jobKey) => {
      try {
        const engine = globalThis.NextkinApplication;
        if (jobKey && globalThis.NextkinFieldMapping.screeningJobKey(engine.scan().job) !== jobKey) {
          throw new Error('The job changed. Start autofill again.');
        }
        return await engine.startAutofill(url, profile, resume, documentId, false, reusable, drafts);
      } catch (error) { return { error: error.message }; }
    },
    args: [frame.result.url, scopedProfile, file, documentId, saved, aiAnswers, expectedJobKey],
  });
  return aggregateAutofillResults(injectionResults);
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
  lastScreeningWarnings = [];
  $('results').hidden = true;
  notice('notice', 'Filling the application…');
  try {
    const selection = (await getStoredCredentials()).activeCandidateId ?? null;
    if (selection && selection !== cachedProfile.id) throw new Error('The selected candidate changed. Start autofill again.');
    const [freshProfile, posting] = await Promise.all([
      api('candidates?' + new URLSearchParams({ candidateId: cachedProfile.id, savedOnly: 'true' }), {}, session)
        .then(data => data.candidates?.[0]),
      postingForAutofill(tab, frame, embeddedFrame),
    ]);
    const { job, source, kekaDetails } = posting;
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
      await chrome.scripting.executeScript({
        target: formTarget(tab, frame),
        func: (qIds) => {
          for (const id of qIds) {
            try {
              const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
              const el = document.querySelector(`[name="${escaped}"], #${escaped}`) || document.activeElement;
              if (el) el.classList.add('nextkin-field-loading');
            } catch {}
          }
        },
        args: [result.questions.map(q => result.questionMeta?.[q.id]?.fieldId || q.id).filter(Boolean)],
      }).catch(() => {});
      const jobKey = globalThis.NextkinFieldMapping.screeningJobKey(source?.result?.job);
      const scope = { frame, source, kekaDetails, selection, jobKey };
      let completed;
      try {
        const drafts = await draftScreening(session, profile, tab, job, result.questions, scope, reusable, result.questionMeta);
        await checkScreeningContext(tab, session, profile.id, scope);
        completed = await fillForm(tab, frame, profile, null, documentId, reusable, drafts, source === frame ? jobKey : null);
      } finally {
        await chrome.scripting.executeScript({
          target: formTarget(tab, frame),
          func: () => {
            document.querySelectorAll('.nextkin-field-loading').forEach(el => el.classList.remove('nextkin-field-loading'));
          },
        }).catch(() => {});
      }
      const fields = new Map(result.filled.map(field => [field.key, field]));
      for (const field of completed.filled) fields.set(field.key, field);
      renderResults({ filled: [...fields.values()], unfilled: completed.unfilled, total: completed.total });
      if (lastScreeningWarnings.length > 0) {
        notice('notice', `Partial AI drafts applied (${lastScreeningWarnings[0]})`, true);
      } else {
        notice('notice', completed.filled.some(field => field.ai)
          ? 'Review the AI drafts before submitting.'
          : 'AI found no supported answers for the remaining questions.');
      }
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
    if (!tracking?.tracked && !lastScreeningWarnings.length) notice('notice', tracking?.error || 'Application tracking is unavailable. Check your NextKinHR connection.', true);
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

async function saveSelectedAnswers(companyScoped = false) {
  if (busy || !answerReview) return;
  const { tab, session, profile, answers } = answerReview;
  const keys = new Set([...$('answer-options').querySelectorAll('input:checked')].map(input => input.value));
  if (!keys.size) return notice('notice', 'Select at least one answer to save.');
  busy = true;
  if ($('save-answers')) $('save-answers').disabled = true;
  if ($('save-answers-company')) $('save-answers-company').disabled = true;
  try {
    await checkFormContext(tab, session);
    const companyScope = companyScoped ? (activeJob?.company || activeJob?.companySlug || null) : null;
    const isSensitive = globalThis.NextkinAnswerBank?.isSensitiveQuestion || (() => false);

    const scope = answerScope(session, profile);
    const storage = await chrome.storage.local.get(scope);
    const entries = new Map(Object.entries(storage[scope] || {}));

    const selectedAnswers = answers.filter(item => keys.has(item.key) && !isSensitive(item.label || item.key));
    for (const answer of selectedAnswers) {
      entries.delete(answer.key);
      entries.set(answer.key, { type: answer.type, value: answer.value });

      if (session && profile?.id) {
        api('answer-bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: answer.label || answer.key,
            answer: answerText(answer.value),
            companyScope,
            candidateId: profile.id
          })
        }).catch(() => {});
      }
    }
    await chrome.storage.local.set({ [scope]: Object.fromEntries([...entries].slice(-200)) });
    $('answer-review').hidden = true;
    answerReview = null;
    const scopeLabel = companyScope ? ` for ${companyScope}` : ' for all jobs';
    notice('notice', `${selectedAnswers.length} reusable answer${selectedAnswers.length === 1 ? '' : 's'} saved${scopeLabel}.`);
  } catch (error) {
    notice('notice', error.message, true);
  } finally {
    busy = false;
    if ($('save-answers')) $('save-answers').disabled = false;
    if ($('save-answers-company')) $('save-answers-company').disabled = false;
    renderAccount();
  }
}

$('save-answers').addEventListener('click', () => saveSelectedAnswers(false));
if ($('save-answers-company')) {
  $('save-answers-company').addEventListener('click', () => saveSelectedAnswers(true));
}

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
    const isRetryable = error.status >= 500 || error.status === 429 || !error.status || /network|failed to fetch/i.test(error.message);
    if (isRetryable) {
      chrome.runtime.sendMessage({
        type: 'queue-submission',
        payload: {
          candidateId: pending.candidateId,
          eventKey: crypto.randomUUID(),
          companyName: job.company,
          jobTitle: job.title,
          jobUrl: job.jobUrl || pending.url,
          confirmationUrl: pending.url,
          portalSource: job.portalSource,
          jobLocation: job.location,
          evidence: 'Candidate confirmed submission in the NextKinHR side panel (queued).',
          manualAttestation: true,
        }
      }).catch(() => {});
      pendingAppliedPrompt = null;
      startedApplication = null;
      renderAppliedPrompt();
      notice('notice', `Application saved locally and queued for synchronization.`);
    } else {
      notice('notice', error.message, true);
    }
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
  if (message?.type === 'NEXTKIN_RECEIPT_SAVE_FAILED') void renderTrackingStatus();
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
  if (area === 'session' && ['token', 'origin', 'accountId'].some(key => key in changes)) {
    clearResumeMatch();
    scheduleRefresh(0);
  }
  if (['pending_submission_queue', 'submission_dead_letter_queue', 'conflict_submission_queue',
    'submission_queue_recovery', 'accountId'].some(key => key in changes)) void renderTrackingStatus();
  if (area === 'local' && ['token', 'origin', 'resumePreferences', 'activeCandidateId', 'user'].some(key => key in changes)) {
    if ('token' in changes || 'origin' in changes || 'user' in changes) clearResumeMatch();
    scheduleRefresh(0);
  }
});
$('retry-sync-btn')?.addEventListener('click', async () => {
  $('retry-sync-btn').disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'NEXTKIN_RETRY_SUBMISSION_QUEUE' });
  } finally {
    $('retry-sync-btn').disabled = false;
    void renderTrackingStatus();
  }
});

$('resolve-conflict-btn')?.addEventListener('click', async () => {
  $('resolve-conflict-btn').disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'NEXTKIN_CLEAR_CONFLICT_QUEUE' });
  } finally {
    $('resolve-conflict-btn').disabled = false;
    void renderTrackingStatus();
  }
});

$('dismiss-tracking-btn')?.addEventListener('click', async () => {
  $('dismiss-tracking-btn').disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'NEXTKIN_CLEAR_DEAD_LETTER_QUEUE' });
  } finally {
    $('dismiss-tracking-btn').disabled = false;
    void renderTrackingStatus();
  }
});

// AI Provider Settings Controller (syncs with /api/extension/ai/settings and /api/extension/ai/test-connection)
let aiSettingsConfigVersion = 1;
let aiSettingsLoaded = false;
let aiSettingsDirty = false;

const AI_PROVIDER_DEFAULTS = {
  server: { baseUrl: '', modelId: '' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', modelId: 'deepseek/deepseek-chat' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', modelId: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com/v1', modelId: 'gpt-4o-mini' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', modelId: 'llama-3.3-70b-versatile' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', modelId: 'mistral-small-latest' },
  ollama: { baseUrl: 'http://localhost:11434/v1', modelId: 'llama3.2:latest' },
  lm_studio: { baseUrl: 'http://localhost:1234/v1', modelId: 'local-model' },
  custom: { baseUrl: '', modelId: '' },
};

async function loadAiSettings(force = false) {
  if (!connection) return;
  // Never overwrite user inputs if user has modified fields or if already loaded and not forced
  if (!force && (aiSettingsDirty || aiSettingsLoaded)) return;
  const activeEl = document.activeElement;
  if (!force && activeEl && (activeEl.id?.startsWith('ai-') || activeEl.closest?.('.ai-settings-content'))) {
    return;
  }
  try {
    const data = await api('ai/settings', {}, connection);
    if (!data) return;
    aiSettingsConfigVersion = data.configVersion || 1;
    const mode = data.mode || 'server';
    const provider = data.provider || 'server';
    const baseUrl = data.baseUrl || '';
    const modelId = data.modelId || '';
    if ($('ai-mode-select')) $('ai-mode-select').value = mode;
    if ($('ai-provider-select')) $('ai-provider-select').value = provider;
    if ($('ai-base-url')) $('ai-base-url').value = baseUrl;
    if ($('ai-model-id')) $('ai-model-id').value = modelId;
    if ($('ai-api-key')) {
      $('ai-api-key').placeholder = data.maskedApiKey || (data.hasApiKey ? '••••••••' : 'sk-...');
    }
    aiSettingsLoaded = true;
    aiSettingsDirty = false;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        await chrome.storage.session.set({
          ai_provider_mode: mode,
          ai_provider_type: provider,
          ai_base_url: baseUrl || null,
          ai_model_id: modelId || null,
        });
      }
    } catch {}
  } catch {}
}

$('ai-mode-select')?.addEventListener('change', (e) => {
  aiSettingsDirty = true;
  const mode = e.target.value;
  const provEl = $('ai-provider-select');
  if (mode === 'server') {
    if (provEl) provEl.value = 'server';
    if ($('ai-base-url')) $('ai-base-url').value = '';
    if ($('ai-model-id')) $('ai-model-id').value = '';
  } else if (mode === 'portal_byok' || mode === 'extension_byok') {
    if (provEl && (provEl.value === 'server' || provEl.value === 'ollama' || provEl.value === 'lm_studio')) {
      provEl.value = 'openrouter';
      const defaults = AI_PROVIDER_DEFAULTS.openrouter;
      if (defaults.baseUrl && $('ai-base-url')) $('ai-base-url').value = defaults.baseUrl;
      if (defaults.modelId && $('ai-model-id')) $('ai-model-id').value = defaults.modelId;
    }
  } else if (mode === 'local') {
    if (provEl && provEl.value !== 'ollama' && provEl.value !== 'lm_studio') {
      provEl.value = 'ollama';
      const defaults = AI_PROVIDER_DEFAULTS.ollama;
      if (defaults.baseUrl && $('ai-base-url')) $('ai-base-url').value = defaults.baseUrl;
      if (defaults.modelId && $('ai-model-id')) $('ai-model-id').value = defaults.modelId;
    }
  }
});

$('ai-provider-select')?.addEventListener('change', (e) => {
  aiSettingsDirty = true;
  const prov = e.target.value;
  const defaults = AI_PROVIDER_DEFAULTS[prov];
  if (defaults) {
    if (defaults.baseUrl && $('ai-base-url')) $('ai-base-url').value = defaults.baseUrl;
    if (defaults.modelId && $('ai-model-id')) $('ai-model-id').value = defaults.modelId;
    if (prov === 'ollama' || prov === 'lm_studio') {
      if ($('ai-mode-select')) $('ai-mode-select').value = 'local';
    } else if (prov === 'server') {
      if ($('ai-mode-select')) $('ai-mode-select').value = 'server';
      if ($('ai-base-url')) $('ai-base-url').value = '';
      if ($('ai-model-id')) $('ai-model-id').value = '';
    } else {
      if ($('ai-mode-select') && ($('ai-mode-select').value === 'server' || $('ai-mode-select').value === 'local')) {
        $('ai-mode-select').value = 'portal_byok';
      }
    }
  }
});

['ai-base-url', 'ai-api-key', 'ai-model-id'].forEach((id) => {
  $(id)?.addEventListener('input', () => {
    aiSettingsDirty = true;
  });
});

$('ai-save-settings')?.addEventListener('click', async () => {
  if (!connection) return;
  const statusEl = $('ai-connection-status');
  if (statusEl) {
    statusEl.hidden = false;
    statusEl.textContent = 'Saving AI settings…';
    statusEl.style.color = 'inherit';
  }
  const mode = $('ai-mode-select')?.value || 'server';
  const provider = $('ai-provider-select')?.value || 'server';
  let baseUrl = $('ai-base-url')?.value?.trim() || null;
  let modelId = $('ai-model-id')?.value?.trim() || null;
  const keyInput = $('ai-api-key')?.value?.trim() || '';

  if (!baseUrl && AI_PROVIDER_DEFAULTS[provider]?.baseUrl) {
    baseUrl = AI_PROVIDER_DEFAULTS[provider].baseUrl;
  }
  if (!modelId && AI_PROVIDER_DEFAULTS[provider]?.modelId) {
    modelId = AI_PROVIDER_DEFAULTS[provider].modelId;
  }

  const payload = {
    mode,
    provider,
    baseUrl,
    modelId,
    configVersion: aiSettingsConfigVersion,
  };
  if (keyInput && mode !== 'extension_byok') payload.apiKey = keyInput;

  try {
    const res = await api('ai/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, connection);
    aiSettingsConfigVersion = res.configVersion || aiSettingsConfigVersion + 1;
    aiSettingsDirty = false;
    aiSettingsLoaded = true;
    if ($('ai-api-key')) {
      $('ai-api-key').value = '';
      if (keyInput) $('ai-api-key').placeholder = '••••••••';
    }
    let hasSessionKey = Boolean(keyInput);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        const sessionUpdate = {
          ai_provider_mode: mode,
          ai_provider_type: provider,
          ai_base_url: baseUrl,
          ai_model_id: modelId,
        };
        if (keyInput) {
          sessionUpdate.ai_api_key = keyInput;
        } else if (mode !== 'extension_byok') {
          await chrome.storage.session.remove('ai_api_key');
        } else {
          const existingSession = await chrome.storage.session.get('ai_api_key');
          hasSessionKey = Boolean(existingSession?.ai_api_key);
        }
        await chrome.storage.session.set(sessionUpdate);
      }
    } catch {}
    if (statusEl) {
      statusEl.textContent = mode === 'extension_byok' && !hasSessionKey
        ? '✓ AI settings saved. Enter your API key before autofilling in Extension Direct BYOK mode.'
        : '✓ AI settings saved.';
      statusEl.style.color = '#10b981';
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.style.color = '#ef4444';
    }
  }
});

$('ai-test-connection')?.addEventListener('click', async () => {
  if (!connection) return;
  const statusEl = $('ai-connection-status');
  if (statusEl) {
    statusEl.hidden = false;
    statusEl.textContent = 'Testing connection…';
    statusEl.style.color = 'inherit';
  }
  const provider = $('ai-provider-select')?.value || 'server';
  let baseUrl = $('ai-base-url')?.value?.trim() || '';
  if (!baseUrl && AI_PROVIDER_DEFAULTS[provider]?.baseUrl) {
    baseUrl = AI_PROVIDER_DEFAULTS[provider].baseUrl;
    if ($('ai-base-url')) $('ai-base-url').value = baseUrl;
  }
  const apiKey = $('ai-api-key')?.value?.trim() || '';
  let modelId = $('ai-model-id')?.value?.trim() || '';
  if (!modelId && AI_PROVIDER_DEFAULTS[provider]?.modelId) {
    modelId = AI_PROVIDER_DEFAULTS[provider].modelId;
    if ($('ai-model-id')) $('ai-model-id').value = modelId;
  }

  try {
    const res = await api('ai/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: baseUrl || undefined,
        apiKey: apiKey || undefined,
        modelId: modelId || undefined,
        provider,
      }),
    }, connection);
    if (statusEl) {
      statusEl.textContent = `✓ Connected successfully (${res.latencyMs ?? 0}ms)`;
      statusEl.style.color = '#10b981';
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Failed: ' + err.message;
      statusEl.style.color = '#ef4444';
    }
  }
});

$('ai-screening')?.addEventListener('change', (e) => {
  aiScreeningUserToggled = true;
  const enabled = Boolean(e.target?.checked);
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    void chrome.storage.local.set({ aiScreeningEnabled: enabled }).catch(() => {});
  }
});

if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  chrome.storage.local.get('aiScreeningEnabled').then((stored) => {
    const el = $('ai-screening');
    if (el && !aiScreeningUserToggled) {
      el.checked = stored?.aiScreeningEnabled !== false;
    }
  }).catch(() => {});
}

renderAccount();
window.addEventListener('focus', () => scheduleRefresh());
setInterval(() => {
  if (document.visibilityState === 'visible') scheduleRefresh(0);
}, 6000);
scheduleRefresh(0);

if (typeof globalThis !== 'undefined') {
  globalThis.aggregateAutofillResults = aggregateAutofillResults;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports.aggregateAutofillResults = aggregateAutofillResults;
}
