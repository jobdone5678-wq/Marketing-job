/* Candidate source review and job-specific resume library. */
(function () {
  const source = document.getElementById('source-resume-text');
  const candidates = document.getElementById('history-candidate');
  const list = document.getElementById('saved-resumes-list');
  const status = document.getElementById('saved-resumes-status');
  async function refreshCandidates() {
    const config = await chrome.storage.local.get(['uploadedCandidate','candidates']);
    source.value = config.uploadedCandidate?.source_text || config.uploadedCandidate?.confirmed_facts?.raw_text || '';
    const active = candidates.value;
    candidates.replaceChildren();
    const history = await chrome.runtime.sendMessage({type:'list_resume_profiles'});
    const uploadedProfiles = history?.profiles || (config.uploadedCandidate ? [config.uploadedCandidate] : []);
    const profiles = [...uploadedProfiles,...(config.candidates || [])];
    for (const profile of profiles) {const option = document.createElement('option');option.value = profile.id;option.textContent = profile.full_name + (profile.archived ? ' · previous upload' : '');candidates.appendChild(option);}
    if (profiles.some(profile => profile.id === active)) candidates.value = active;
  }
  document.getElementById('source-resume-panel').addEventListener('toggle',event => {if (event.target.open) void refreshCandidates();});
  document.getElementById('saved-resumes-panel').addEventListener('toggle',event => {if (event.target.open) void refreshCandidates();});
  document.getElementById('btn-save-source').addEventListener('click',async () => {
    try {
      const candidate = globalThis.NextkinResume.candidateFromText(source.value,'pasted-resume.txt');
      const previous = (await chrome.storage.local.get('uploadedCandidate')).uploadedCandidate;
      if (previous?.full_name === candidate.full_name && previous?.email === candidate.email) candidate.id = previous.id;
      const saved = await chrome.runtime.sendMessage({type:'save_uploaded_resume',candidate});
      if (saved.error) throw new Error(saved.error);
      showToast('Candidate details saved. Reload the job tab, then generate a separate resume for its JD.');
      await renderState();await refreshCandidates();
    } catch (error) {showToast(error.message,true);}
  });
  function download(record) {
    const bytes = Uint8Array.from(atob(record.docxBase64),letter => letter.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
    const anchor = document.createElement('a');anchor.href = url;anchor.download = record.filename;anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  document.getElementById('btn-load-history').addEventListener('click',async () => {
    const candidateId = candidates.value;list.replaceChildren();status.textContent = '';
    if (!candidateId) {status.textContent = 'Select a connected profile or upload candidate details first.';return;}
    async function loadPage(offset) {
      const response = await chrome.runtime.sendMessage({type:'list_resume_versions',candidateId,offset,limit:25});
      if (response.error) {status.textContent = response.error;return;}
      for (const record of response.resumes || []) {
        const row = document.createElement('div');row.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--border);';
        const title = document.createElement('strong');title.textContent = `${record.jobTitle} · ${record.companyName}`;
        const details = document.createElement('p');details.textContent = `ATS estimate: ${record.matchScore == null ? 'Unavailable' : record.matchScore + '%'}${record.createdAt ? ' · ' + new Date(record.createdAt).toLocaleDateString() : ''}`;
        const button = document.createElement('button');button.className = 'btn btn-outline';button.textContent = 'Download this job’s DOCX';
        button.addEventListener('click',async () => {
          const saved = await chrome.runtime.sendMessage({type:'get_saved_resume',candidateId,resumeId:record.resumeId});
          if (saved.error || !saved.docxBase64) status.textContent = saved.error || 'Document unavailable.';else download(saved);
        });
        row.append(title,details,button);list.appendChild(row);
      }
      if (response.nextOffset != null) {
        const more = document.createElement('button');more.className = 'btn btn-outline';more.textContent = 'Load more versions';
        more.addEventListener('click',() => {more.remove();void loadPage(response.nextOffset);});list.appendChild(more);
      }
      status.textContent = !list.children.length ? 'No saved versions yet. Open a job and choose Tailor Resume.' : 'Original and previous job versions remain separate.';
    }
    await loadPage(0);
  });
})();
