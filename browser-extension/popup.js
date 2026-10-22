// Nextkinlife Recruiting Copilot - Popup Controller
const connectedCard = document.getElementById('connected-card');
const disconnectedCard = document.getElementById('disconnected-card');
const userNameEl = document.getElementById('user-name');
const userEmailEl = document.getElementById('user-email');
const portalUrlEl = document.getElementById('portal-url');
const candidateCountEl = document.getElementById('candidate-count');
const originInput = document.getElementById('origin-input');
const codeInput = document.getElementById('code-input');
const toastEl = document.getElementById('toast');
const manualToggle = document.getElementById('toggle-manual');
const manualSection = document.getElementById('manual-section');
const toggleConnectPanel = document.getElementById('toggle-connect-panel');
const connectPanel = document.getElementById('connect-panel');

// Resume Upload Elements
const resumeDropzone = document.getElementById('resume-dropzone');
const resumeFileInput = document.getElementById('resume-file-input');
const candidateActiveCard = document.getElementById('candidate-active-card');
const resumeDropzoneWrap = document.getElementById('resume-dropzone-wrap');
const cvNameEl = document.getElementById('cv-name');
const cvTitleEl = document.getElementById('cv-title');
const cvContactEl = document.getElementById('cv-contact');
const cvLocationEl = document.getElementById('cv-location');
const cvFileEl = document.getElementById('cv-file');
const cvSkillsEl = document.getElementById('cv-skills');
const btnChangeResume = document.getElementById('btn-change-resume');
const btnRemoveResume = document.getElementById('btn-remove-resume');
const resumeModePill = document.getElementById('resume-mode-pill');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showToast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.style.color = isError ? '#f87171' : '#34d399';
  setTimeout(() => {
    toastEl.textContent = '';
  }, 5000);
}

// Client-Side Resume Text Extractor (PDF, DOCX, TXT, JSON)
async function extractTextFromFile(file) {
  return globalThis.NextkinResumeImport.extract(file);
}

// Convert File to Base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Process Uploaded Resume File
async function handleResumeUpload(file) {
  if (!file) return;
  showToast('📄 Reading & parsing ' + file.name + '...');

  try {
    const { text } = await extractTextFromFile(file);
    const candidate = globalThis.NextkinResume.candidateFromText(text,file.name);
    const previous = (await chrome.storage.local.get('uploadedCandidate')).uploadedCandidate;
    if (previous?.full_name === candidate.full_name && previous?.email === candidate.email) candidate.id = previous.id;
    candidate.resume_file = {filename:file.name,mimeType:file.type || 'application/octet-stream',base64:await fileToBase64(file)};

    // Save candidate locally
    const saved = await chrome.runtime.sendMessage({ type: 'save_uploaded_resume', candidate });
    if (saved?.error) throw new Error(saved.error);
    showToast(`✨ Active resume loaded for ${candidate.full_name}!`);
    await renderState();
  } catch (err) {
    console.error('Resume upload error:', err);
    showToast('Failed to parse resume: ' + err.message, true);
  }
}

