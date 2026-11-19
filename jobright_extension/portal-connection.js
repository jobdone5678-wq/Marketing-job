(function () {
  const onConnectionPage = () => location.pathname.replace(/\/$/, '') === '/auth/jobseeker/connected';
  let pendingSync = Promise.resolve();
  async function save(token, user) {
    if (!onConnectionPage() || typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(token) ||
      typeof user?.id !== 'string' || user.role !== 'candidate') return;

    await chrome.storage.local.set({
      origin: location.origin,
      token,
      user: { id: user.id, name: user.name, email: user.email },
      ...await clearPreviousAccount(user.id),
    });
  }

  async function clearPreviousAccount(userId) {
    const current = await chrome.storage.local.get(['origin', 'user']);
    if (current.origin === location.origin && current.user?.id === userId) return {};
    return { activeCandidateId: null, candidateProfile: null, resumeData: null, savedProfiles: {}, savedResumes: {} };
  }

  async function syncResumeData(payload) {
    if (!payload || typeof payload !== 'object') return;
    const candidate = payload.candidate || payload.candidateProfile || (payload.type === 'candidate_updated' ? payload.data : null);
    const resume = payload.resume || payload.resumeData;

    let existing = {};
    try {
      existing = await chrome.storage.local.get(['token', 'user', 'origin']);
    } catch {}

    let token = existing.origin === location.origin ? existing.token : null;
    let user = token ? existing.user : null;
    if (token && user?.id && candidate?.id && /^[a-f0-9-]{36}$/i.test(candidate.id)) {
      const params = new URLSearchParams({ candidateId: candidate.id });
      const response = await fetch('/api/extension/candidates?' + params, {
        headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if ([401, 403, 404].includes(response?.status)) token = null;
    }

    if (!token || !user?.id) {
      token = null;
      user = null;
      try {
        const pairRes = await fetch('/api/extension/quick-pair', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(8000),
        });
        if (pairRes.ok) {
          const pairData = await pairRes.json();
          if (pairData.token) {
            token = pairData.token;
            if (pairData.user) user = pairData.user;
          }
        }
      } catch {}
    }

    if (!token || !user?.id) return;

    let savedProfiles = {};
    let savedResumes = {};
    let active = {};
    try {
      if (existing.origin === location.origin && existing.user?.id === user.id) {
        active = await chrome.storage.local.get(['savedProfiles', 'savedResumes', 'resumeData', 'activeCandidateId']);
        savedProfiles = active.savedProfiles || {};
        savedResumes = active.savedResumes || {};
      }
    } catch {}

    const candId = candidate?.id || (candidate?.email ? candidate.email.toLowerCase() : 'cand_' + Date.now());
    if (candidate) {
      if (!candidate.id) candidate.id = candId;
      const facts = candidate.confirmed_facts || {};
      candidate.gender = candidate.gender || facts.gender || '';
      candidate.race = candidate.race || facts.race || candidate.race_ethnicity || facts.race_ethnicity || '';
      candidate.race_ethnicity = candidate.race_ethnicity || facts.race_ethnicity || candidate.race || facts.race || '';
      candidate.veteran = candidate.veteran || facts.veteran || candidate.veteran_status || facts.veteran_status || '';
      candidate.veteran_status = candidate.veteran_status || facts.veteran_status || candidate.veteran || facts.veteran || '';
      candidate.disability = candidate.disability || facts.disability || candidate.disability_status || facts.disability_status || '';
      candidate.disability_status = candidate.disability_status || facts.disability_status || candidate.disability || facts.disability || '';
      candidate.work_authorization = candidate.work_authorization || facts.work_authorization || candidate.visa_status || facts.visa_status || '';
      candidate.visa_status = candidate.visa_status || facts.visa_status || candidate.work_authorization || facts.work_authorization || '';
      candidate.linkedin_url = candidate.linkedin_url || facts.linkedin_url || '';
      candidate.location = candidate.location || [candidate.current_city || facts.current_city, candidate.current_state || facts.current_state].filter(Boolean).join(', ') || candidate.full_address || facts.full_address || '';
      savedProfiles[candId] = candidate;
    }

    let resumeDoc = null;
    if (resume) {
      const docId = resume.id || ('doc_' + candId);
      resumeDoc = {
        ...resume,
        id: docId,
        candidate_id: candId,
        candidate_name: candidate?.full_name || '',
        filename: resume.filename || `${candidate?.full_name || 'Candidate'}_Resume.pdf`,
        status: 'confirmed',
        raw_text: resume.raw_text || resume.source_text || ''
      };
      savedResumes[docId] = resumeDoc;
    }

    const toStore = {
      origin: location.origin,
      activeCandidateId: candId,
      candidateProfile: candidate, // active candidate profile
      resumeData: resumeDoc || (active.activeCandidateId === candId ? active.resumeData ?? null : null),
      savedProfiles, // all candidates preserved individually without wiping
      savedResumes, // all resumes preserved individually without wiping
      ...(token ? { token } : {}),
      ...(user ? { user } : {})
    };

    await chrome.storage.local.set(toStore);

    const messageData = {
      candidateProfile: candidate,
      resumeData: resume,
      token,
      user,
      origin: location.origin
    };

    try {
      chrome.runtime.sendMessage({ type: 'RESUME_SYNCED', data: messageData }, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
  }

  chrome.runtime.onMessage?.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && message?.type === 'NEXTKIN_OUTSIDE_APPLICATION_SAVED')
      window.postMessage({ type: message.type }, location.origin);
  });

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.origin && event.origin !== location.origin && event.origin !== 'null') return;

    if (event.data?.type === 'NEXTKIN_EXTENSION_PAIRED') {
      pendingSync = pendingSync.then(() => save(event.data.token, event.data.user)).catch(console.error);
    } else if (event.data?.type === 'NEXTKIN_RESUME_UPLOADED' || event.data?.type === 'candidate_updated') {
      pendingSync = pendingSync.then(() => syncResumeData(event.data)).catch(console.error);
    }
  });

  // The deployed sign-in page also publishes the pairing result in DOM attributes.
  const observer = new MutationObserver(() => {
    if (!onConnectionPage()) return;
    const root = document.documentElement;
    const token = root?.getAttribute('data-nextkin-token');
    if (!token) return;
    let user;
    try { user = JSON.parse(root.getAttribute('data-nextkin-user')); } catch { return; }
    pendingSync = pendingSync.then(() => save(token, user)).catch(console.error);
  });
  observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-nextkin-token', 'data-nextkin-user'] });
})();
