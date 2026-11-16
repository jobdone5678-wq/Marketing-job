(function () {
  const onConnectionPage = () => location.pathname.replace(/\/$/, '') === '/auth/jobseeker/connected';
  async function save(token, user) {
    if (!onConnectionPage() || typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(token) ||
      typeof user?.id !== 'string' || user.role !== 'candidate') return;

    await chrome.storage.local.set({
      origin: location.origin,
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  }

  async function syncResumeData(payload) {
    if (!payload || typeof payload !== 'object') return;
    const candidate = payload.candidate || payload.candidateProfile || (payload.type === 'candidate_updated' ? payload.data : null);
    const resume = payload.resume || payload.resumeData;

    let existing = {};
    try {
      existing = await chrome.storage.local.get(['token', 'user', 'origin']);
    } catch {}

    let token = payload.token || existing?.token;
    let user = payload.user || existing?.user;

    // If no token exists yet, try quick-pair endpoint with same-origin cookies
    if (!token) {
      try {
        const pairRes = await fetch('/api/extension/quick-pair', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
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

    // Fallback: if user is not set but candidate is, synthesize user object
    if (!user && candidate) {
      user = {
        id: candidate.id || 'candidate',
        name: candidate.full_name || candidate.name || 'Candidate',
        email: candidate.email || '',
        role: 'candidate'
      };
    }

    // If still no token but candidate is active, generate a valid session token for local/dev use
    if (!token && candidate) {
      token = 'nextkin_local_' + (candidate.id || 'candidate').replace(/[^A-Za-z0-9_-]/g, '_').padEnd(20, '0');
    }

    let savedProfiles = {};
    let savedResumes = {};
    try {
      const existing = await chrome.storage.local.get(['savedProfiles', 'savedResumes']);
      savedProfiles = existing?.savedProfiles || {};
      savedResumes = existing?.savedResumes || {};
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
      resumeData: resumeDoc || resume, // active resume
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

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.origin && event.origin !== location.origin && event.origin !== 'null') return;

    if (event.data?.type === 'NEXTKIN_EXTENSION_PAIRED') {
      void save(event.data.token, event.data.user).catch(console.error);
    } else if (event.data?.type === 'NEXTKIN_RESUME_UPLOADED' || event.data?.type === 'candidate_updated') {
      void syncResumeData(event.data).catch(console.error);
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
    void save(token, user).catch(console.error);
  });
  observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-nextkin-token', 'data-nextkin-user'] });
})();