// Render popup state
async function renderState() {
  const data = await chrome.storage.local.get(['origin', 'token', 'user', 'candidates', 'uploadedCandidate']);
  const isConnected = Boolean(data.token && data.user);
  const uploaded = data.uploadedCandidate;

  // 1. Resume / Candidate Card State
  if (uploaded && uploaded.full_name) {
    candidateActiveCard.style.display = 'block';
    resumeDropzoneWrap.style.display = 'none';

    cvNameEl.textContent = uploaded.full_name;
    cvTitleEl.textContent = uploaded.current_job_title || 'Uploaded candidate resume';
    cvContactEl.textContent = [uploaded.email, uploaded.phone].filter(Boolean).join(' · ') || 'No contact provided';
    cvLocationEl.textContent = [uploaded.current_city, uploaded.current_state].filter(Boolean).join(', ') || 'Location not supplied';
    cvFileEl.textContent = uploaded.resume_file?.filename ? `Source file: ${uploaded.resume_file.filename}` : 'Source details saved · Generate a DOCX on the job page';

    const skills = uploaded.all_skills || (uploaded.primary_skills ? uploaded.primary_skills.split(/[,;]/).map(s => s.trim()) : []);
    cvSkillsEl.replaceChildren();
    for (const skill of skills.slice(0,7)) {const chip = document.createElement('span');chip.className = 'skill-chip';chip.textContent = skill;cvSkillsEl.appendChild(chip);}
  } else {
    candidateActiveCard.style.display = 'none';
    resumeDropzoneWrap.style.display = 'block';
  }

  // 2. NextKinHR Portal Connection State
  if (isConnected) {
    connectedCard.style.display = 'block';
    disconnectedCard.style.display = 'none';
    resumeModePill.textContent = 'NextKinHR Connected';
    resumeModePill.style.color = '#34d399';
    resumeModePill.style.background = 'rgba(16, 185, 129, 0.15)';

    userNameEl.textContent = data.user.name || data.user.email;
    userEmailEl.textContent = data.user.email;
    portalUrlEl.textContent = data.origin || 'http://localhost:3000';
    candidateCountEl.textContent = String((data.candidates || []).length);

    try {
      const status = await chrome.runtime.sendMessage({ type: 'get_status' });
      document.getElementById('sync-status').textContent = status.manualReviewCount
        ? `${status.manualReviewCount} application update(s) need manual review in the portal.`
        : status.pendingCount
          ? `${status.pendingCount} application update(s) waiting to sync.`
          : 'Application updates synced to NextKinHR.';
    } catch {
      document.getElementById('sync-status').textContent = 'Sync status ready.';
    }
  } else {
    connectedCard.style.display = 'none';
    disconnectedCard.style.display = 'block';
    resumeModePill.textContent = uploaded ? 'Standalone Active' : 'Standalone Mode';
    resumeModePill.style.color = '#38bdf8';
    resumeModePill.style.background = 'rgba(56, 189, 248, 0.15)';

    if (data.origin) {
      originInput.value = data.origin;
    } else {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.url) {
          const u = new URL(activeTab.url);
          if (u.protocol.startsWith('http') && (u.pathname.includes('dashboard') || u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
            originInput.value = u.origin;
          }
        }
      } catch {}
    }
  }
}

// Dropzone & File Input Events
resumeDropzone.addEventListener('click', () => resumeFileInput.click());
btnChangeResume.addEventListener('click', () => resumeFileInput.click());

resumeFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleResumeUpload(e.target.files[0]);
  }
});

btnRemoveResume.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'clear_uploaded_resume' });
  showToast('Source resume removed. Saved job versions remain in history.');
  await renderState();
});

// Drag & Drop
resumeDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  resumeDropzone.classList.add('dragover');
});
resumeDropzone.addEventListener('dragleave', () => resumeDropzone.classList.remove('dragover'));
resumeDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  resumeDropzone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleResumeUpload(e.dataTransfer.files[0]);
  }
});

// Toggle Connect Portal Panel
toggleConnectPanel.addEventListener('click', () => {
  const current = connectPanel.style.display;
  connectPanel.style.display = current === 'block' ? 'none' : 'block';
  toggleConnectPanel.textContent = current === 'block' ? 'Connect Portal' : 'Hide Connect Form';
});

// Manual Pairing Toggle
manualToggle.addEventListener('click', () => {
  const current = manualSection.style.display;
  manualSection.style.display = current === 'block' ? 'none' : 'block';
});

async function parseSafeJson(response, fallbackMsg) {
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!response.ok) {
    const errorMsg = data?.error || (text && text.length < 150 && !text.includes('<html') && !text.includes('<!DOCTYPE') ? text : `${fallbackMsg} (status ${response.status})`);
    throw new Error(errorMsg);
  }
  return data || {};
}

// 1-Click Auto Connect (NextKinHR)
document.getElementById('btn-auto-connect').addEventListener('click', async () => {
  const origin = (originInput.value.trim() || 'http://localhost:3000').replace(/\/+$/, '');
  showToast('Connecting to ' + origin + '...');

  try {
    let cookiesList = [];
    try {
      const foundCookies = await chrome.cookies.getAll({ url: origin });
      cookiesList = (foundCookies || []).map(c => ({ name: c.name, value: c.value }));
    } catch (cookieErr) {
      console.warn('Could not read cookies via chrome.cookies:', cookieErr);
    }

    const response = await fetch(origin + '/api/extension/quick-pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cookies: cookiesList })
    });

    const data = await parseSafeJson(response, 'Failed to connect. Please sign in to the portal at ' + origin + ' first.');

    await chrome.storage.local.set({
      origin,
      token: data.token,
      credentialId: data.credentialId,
      user: data.user
    });

    try {
      const cRes = await fetch(origin + '/api/extension/candidates', {
        headers: { Authorization: 'Bearer ' + data.token }
      });
      if (cRes.ok) {
        const cData = await parseSafeJson(cRes, 'Failed to fetch candidates');
        await chrome.storage.local.set({ candidates: cData.candidates || [] });
      }
    } catch {}

    showToast('Connected as ' + (data.user.name || data.user.email) + '!');
    await renderState();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Refresh Candidates
document.getElementById('btn-sync-candidates').addEventListener('click', async () => {
  showToast('Refreshing reviewed profiles...');
  try {
    const { origin = 'http://localhost:3000', token } = await chrome.storage.local.get(['origin', 'token']);
    if (!token) throw new Error('Not connected to portal.');

    const res = await fetch(origin + '/api/extension/candidates', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await parseSafeJson(res, 'Failed to fetch candidates.');

    await chrome.storage.local.set({ candidates: data.candidates || [] });
    showToast('Synced ' + (data.candidates || []).length + ' candidates!');
    await renderState();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Open Submissions
document.getElementById('btn-open-portal').addEventListener('click', async () => {
  const { origin = 'http://localhost:3000' } = await chrome.storage.local.get('origin');
  chrome.tabs.create({ url: origin + '/dashboard/submissions' });
});

// Disconnect NextKinHR
document.getElementById('btn-disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token', 'credentialId', 'user', 'candidates', 'candidateRole', 'ownCandidateId', 'outbox']);
  showToast('Disconnected from NextKinHR.');
  await renderState();
});

// Manual Pairing with 5-minute code
document.getElementById('btn-manual-pair').addEventListener('click', async () => {
  const origin = (originInput.value.trim() || 'http://localhost:3000').replace(/\/+$/, '');
  const code = codeInput.value.trim();
  if (!code) {
    showToast('Please enter the pairing code from the portal.', true);
    return;
  }
  showToast('Pairing with code...');
  try {
    const r = await fetch(origin + '/api/extension/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await parseSafeJson(r, 'Pairing failed.');
    await chrome.storage.local.set({
      origin,
      token: data.token,
      credentialId: data.credentialId
    });
    codeInput.value = '';
    showToast('Pairing successful!');
    await renderState();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Shared profiles pushed from NextKinHR
const sharedProfilesList = document.getElementById('shared-profiles-list');
const sharedProfilesStatus = document.getElementById('shared-profiles-status');

async function loadSharedProfiles() {
  if (!sharedProfilesList) return;
  sharedProfilesStatus.textContent = 'Loading shared profiles...';
  sharedProfilesList.replaceChildren();
  try {
    const res = await chrome.runtime.sendMessage({ type: 'get_pushed_candidates' });
    if (res?.error) { sharedProfilesStatus.textContent = res.error; return; }
    const shares = res?.shares || [];
    if (!shares.length) { sharedProfilesStatus.textContent = 'No profiles have been shared with you yet.'; return; }
    sharedProfilesStatus.textContent = shares.length + ' shared profile(s).';
    for (const share of shares) {
      const cand = share.candidate;
      if (!cand) continue;
      const row = document.createElement('div');
      row.style.cssText = 'padding: 8px; border-bottom: 1px solid var(--border);';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:6px;';
      const left = document.createElement('div');
      left.innerHTML = `<strong style="font-size:12px;">${escapeHtml(cand.full_name || 'Candidate')}</strong>` +
        `<div style="font-size:10.5px;color:var(--muted);">${cand.current_job_title || 'Role not recorded'} · pushed ${new Date(share.created_at).toLocaleDateString()}</div>`;
      const useBtn = document.createElement('button');
      useBtn.className = 'btn btn-outline';
      useBtn.style.cssText = 'font-size:10px;padding:3px 8px;width:auto;margin:0;';
      useBtn.textContent = 'Use this profile';
      useBtn.onclick = async () => {
        useBtn.disabled = true; useBtn.textContent = '...';
        try {
          const saved = await chrome.runtime.sendMessage({ type: 'save_shared_candidate', candidateId: cand.id });
          if (saved?.error) { showToast(saved.error, true); return; }
          showToast('Using ' + (saved.candidate.full_name || cand.full_name) + ' for autofill and ATS matching.');
          await renderState(); await populateCandidateDropdown();
        } catch (e) { showToast('Failed to use profile: ' + e.message, true); }
        finally { useBtn.disabled = false; useBtn.textContent = 'Use this profile'; }
      };
      head.appendChild(left); head.appendChild(useBtn);
      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:10.5px;color:var(--muted);margin-top:4px;';
      const skills = cand.primary_skills ? cand.primary_skills.split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];
      meta.textContent = [cand.email, cand.phone, cand.current_city && cand.current_state ? cand.current_city + ', ' + cand.current_state : null]
        .filter(Boolean).join(' · ');
      const chips = document.createElement('div');
      chips.style.cssText = 'display:flex; flex-wrap:wrap; gap:3px; margin-top:5px;';
      for (const skill of skills.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = 'skill-chip'; chip.textContent = skill;
        chips.appendChild(chip);
      }
      row.append(head, meta, chips);
      sharedProfilesList.appendChild(row);
    }
  } catch (err) { sharedProfilesStatus.textContent = 'Error: ' + err.message; }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Initial render
void renderState();
void populateCandidateDropdown();
void loadSharedProfiles();

// Download active candidate resume. Prefer the most recent AI-tailored version
// for this candidate (generated from a real JD); fall back to a general DOCX.
document.getElementById('btn-download-active-resume')?.addEventListener('click', async () => {
  const { uploadedCandidate, candidates } = await chrome.storage.local.get(['uploadedCandidate', 'candidates']);
  const candidate = uploadedCandidate || (candidates && candidates[0]);
  if (!candidate) {
    showToast('No active candidate resume found to download.', true);
    return;
  }
  showToast('Preparing DOCX download...');
  try {
    const engine = globalThis.NextkinResume;
    if (!engine) throw new Error('Resume engine not loaded.');

    // Prefer a saved AI-tailored version for this candidate.
    let downloaded = false;
    try {
      const history = await chrome.runtime.sendMessage({ type: 'list_resume_versions', candidateId: candidate.id, limit: 1 });
      const latest = history?.versions?.[0];
      if (latest) {
        const detail = await chrome.runtime.sendMessage({ type: 'get_saved_resume', candidateId: candidate.id, scopeKey: latest.scopeKey });
        if (detail?.docxBase64 || detail?.result?.markdown) {
          const bytes = detail.docxBase64 ? Uint8Array.from(atob(detail.docxBase64), c => c.charCodeAt(0)) : engine.resumeDocx(detail.result.markdown);
          const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = detail.filename || `${(latest.companyName || 'Tailored')}_Resume.docx`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showToast('Downloaded AI-tailored resume for ' + (latest.companyName || 'this role') + '!');
          downloaded = true;
        }
      }
    } catch { /* fall through to the general build */ }

    if (!downloaded) {
      const resumeObj = engine.buildResume(candidate, {
        jobTitle: candidate.current_job_title || 'Software Professional',
        companyName: 'General Applications',
        jobDescription: candidate.summary || 'General applications and matching positions.'
      });
      const bytes = engine.resumeDocx(resumeObj.markdown);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(candidate.full_name || 'Resume').replace(/[^a-zA-Z0-9_-]+/g, '_')}_Resume.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Downloaded general resume for ' + candidate.full_name + '! Open a job and choose Tailor Resume for an AI-tailored version.');
    }
  } catch (err) {
    showToast('Download error: ' + err.message, true);
  }
});

// Load saved resumes history
const btnLoadHistory = document.getElementById('btn-load-history');
const historyCandidateSelect = document.getElementById('history-candidate');
const savedResumesList = document.getElementById('saved-resumes-list');
const savedResumesStatus = document.getElementById('saved-resumes-status');

async function populateCandidateDropdown() {
  if (!historyCandidateSelect) return;
  const { uploadedCandidate, candidates = [] } = await chrome.storage.local.get(['uploadedCandidate', 'candidates']);
  historyCandidateSelect.replaceChildren();
  if (uploadedCandidate) {
    const opt = document.createElement('option');
    opt.value = uploadedCandidate.id;
    opt.textContent = `[Uploaded] ${uploadedCandidate.full_name}`;
    historyCandidateSelect.appendChild(opt);
  }
  for (const c of candidates) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.full_name;
    historyCandidateSelect.appendChild(opt);
  }
}

btnLoadHistory?.addEventListener('click', async () => {
  const candidateId = historyCandidateSelect?.value;
  if (!candidateId) {
    savedResumesStatus.textContent = 'Select a candidate first.';
    return;
  }
  savedResumesStatus.textContent = 'Loading saved versions...';
  savedResumesList.replaceChildren();
  try {
    const res = await chrome.runtime.sendMessage({ type: 'list_resume_versions', candidateId });
    if (res?.error) throw new Error(res.error);
    const versions = res?.versions || [];
    if (!versions.length) {
      savedResumesStatus.textContent = 'No saved tailored resumes found for this candidate.';
      return;
    }
    savedResumesStatus.textContent = `Found ${versions.length} saved version(s).`;
    for (const v of versions) {
      const row = document.createElement('div');
      row.style.cssText = 'padding: 8px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 6px;';
      const info = document.createElement('div');
      const missing = (v.missingSkills || v.ats?.missing || []).slice(0, 6);
      const missingHtml = missing.length
        ? `<div style="font-size:10px;color:#f59e0b;margin-top:3px;">Missing: ${missing.map(s => escapeHtml(s)).join(', ')}</div>`
        : '';
      info.innerHTML = `<strong>${v.jobTitle || 'Job Role'}</strong><div style="font-size:10.5px;color:var(--muted);">${v.companyName || ''} · Match: ${v.matchScore != null ? v.matchScore + '%' : 'N/A'}${v.ai ? ' · AI-tailored' : ''}</div>${missingHtml}`;
      const dlBtn = document.createElement('button');
      dlBtn.className = 'btn btn-outline';
      dlBtn.style.cssText = 'font-size:10px;padding:3px 8px;width:auto;margin:0;';
      dlBtn.textContent = '⬇️ DOCX';
      dlBtn.onclick = async () => {
        dlBtn.disabled = true;
        dlBtn.textContent = '...';
        try {
          const detail = await chrome.runtime.sendMessage({ type: 'get_saved_resume', candidateId, scopeKey: v.scopeKey });
          if (!detail?.docxBase64 && !detail?.result?.markdown) throw new Error('No resume data');
          const engine = globalThis.NextkinResume;
          const bytes = detail.docxBase64 ? Uint8Array.from(atob(detail.docxBase64), c => c.charCodeAt(0)) : engine.resumeDocx(detail.result.markdown);
          const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = detail.filename || `${v.companyName || 'Tailored'}_Resume.docx`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showToast('Downloaded ' + a.download + '!');
        } catch (e) {
          showToast('Failed to download: ' + e.message, true);
        } finally {
          dlBtn.disabled = false;
          dlBtn.textContent = '⬇️ DOCX';
        }
      };
      row.appendChild(info);
      row.appendChild(dlBtn);
      savedResumesList.appendChild(row);
    }
  } catch (err) {
    savedResumesStatus.textContent = 'Error: ' + err.message;
  }
});

